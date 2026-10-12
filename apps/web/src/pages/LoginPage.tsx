import { useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/AuthProvider";

// Where Supabase should send the browser back to after a confirmation-email
// link is clicked. Passed explicitly (not relying solely on config.toml's
// site_url) so this keeps working even if that config value ever drifts
// from wherever the app actually happens to be running.
function emailRedirectTo(): string {
  return `${window.location.origin}/login`;
}

function passwordResetRedirectTo(): string {
  return `${window.location.origin}/reset-password`;
}

export default function LoginPage() {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Landing page's "Subscribe to Pro" sends signed-out visitors here with
  // ?mode=signup — see LandingPage.tsx's handleProCheckout.
  const [mode, setMode] = useState<"signin" | "signup" | "reset">(
    searchParams.get("mode") === "signup" ? "signup" : "signin",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [signupMessage, setSignupMessage] = useState<string | null>(null);
  // Set whenever the user needs to confirm their email before they can sign
  // in — either right after signing up, or after a sign-in attempt was
  // rejected for exactly that reason. Drives the "Resend" button, which
  // needs to know which address to resend to.
  const [pendingConfirmationEmail, setPendingConfirmationEmail] = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  if (!isLoading && user) {
    return <Navigate to="/projects" replace />;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setSignupMessage(null);
    setResendMessage(null);
    setPendingConfirmationEmail(null);
    setResetMessage(null);

    if (mode === "reset") {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: passwordResetRedirectTo(),
      });
      setIsSubmitting(false);
      if (resetError) {
        setError(resetError.message);
        return;
      }
      // Supabase doesn't reveal whether the address actually has an
      // account (same response either way) — showing anything else here
      // would leak which emails are registered.
      setResetMessage("If an account exists for that email, a reset link is on its way.");
      return;
    }

    if (mode === "signin") {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      setIsSubmitting(false);
      if (signInError) {
        // Supabase's own message ("Email not confirmed") is accurate but
        // gives no way forward — swap in a dedicated state with a resend
        // action instead of just echoing it.
        if (signInError.code === "email_not_confirmed") {
          setError("Confirm your email before signing in.");
          setPendingConfirmationEmail(email);
        } else {
          setError(signInError.message);
        }
        return;
      }
      navigate("/projects");
    } else {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: emailRedirectTo() },
      });
      setIsSubmitting(false);
      if (signUpError) {
        setError(signUpError.message);
        return;
      }
      if (data.session) {
        // Confirmations are off (or Supabase auto-confirmed) — already
        // signed in, same as a normal sign-in.
        navigate("/projects");
        return;
      }
      setSignupMessage("Check your email to confirm your account, then sign in.");
      setPendingConfirmationEmail(email);
      setMode("signin");
    }
  }

  async function handleResendConfirmation() {
    if (!pendingConfirmationEmail) return;
    setIsResending(true);
    setResendMessage(null);
    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email: pendingConfirmationEmail,
      options: { emailRedirectTo: emailRedirectTo() },
    });
    setIsResending(false);
    setResendMessage(resendError ? resendError.message : "Sent — check your inbox.");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-950 px-4">
      <div className="w-full max-w-sm rounded-lg border border-ink-800 bg-ink-900 p-6">
        <h1 className="text-lg font-semibold text-ink-50">
          {mode === "signin" ? "Sign in to Meshdiff" : mode === "signup" ? "Create an account" : "Reset your password"}
        </h1>
        <p className="mt-1 text-xs text-ink-500">
          {mode === "signin"
            ? "Access your saved projects."
            : mode === "signup"
              ? "Save projects and track versions."
              : "Enter your email and we'll send you a reset link."}
        </p>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-2">
          <input
            type="email"
            required
            autoFocus
            placeholder="you@company.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="rounded-sm border border-ink-700 bg-ink-950 px-3 py-2 text-sm text-ink-100 placeholder:text-ink-600"
          />
          {mode !== "reset" && (
            <input
              type="password"
              required
              minLength={6}
              placeholder="Password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="rounded-sm border border-ink-700 bg-ink-950 px-3 py-2 text-sm text-ink-100 placeholder:text-ink-600"
            />
          )}
          {mode === "signin" && (
            <button
              type="button"
              onClick={() => {
                setMode("reset");
                setError(null);
                setSignupMessage(null);
                setPendingConfirmationEmail(null);
                setResendMessage(null);
                setResetMessage(null);
              }}
              className="self-end text-xs text-ink-500 hover:text-ink-300"
            >
              Forgot password?
            </button>
          )}
          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-1 rounded-sm bg-indigo-600 px-4 py-2 text-sm font-medium text-ink-50 hover:bg-indigo-500 disabled:opacity-50"
          >
            {isSubmitting
              ? mode === "signin"
                ? "Signing in…"
                : mode === "signup"
                  ? "Creating account…"
                  : "Sending…"
              : mode === "signin"
                ? "Sign In"
                : mode === "signup"
                  ? "Sign Up"
                  : "Send reset link"}
          </button>
          {error && <span className="text-xs text-red-400">{error}</span>}
          {signupMessage && <span className="text-xs text-accent-fg-400">{signupMessage}</span>}
          {resetMessage && <span className="text-xs text-accent-fg-400">{resetMessage}</span>}
          {pendingConfirmationEmail && (
            <div className="mt-1 flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleResendConfirmation()}
                disabled={isResending}
                className="text-xs text-indigo-400 hover:text-indigo-300 disabled:opacity-50"
              >
                {isResending ? "Sending…" : "Resend confirmation email"}
              </button>
              {resendMessage && <span className="text-xs text-ink-500">{resendMessage}</span>}
            </div>
          )}
        </form>

        <button
          type="button"
          onClick={() => {
            setMode(mode === "signup" ? "signin" : mode === "reset" ? "signin" : "signup");
            setError(null);
            setSignupMessage(null);
            setPendingConfirmationEmail(null);
            setResendMessage(null);
            setResetMessage(null);
          }}
          className="mt-4 text-xs text-ink-500 hover:text-ink-300"
        >
          {mode === "signin" ? "Need an account? Sign up" : mode === "signup" ? "Already have an account? Sign in" : "Back to sign in"}
        </button>
      </div>
    </div>
  );
}
