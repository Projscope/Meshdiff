import { useState } from "react";
import { WAITLIST_ENDPOINT } from "../lib/api";

type Status = "idle" | "submitting" | "success" | "error";

function useWaitlistSubmit() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("submitting");
    setErrorMessage(null);

    try {
      const response = await fetch(WAITLIST_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await response.json()) as { success: boolean; error?: string };
      if (!data.success) {
        setStatus("error");
        setErrorMessage(data.error ?? "Something went wrong");
        return;
      }
      setStatus("success");
    } catch {
      setStatus("error");
      setErrorMessage("Couldn't reach the server — try again in a moment");
    }
  }

  return { email, setEmail, status, errorMessage, handleSubmit };
}

export default function WaitlistForm() {
  const { email, setEmail, status, errorMessage, handleSubmit } = useWaitlistSubmit();

  if (status === "success") {
    return (
      <p className="text-sm text-accent-400">
        You&apos;re on the list — we&apos;ll let you know when it ships.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <input
        type="email"
        required
        placeholder="you@studio.com"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        className="w-full rounded-lg border border-ink-700 bg-ink-900 px-4 py-3 text-sm text-ink-100 placeholder:text-ink-600"
      />
      <button
        type="submit"
        disabled={status === "submitting"}
        className="w-full rounded-full bg-accent-400 px-4 py-3 text-sm font-bold text-chrome-950 hover:bg-accent-300 disabled:opacity-50"
      >
        {status === "submitting" ? "Submitting…" : "Get Early Access"}
      </button>
      {status === "error" && errorMessage && (
        <span className="text-xs text-red-400">{errorMessage}</span>
      )}
    </form>
  );
}

export function CompactWaitlistForm() {
  const { email, setEmail, status, errorMessage, handleSubmit } = useWaitlistSubmit();

  if (status === "success") {
    return (
      <p className="text-sm text-accent-400">
        You&apos;re on the list — we&apos;ll let you know when it ships.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col items-center gap-2">
      <div className="flex w-full max-w-sm gap-2">
        <input
          type="email"
          required
          placeholder="you@studio.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="min-w-0 flex-1 rounded-full border border-ink-700 bg-ink-900 px-4 py-2 text-sm text-ink-100 placeholder:text-ink-600"
        />
        <button
          type="submit"
          disabled={status === "submitting"}
          className="shrink-0 rounded-full bg-accent-400 px-4 py-2 text-sm font-bold text-chrome-950 hover:bg-accent-300 disabled:opacity-50"
        >
          {status === "submitting" ? "…" : "Notify me"}
        </button>
      </div>
      {status === "error" && errorMessage && (
        <span className="text-xs text-red-400">{errorMessage}</span>
      )}
    </form>
  );
}
