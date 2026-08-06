import { useState } from "react";
import { WAITLIST_ENDPOINT } from "../lib/api";

type Status = "idle" | "submitting" | "success" | "error";

export default function WaitlistForm() {
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

  if (status === "success") {
    return (
      <p className="text-sm text-emerald-400">
        You&apos;re on the list — we&apos;ll let you know when it ships.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <input
        type="email"
        required
        placeholder="you@company.com"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600"
      />
      <button
        type="submit"
        disabled={status === "submitting"}
        className="w-full rounded bg-emerald-500 px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-emerald-400 disabled:opacity-50"
      >
        {status === "submitting" ? "Submitting…" : "Get Early Access — 50% Off"}
      </button>
      {status === "error" && errorMessage && (
        <span className="text-xs text-red-400">{errorMessage}</span>
      )}
    </form>
  );
}
