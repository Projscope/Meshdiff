import { Link } from "react-router-dom";

function LogoMark() {
  return (
    <div aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500 text-neutral-950">
      <span className="text-sm font-bold leading-none">^</span>
    </div>
  );
}

export default function SiteHeader() {
  return (
    <header className="border-b border-neutral-800 bg-neutral-950 px-4 py-3">
      <div className="mx-auto flex max-w-6xl items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <LogoMark />
          <div className="flex items-center gap-1.5 leading-tight">
            <h1 className="text-sm font-semibold text-white">Meshdiff</h1>
            <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-400">
              Free
            </span>
          </div>
        </Link>
        <nav className="hidden items-center gap-6 text-xs text-neutral-400 sm:flex">
          <Link to="/live" className="hover:text-white">
            Diff tool
          </Link>
          <a href="/#pricing" className="hover:text-white">
            Pricing
          </a>
          <a href="/#faq" className="hover:text-white">
            FAQ
          </a>
        </nav>
        <div className="flex items-center gap-3 text-xs">
          <Link
            to="/login"
            className="rounded-full bg-white px-3 py-1.5 font-medium text-neutral-950 hover:bg-neutral-200"
          >
            Sign In
          </Link>
        </div>
      </div>
    </header>
  );
}
