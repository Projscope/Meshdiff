import { APP_VERSION } from "../lib/version";

export default function SiteFooter() {
  return (
    <footer className="border-t border-neutral-800 bg-neutral-950 px-6 py-4">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500 text-neutral-950">
            <span className="text-sm font-bold leading-none">^</span>
          </div>
          <span className="text-sm font-semibold text-white">Meshdiff</span>
          <span className="rounded border border-neutral-700 px-1.5 py-0.5 font-mono text-[10px] text-neutral-500">
            v{APP_VERSION}
          </span>
        </div>

        <div className="flex items-center gap-4 font-mono text-xs text-neutral-500">
          <a href="/privacy" className="hover:text-neutral-300">
            Privacy Policy
          </a>
          <span>
            Developed by{" "}
            <a
              href="https://projscope.com"
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-emerald-400 hover:text-emerald-300"
            >
              projscope
            </a>
          </span>
        </div>
      </div>
    </footer>
  );
}
