import { describe, expect, it, vi } from "vitest";
import { AuthService, type SecretStore } from "./auth";
import type { CloudConfig } from "./config";
import { SyncError } from "./errors";

const config: CloudConfig = { apiUrl: "https://api.test", supabaseUrl: "https://sb.test", supabaseAnonKey: "anon-key" };

class MemorySecrets implements SecretStore {
  value: string | null = null;
  writes = 0;
  read = () => this.value;
  write = (v: string) => {
    this.value = v;
    this.writes++;
  };
  clear = () => {
    this.value = null;
  };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const tokens = (access: string, refresh = "r-" + access, expiresIn = 3600) => ({ access_token: access, refresh_token: refresh, expires_in: expiresIn, user: { email: "me@acme.test" } });

function setup(handler: (url: string, init: RequestInit) => Response | Promise<Response>, now = { t: 1_000_000 }) {
  const secrets = new MemorySecrets();
  const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => handler(String(url), init ?? {}));
  const auth = new AuthService(config, secrets, fetchMock as unknown as typeof fetch, () => now.t);
  return { auth, secrets, fetchMock, now };
}

const kindOf = async (promise: Promise<unknown>) => {
  const error = await promise.then(() => null, (e: unknown) => e);
  expect(error).toBeInstanceOf(SyncError);
  return (error as SyncError).kind;
};

describe("signing in", () => {
  it("sends the credentials once, to the sign-in endpoint with the public key, and keeps only the tokens", async () => {
    const { auth, secrets, fetchMock } = setup(() => json(tokens("a1")));
    await auth.signIn("  me@acme.test ", "hunter2");

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://sb.test/auth/v1/token?grant_type=password");
    expect((init!.headers as Record<string, string>).apikey).toBe("anon-key");
    expect(JSON.parse(init!.body as string)).toEqual({ email: "me@acme.test", password: "hunter2" });

    expect(auth.signedIn).toBe(true);
    expect(auth.email).toBe("me@acme.test");
    expect(secrets.value).toContain("a1");
    expect(secrets.value).not.toContain("hunter2"); // the password is never stored
  });

  it.each([
    ["wrong credentials", 400, { error_code: "invalid_credentials" }, /don't match/],
    ["an unconfirmed email", 400, { error_code: "email_not_confirmed" }, /Confirm your email/],
  ])("explains %s without saying which part was wrong", async (_label, status, body, message) => {
    const { auth } = setup(() => json(body, status));
    const error = await auth.signIn("me@acme.test", "x").then(() => null, (e: Error) => e);
    expect((error as SyncError).kind).toBe("unauthorized");
    expect(error!.message).toMatch(message);
    expect(auth.signedIn).toBe(false);
  });

  it("reports being offline, and rate limiting, in plain words", async () => {
    expect(await kindOf(setup(() => Promise.reject(new TypeError("fetch failed"))).auth.signIn("a@b.c", "x"))).toBe("offline");
    const limited = await setup(() => json({}, 429)).auth.signIn("a@b.c", "x").then(() => null, (e: Error) => e);
    expect(limited!.message).toMatch(/Too many attempts/);
  });

  it("needs both an email and a password before calling anything", async () => {
    const { auth, fetchMock } = setup(() => json(tokens("a")));
    expect(await kindOf(auth.signIn("", "x"))).toBe("unauthorized");
    expect(await kindOf(auth.signIn("a@b.c", ""))).toBe("unauthorized");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an unexpected reply instead of storing a half-formed session", async () => {
    const { auth, secrets } = setup(() => json({ access_token: "only-this" }));
    expect(await kindOf(auth.signIn("a@b.c", "x"))).toBe("server");
    expect(secrets.value).toBeNull();
  });
});

describe("the session", () => {
  it("is restored from the encrypted store on the next launch", async () => {
    const first = setup(() => json(tokens("a1")));
    await first.auth.signIn("me@acme.test", "x");

    const second = new AuthService(config, first.secrets, (() => Promise.reject(new Error("no network"))) as never, () => 1_000_000);
    expect(second.signedIn).toBe(true);
    expect(await second.getAccessToken()).toBe("a1");
  });

  it("ignores a damaged or unreadable store and starts signed out", () => {
    const secrets = new MemorySecrets();
    secrets.value = "not json{";
    expect(new AuthService(config, secrets, fetch).signedIn).toBe(false);
    expect(secrets.value).toBeNull(); // cleaned up
    const throwing: SecretStore = { read: () => { throw new Error("decrypt failed"); }, write: () => undefined, clear: () => undefined };
    expect(new AuthService(config, throwing, fetch).signedIn).toBe(false);
  });

  it("refuses to hand out a token when signed out", async () => {
    expect(await kindOf(setup(() => json({})).auth.getAccessToken())).toBe("unauthorized");
  });

  it("refreshes shortly before the token expires, and uses the new one", async () => {
    let n = 0;
    const { auth, now, fetchMock } = setup((url) => json(url.includes("refresh_token") ? tokens("a2") : tokens("a1", "r1", 3600)));
    await auth.signIn("me@acme.test", "x");
    expect(await auth.getAccessToken()).toBe("a1");
    n = fetchMock.mock.calls.length;

    now.t += 3600 * 1000 - 30_000; // 30 seconds left: inside the safety margin
    expect(await auth.getAccessToken()).toBe("a2");
    expect(fetchMock.mock.calls.length).toBe(n + 1);
    expect(String(fetchMock.mock.calls.at(-1)![0])).toContain("grant_type=refresh_token");
    expect(JSON.parse(fetchMock.mock.calls.at(-1)![1]!.body as string)).toEqual({ refresh_token: "r1" });
  });

  it("shares one refresh between simultaneous requests (a refresh token works only once)", async () => {
    const { auth, now, fetchMock } = setup(async (url) => {
      if (url.includes("refresh_token")) await new Promise((r) => setTimeout(r, 20));
      return json(url.includes("refresh_token") ? tokens("a2") : tokens("a1"));
    });
    await auth.signIn("me@acme.test", "x");
    now.t += 3600 * 1000;
    const results = await Promise.all([auth.getAccessToken(), auth.getAccessToken(), auth.getAccessToken()]);
    expect(results).toEqual(["a2", "a2", "a2"]);
    expect(fetchMock.mock.calls.filter(([u]) => String(u).includes("refresh_token"))).toHaveLength(1);
  });

  it("signs the user out when the refresh token is refused", async () => {
    const { auth, secrets, now } = setup((url) => (url.includes("refresh_token") ? json({ error: "invalid_grant" }, 400) : json(tokens("a1"))));
    await auth.signIn("me@acme.test", "x");
    now.t += 3600 * 1000;
    expect(await kindOf(auth.getAccessToken())).toBe("unauthorized");
    expect(auth.signedIn).toBe(false);
    expect(secrets.value).toBeNull();
  });

  it("does NOT sign the user out just because they are offline when the token needs refreshing", async () => {
    let offline = false;
    const { auth, now } = setup(() => (offline ? Promise.reject(new TypeError("fetch failed")) : json(tokens("a1"))));
    await auth.signIn("me@acme.test", "x");
    now.t += 3600 * 1000;
    offline = true;
    expect(await kindOf(auth.getAccessToken())).toBe("offline");
    expect(auth.signedIn).toBe(true);
  });
});

describe("signing out", () => {
  it("forgets the session immediately, even if the server can't be told", async () => {
    const { auth, secrets } = setup((url) => (url.endsWith("/logout") ? Promise.reject(new TypeError("offline")) : json(tokens("a1"))));
    await auth.signIn("me@acme.test", "x");
    await auth.signOut();
    expect(auth.signedIn).toBe(false);
    expect(secrets.value).toBeNull();
  });

  it("tells the server too when it can", async () => {
    const { auth, fetchMock } = setup(() => json(tokens("a1")));
    await auth.signIn("me@acme.test", "x");
    await auth.signOut();
    const [url, init] = fetchMock.mock.calls.at(-1)!;
    expect(String(url)).toBe("https://sb.test/auth/v1/logout");
    expect((init!.headers as Record<string, string>).Authorization).toBe("Bearer a1");
  });
});
