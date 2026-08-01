import type { PrintabilityStatus } from "@meshdiff/shared/types/diff";
import Viewer from "./components/Viewer";

const gateColor: Record<PrintabilityStatus, string> = {
  pass: "bg-emerald-500",
  warn: "bg-amber-500",
  fail: "bg-red-500",
};

export default function App() {
  const printability: PrintabilityStatus = "warn";

  return (
    <div className="flex h-screen flex-col bg-neutral-900 text-neutral-100">
      <header className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
        <h1 className="text-sm font-semibold tracking-wide">Meshdiff</h1>
        <div className="flex items-center gap-2 text-xs">
          <span className={`h-2 w-2 rounded-full ${gateColor[printability]}`} />
          <span className="uppercase text-neutral-400">{printability}</span>
        </div>
      </header>
      <main className="grid flex-1 grid-cols-2 gap-2 p-2">
        <Viewer label="Version A" />
        <Viewer label="Version B" />
      </main>
    </div>
  );
}
