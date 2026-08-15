import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

/**
 * Landed on from the link in a password-reset email (see LoginPage.tsx's
 * "reset" mode) — Supabase's client picks up the recovery token from the
 * URL and establishes a real (temporary) session automatically, which is
 * what makes supabase.auth.updateUser() below work without the user
 * re-entering their old password.
 */
export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDone, setIsDone] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setIsSubmitting(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setIsSubmitting(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setIsDone(true);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4">
      <div className="w-full max-w-sm rounded-lg border border-neutral-800 bg-neutral-900 p-6">
        <h1 className="text-lg font-semibold text-white">Set a new password</h1>

        {isDone ? (
          <>
            <p className="mt-2 text-sm text-emerald-400">Password updated — you're signed in.</p>
            <button
              type="button"
              onClick={() => navigate("/projects")}
              className="mt-4 w-full rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
            >
              Go to your projects
            </button>
          </>
        ) : (
          <>
            <p className="mt-1 text-xs text-neutral-500">Choose a new password for your account.</p>
            <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-2">
              <input
                type="password"
                required
                autoFocus
                minLength={6}
                placeholder="New password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600"
              />
              <input
                type="password"
                required
                minLength={6}
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600"
              />
              <button
                type="submit"
                disabled={isSubmitting}
                className="mt-1 rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {isSubmitting ? "Updating…" : "Update password"}
              </button>
              {error && <span className="text-xs text-red-400">{error}</span>}
            </form>
          </>
        )}
      </div>
    </div>
  );
}
