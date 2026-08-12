import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/AuthProvider";
import { supabase } from "../lib/supabaseClient";
import { SHOW_MONETIZATION } from "../lib/featureFlags";

function LogoMark() {
  return (
    <div aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500 text-neutral-950">
      <span className="text-base font-bold leading-none">^</span>
    </div>
  );
}

function AnnouncementBar() {
  return (
    <div>
      <div className="border-b border-neutral-800 bg-neutral-900 px-4 py-2 text-center text-xs text-neutral-300">
        🎉 We launching PRO accounts (Teams in Progress)! —{" "}
        <span className="font-semibold text-emerald-400">Try for 7 days for free! </span>{" "}
        <a href="/#pricing" className="font-medium text-neutral-100 hover:text-emerald-300">
          No credit card required →
        </a>
      </div>
    </div>
  );
}

function UserMenu() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);

  if (!user) {
    if (!SHOW_MONETIZATION) return null;
    return (
      <Link
        to="/login"
        className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-neutral-950 hover:bg-neutral-200"
      >
        Sign In
      </Link>
    );
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate("/login");
  }

  return (
    <div
      className="relative"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      <button
        type="button"
        className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-800 text-xs font-semibold text-neutral-200 hover:bg-neutral-700"
      >
        {user.email?.[0]?.toUpperCase() ?? "?"}
      </button>
      {isOpen && (
        <div className="absolute right-0 top-full z-10 w-48 overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900 shadow-xl">
          <p className="truncate border-b border-neutral-800 px-3 py-2 text-xs text-neutral-400">{user.email}</p>
          <Link to="/projects" className="block px-3 py-2 text-xs text-neutral-300 hover:bg-neutral-800">
            Projects
          </Link>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="w-full px-3 py-2 text-left text-xs text-neutral-300 hover:bg-neutral-800"
          >
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}

export default function SiteHeader() {
  return (
    <div className="sticky top-0 z-40">
      {SHOW_MONETIZATION && <AnnouncementBar />}
      <header className="bg-neutral-950 px-4 py-3">
        <div className="mx-auto flex max-w-6xl items-center justify-between rounded-full border border-neutral-800 bg-neutral-900/60 px-5 py-2.5 backdrop-blur">
          <Link to="/" className="flex items-center gap-2.5">
            <LogoMark />
            <div className="flex items-center gap-1.5 leading-tight">
              <h1 className="text-base font-semibold text-white">Meshdiff</h1>
            </div>
          </Link>

          <nav className="flex items-right gap-5 text-sm text-neutral-400">
            <a href="/#features" className="hover:text-neutral-200">
              Features
            </a>
            {SHOW_MONETIZATION && (
              <a href="/#pricing" className="hover:text-neutral-200">
                Pricing
              </a>
            )}
            <Link to="/live" className="hover:text-neutral-200">
              Free Diff tool
            </Link>
            <a href="/#faq" className="hover:text-neutral-200">
              FAQ
            </a>
          </nav>

          <UserMenu />
        </div>
      </header>
    </div>
  );
}
