import { useState, type FormEvent } from "react";
import { errorMessage } from "../lib/library";
import { sync, useAccount } from "../lib/sync";

/** Settings: sign in to the (optional) Meshdiff cloud, which is what Team sync needs. */
export default function CloudAccountSection() {
  const { account, error: loadError, refresh } = useAccount();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setIsBusy(true);
    setError(null);
    try {
      await sync().signIn(email, password);
      setPassword("");
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
    setIsBusy(false);
  }

  async function signOut() {
    setIsBusy(true);
    setError(null);
    try {
      await sync().signOut();
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
    setIsBusy(false);
  }

  if (loadError) return <p role="alert" className="text-red-300">{loadError}</p>;
  if (!account) return <p className="text-ink-500">Loading…</p>;

  if (!account.configured) {
    return (
      <p data-testid="cloud-unconfigured">
        Team sync isn't set up in this build of Meshdiff. Everything else works as normal and your projects stay on this computer.
      </p>
    );
  }

  if (account.signedIn) {
    return (
      <div data-testid="cloud-account">
        <p>
          Signed in as <strong data-testid="cloud-email-shown" className="text-ink-100">{account.email}</strong>
        </p>
        {account.syncEnabled === true && <p className="mt-1 text-emerald-300">Your plan includes syncing with your team.</p>}
        {account.syncEnabled === false && (
          <p className="mt-1">
            Syncing with a team is part of the Team plan, which this account doesn't have.{" "}
            <button type="button" onClick={() => void sync().openWebsite("pricing")} className="text-accent-fg-400 underline">See plans</button>
          </p>
        )}
        {account.syncEnabled === null && <p className="mt-1 text-ink-500">Couldn't check your plan just now (are you offline?).</p>}
        <button
          type="button"
          data-testid="cloud-signout"
          disabled={isBusy}
          onClick={() => void signOut()}
          className="mt-3 rounded-sm border border-ink-700 px-3 py-2 text-sm text-ink-200 hover:border-ink-500 disabled:opacity-50"
        >
          Sign out
        </button>
        <p className="mt-2 text-xs text-ink-500">Signing out keeps every project and file on this computer. Connected projects just stop syncing until you sign in again.</p>
        {error && <p role="alert" className="mt-2 text-xs text-red-300">{error}</p>}
      </div>
    );
  }

  return (
    <form onSubmit={signIn} data-testid="cloud-signin-form">
      <p>
        You don't need an account to use Meshdiff. Sign in only if you want to sync projects and comments with your team (Team plan).
        It's the same account as on the website.
      </p>
      <div className="mt-3 flex max-w-sm flex-col gap-2">
        <input
          data-testid="cloud-email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Email"
          className="rounded-sm border border-ink-700 bg-ink-950 px-3 py-2 text-sm text-ink-100 placeholder:text-ink-500"
        />
        <input
          data-testid="cloud-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Password"
          className="rounded-sm border border-ink-700 bg-ink-950 px-3 py-2 text-sm text-ink-100 placeholder:text-ink-500"
        />
        <div className="flex items-center gap-3">
          <button
            type="submit"
            data-testid="cloud-signin"
            disabled={isBusy || !email.trim() || !password}
            className="rounded-sm bg-accent-500 px-4 py-2 text-sm font-medium text-chrome-950 hover:bg-accent-400 disabled:opacity-50"
          >
            {isBusy ? "Signing in…" : "Sign in"}
          </button>
          <button type="button" onClick={() => void sync().openWebsite("signup")} className="text-xs text-accent-fg-400 underline">
            Create an account on the website
          </button>
        </div>
      </div>
      {error && <p role="alert" data-testid="cloud-error" className="mt-2 text-xs text-red-300">{error}</p>}
    </form>
  );
}
