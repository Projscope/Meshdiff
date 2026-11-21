import { randomUUID } from "node:crypto";

type Row = Record<string, unknown>;
type Result = { data: unknown; error: { message: string; code?: string } | null };

export interface RecordedCall {
  table: string;
  op: "select" | "insert" | "update" | "delete" | "upsert";
  payload?: unknown;
  filters: string[];
  or?: string;
}

/**
 * A small in-memory stand-in for the slice of supabase-js the API routes use,
 * so route tests run the real auth, access and tier logic. It understands
 * eq / is / in / order / limit / select / insert / update / delete / upsert,
 * maybeSingle / single, the `versions!inner` join the comment feed uses, and a
 * registry of rpc functions. `or()` filters are recorded, not evaluated.
 *
 * Tokens are "user:<id>", so a test authenticates with
 * `authorization: "Bearer user:<id>"`.
 */
export class FakeSupabase {
  tables: Record<string, Row[]> = {};
  users = new Map<string, { id: string; email: string; created_at: string }>();
  rpcs: Record<string, (args: Row) => { data: unknown; error?: { message: string; code?: string } | null }> = {};
  calls: RecordedCall[] = [];
  private tick = 0;

  /** Strictly increasing timestamps, so ordering by updated_at is deterministic. */
  now(): string {
    this.tick += 1;
    return new Date(Date.UTC(2026, 5, 1, 0, 0, 0) + this.tick * 1000).toISOString();
  }

  addUser(id: string, email = `${id}@example.test`, createdAt = new Date(Date.now() - 90 * 86_400_000).toISOString()): void {
    this.users.set(id, { id, email, created_at: createdAt });
  }

  seed(table: string, ...rows: Row[]): void {
    (this.tables[table] ??= []).push(...rows);
  }

  rows(table: string): Row[] {
    return (this.tables[table] ??= []);
  }

  callsTo(table: string, op?: RecordedCall["op"]): RecordedCall[] {
    return this.calls.filter((c) => c.table === table && (!op || c.op === op));
  }

  auth = {
    getUser: async (token: string) => {
      const id = token.startsWith("user:") ? token.slice(5) : null;
      if (!id || !this.users.has(id)) return { data: { user: null }, error: { message: "invalid" } };
      return { data: { user: { id } }, error: null };
    },
    admin: {
      getUserById: async (id: string) => ({ data: { user: this.users.get(id) ?? null }, error: null }),
    },
  };

  from(table: string): Query {
    return new Query(this, table);
  }

  rpc(name: string, args: Row = {}) {
    const run = (): Promise<Result> => {
      const handler = this.rpcs[name];
      if (!handler) return Promise.resolve({ data: null, error: null });
      const out = handler(args);
      return Promise.resolve({ data: out.data, error: out.error ?? null });
    };
    return {
      single: run,
      maybeSingle: run,
      then: (res: (r: Result) => unknown, rej?: (e: unknown) => unknown) => run().then(res, rej),
    };
  }
}

class Query {
  private op: RecordedCall["op"] = "select";
  private payload: unknown;
  private matchers: Array<(row: Row) => boolean> = [];
  private filterNotes: string[] = [];
  private orderBy: Array<{ column: string; ascending: boolean }> = [];
  private max: number | null = null;
  private mode: "maybe" | "one" | null = null;
  private joinedProject: string | null = null;
  private orFilter: string | undefined;
  private upsertConflict: string | undefined;

  constructor(
    private db: FakeSupabase,
    private table: string,
  ) {}

  select(columns?: string) {
    // `select()` after insert/update just asks for the rows back.
    void columns;
    return this;
  }
  insert(payload: unknown) {
    this.op = "insert";
    this.payload = payload;
    return this;
  }
  update(payload: unknown) {
    this.op = "update";
    this.payload = payload;
    return this;
  }
  upsert(payload: unknown, options?: { onConflict?: string }) {
    this.op = "upsert";
    this.payload = payload;
    this.upsertConflict = options?.onConflict;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }

  eq(column: string, value: unknown) {
    this.filterNotes.push(`${column}=${String(value)}`);
    if (column === "versions.project_id") {
      this.joinedProject = String(value);
      return this;
    }
    this.matchers.push((r) => r[column] === value);
    return this;
  }
  neq(column: string, value: unknown) {
    this.filterNotes.push(`${column}!=${String(value)}`);
    this.matchers.push((r) => r[column] !== value);
    return this;
  }
  is(column: string, value: unknown) {
    this.filterNotes.push(`${column} is ${String(value)}`);
    this.matchers.push((r) => (r[column] ?? null) === value);
    return this;
  }
  in(column: string, values: unknown[]) {
    this.filterNotes.push(`${column} in [${values.join(",")}]`);
    this.matchers.push((r) => values.includes(r[column]));
    return this;
  }
  or(filter: string) {
    this.orFilter = filter;
    return this;
  }
  order(column: string, options?: { ascending?: boolean }) {
    this.orderBy.push({ column, ascending: options?.ascending ?? true });
    return this;
  }
  limit(n: number) {
    this.max = n;
    return this;
  }
  range(from: number, to: number) {
    this.max = to - from + 1;
    return this;
  }
  maybeSingle() {
    this.mode = "maybe";
    return this.exec();
  }
  single() {
    this.mode = "one";
    return this.exec();
  }

  then(res: (r: Result) => unknown, rej?: (e: unknown) => unknown) {
    return this.exec().then(res, rej);
  }

  private matching(): Row[] {
    let rows = this.db.rows(this.table).filter((r) => this.matchers.every((m) => m(r)));
    if (this.joinedProject) {
      const projectId = this.joinedProject;
      const versionIds = new Set(
        this.db.rows("versions").filter((v) => v.project_id === projectId).map((v) => v.id),
      );
      rows = rows.filter((r) => versionIds.has(r.version_id));
    }
    return rows;
  }

  private async exec(): Promise<Result> {
    this.db.calls.push({
      table: this.table,
      op: this.op,
      payload: this.payload,
      filters: this.filterNotes,
      or: this.orFilter,
    });

    let rows: Row[];
    if (this.op === "insert" || this.op === "upsert") {
      const payloads = (Array.isArray(this.payload) ? this.payload : [this.payload]) as Row[];
      rows = [];
      for (const p of payloads) {
        const row = this.withDefaults(p);
        const existing = this.db.rows(this.table);
        if (this.op === "upsert" && this.upsertConflict) {
          const keys = this.upsertConflict.split(",");
          const hit = existing.find((e) => keys.every((k) => e[k] === row[k]));
          if (hit) {
            Object.assign(hit, row);
            rows.push(hit);
            continue;
          }
        } else if (row.id !== undefined && existing.some((e) => e.id === row.id)) {
          return { data: null, error: { message: "duplicate key value violates unique constraint", code: "23505" } };
        }
        existing.push(row);
        rows.push(row);
      }
    } else if (this.op === "update") {
      rows = this.matching();
      for (const r of rows) {
        Object.assign(r, this.payload as Row);
        // Stands in for the comments_set_updated_at trigger (migration 0042).
        if (this.table === "comments") r.updated_at = this.db.now();
      }
    } else if (this.op === "delete") {
      rows = this.matching();
      const doomed = new Set(rows);
      this.db.tables[this.table] = this.db.rows(this.table).filter((r) => !doomed.has(r));
    } else {
      rows = this.matching();
      for (const { column, ascending } of [...this.orderBy].reverse()) {
        rows = [...rows].sort((a, b) => {
          const x = String(a[column] ?? "");
          const y = String(b[column] ?? "");
          return ascending ? x.localeCompare(y) : y.localeCompare(x);
        });
      }
      if (this.max !== null) rows = rows.slice(0, this.max);
    }

    if (this.mode) {
      if (rows.length === 0) {
        return this.mode === "maybe" ? { data: null, error: null } : { data: null, error: { message: "no rows" } };
      }
      return { data: rows[0], error: null };
    }
    return { data: rows.map((r) => ({ ...r })), error: null };
  }

  private withDefaults(p: Row): Row {
    const row: Row = { ...p };
    if (this.table === "comments") {
      row.id ??= randomUUID();
      row.status ??= "open";
      row.created_at ??= this.db.now();
      row.updated_at = this.db.now();
      row.deleted_at ??= null;
      for (const key of ["parent_comment_id", "assignee_user_id", "priority", "normal_x", "normal_y", "normal_z", "status_changed_at", "status_changed_by_user_id"]) {
        row[key] ??= null;
      }
    }
    return row;
  }
}

