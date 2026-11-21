import { SyncError } from "./errors";
import type { CloudConfig } from "./config";

/** Where the signed-in session is kept between launches. Implementations must encrypt it. */
export interface SecretStore {
  read(): string | null;
  write(value: string): void;
  clear(): void;
}

interface Session {
  accessToken: string;
  refreshToken: string;
  /** Epoch milliseconds. */
  expiresAt: number;
  email: string;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user?: { email?: string };
  error?: string;
  error_code?: string;
  error_description?: string;
  msg?: string;
}

type Fetch = typeof fetch;

/** Refresh a little early so a request never goes out with a token about to expire. */
const REFRESH_MARGIN_MS = 60_000;
const REQUEST_TIMEOUT_MS = 20_000;

/**
 * Signs in to the same Meshdiff accounts as the website, talking to Supabase
 * Auth directly. The password is sent once to sign in and never stored; only the
 * session tokens are kept, encrypted by the operating system.
 */
export class AuthService {
  private session: Session | null = null;
  private loaded = false;
  private refreshing: Promise<Session> | null = null;

  constructor(
    private readonly config: CloudConfig,
    private readonly secrets: SecretStore,
    private readonly fetchImpl: Fetch = fetch,
    private readonly clock: () => number = Date.now,
  ) {}

  get email(): string | null {
    this.load();
    return this.session?.email ?? null;
  }

  get signedIn(): boolean {
    this.load();
    return this.session !== null;
  }

  async signIn(email: string, password: string): Promise<void> {
    const trimmed = email.trim();
    if (!trimmed || !password) throw new SyncError("unauthorized", "Enter your email and password.");
    const body = await this.token("password", { email: trimmed, password });
    this.adopt(this.toSession(body, trimmed));
  }

  async signOut(): Promise<void> {
    this.load();
    const token = this.session?.accessToken;
    this.forget();
    if (!token) return;
    // Best effort: the local session is already gone, which is what matters here.
    try {
      await this.fetchImpl(`${this.config.supabaseUrl}/auth/v1/logout`, {
        method: "POST",
        headers: { apikey: this.config.supabaseAnonKey, Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      /* offline: nothing more to do */
    }
  }

  /** A valid access token, refreshing it first if it is about to expire. */
  async getAccessToken(): Promise<string> {
    this.load();
    if (!this.session) throw new SyncError("unauthorized", "Sign in to sync with your team.");
    if (this.session.expiresAt - this.clock() > REFRESH_MARGIN_MS) return this.session.accessToken;
    return (await this.refresh()).accessToken;
  }

  /** Forces a refresh, e.g. after the API said the token was rejected. */
  async refresh(): Promise<Session> {
    this.load();
    const current = this.session;
    if (!current) throw new SyncError("unauthorized", "Sign in to sync with your team.");
    // Several requests can notice an expiring token at once; they share one refresh
    // (a refresh token is single-use, so a second concurrent one would fail).
    this.refreshing ??= (async () => {
      try {
        const body = await this.token("refresh_token", { refresh_token: current.refreshToken });
        const next = this.toSession(body, current.email);
        this.adopt(next);
        return next;
      } catch (error) {
        // Only a refused refresh token ends the session; being offline must not sign the user out.
        if (error instanceof SyncError && error.kind === "unauthorized") this.forget();
        throw error;
      } finally {
        this.refreshing = null;
      }
    })();
    return this.refreshing;
  }

  private load(): void {
    if (this.loaded) return;
    this.loaded = true;
    let raw: string | null = null;
    try {
      raw = this.secrets.read();
    } catch {
      raw = null;
    }
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Partial<Session>;
      if (
        typeof parsed.accessToken === "string" &&
        typeof parsed.refreshToken === "string" &&
        typeof parsed.expiresAt === "number" &&
        typeof parsed.email === "string"
      ) {
        this.session = parsed as Session;
      }
    } catch {
      this.secrets.clear();
    }
  }

  private adopt(session: Session): void {
    this.session = session;
    this.loaded = true;
    try {
      this.secrets.write(JSON.stringify(session));
    } catch {
      // Couldn't persist (e.g. no OS encryption available): stay signed in for this run only.
    }
  }

  private forget(): void {
    this.session = null;
    this.loaded = true;
    try {
      this.secrets.clear();
    } catch {
      /* nothing to clear */
    }
  }

  private toSession(body: TokenResponse, fallbackEmail: string): Session {
    if (!body.access_token || !body.refresh_token || typeof body.expires_in !== "number") {
      throw new SyncError("server", "Meshdiff sent an unexpected sign-in reply. Try again in a moment.");
    }
    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token,
      expiresAt: this.clock() + body.expires_in * 1000,
      email: body.user?.email ?? fallbackEmail,
    };
  }

  private async token(grantType: "password" | "refresh_token", payload: Record<string, string>): Promise<TokenResponse> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.config.supabaseUrl}/auth/v1/token?grant_type=${grantType}`, {
        method: "POST",
        headers: { apikey: this.config.supabaseAnonKey, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new SyncError("offline", "Couldn't reach Meshdiff. Check your internet connection and try again.");
    }
    let body: TokenResponse = {};
    try {
      body = (await response.json()) as TokenResponse;
    } catch {
      /* keep the empty body */
    }
    if (response.ok) return body;

    if (response.status === 400 || response.status === 401 || response.status === 422) {
      const code = body.error_code ?? body.error ?? "";
      if (grantType === "refresh_token") {
        throw new SyncError("unauthorized", "Your session has expired. Sign in again to keep syncing.");
      }
      if (code === "email_not_confirmed") {
        throw new SyncError("unauthorized", "Confirm your email address first (check your inbox), then sign in.");
      }
      throw new SyncError("unauthorized", "That email and password don't match. Check them and try again.");
    }
    if (response.status === 429) throw new SyncError("server", "Too many attempts. Wait a minute and try again.");
    throw new SyncError("server", "Meshdiff had a problem signing you in. Try again in a moment.");
  }
}
