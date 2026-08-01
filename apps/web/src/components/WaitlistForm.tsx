import { useState } from "react";
import { API_BASE_URL } from "../lib/api";

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
      const response = await fetch(`${API_BASE_URL}/waitlist`, {
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-start">
      <div className="flex flex-col gap-1">
        <div className="flex gap-2">
          <input
            type="email"
            required
            placeholder="you@company.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-64 rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600"
          />
          <button
            type="submit"
            disabled={status === "submitting"}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {status === "submitting" ? "Submitting…" : "Notify me"}
          </button>
        </div>
        {status === "error" && errorMessage && (
          <span className="text-xs text-red-400">{errorMessage}</span>
        )}
      </div>
    </form>
  );
}
