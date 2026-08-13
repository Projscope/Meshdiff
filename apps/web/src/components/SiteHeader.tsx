import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/AuthProvider";
import { supabase } from "../lib/supabaseClient";
import { SHOW_MONETIZATION } from "../lib/featureFlags";

function LogoMark() {
  return (
    <div aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500 text-neutral-950">
      <span className="text-base font-bold leading-none">^</span>
    </div>
  );
}

function AnnouncementBar() {
  return (
    <div className="border-b border-neutral-800 bg-neutral-900 px-4 py-2 text-center text-xs text-neutral-300">
      🎉 We launching PRO accounts (Teams in Progress)! —{" "}
      <span className="font-semibold text-amber-400">Launch offer ends Sunday at midnight.</span>{" "}
      <a href="/#pricing" className="font-medium text-neutral-100 hover:text-emerald-300">
        See pricing →
      </a>
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
        className="whitespace-nowrap rounded-full bg-white px-3.5 py-1.5 text-xs font-medium text-neutral-950 hover:bg-neutral-200"
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="sticky top-0 z-40">
      {SHOW_MONETIZATION && <AnnouncementBar />}
      <header className="bg-neutral-950 px-4 py-3">
        <div className="mx-auto flex max-w-6xl items-center justify-between rounded-full border border-neutral-800 bg-neutral-900/60 px-4 md:px-5 py-2.5 backdrop-blur">
          <Link to="/" className="flex items-center gap-2.5 shrink-0">
            <LogoMark />
            <span className="text-base font-semibold text-white">Meshdiff</span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-6 text-sm text-neutral-400">
            <a href="/#features" className="hover:text-neutral-200 transition-colors">
              Features
            </a>
            {SHOW_MONETIZATION && (
              <a href="/#pricing" className="hover:text-neutral-200 transition-colors">
                Pricing
              </a>
            )}
            <Link to="/live" className="hover:text-neutral-200 transition-colors">
              Free Diff tool
            </Link>
            <a href="/#faq" className="hover:text-neutral-200 transition-colors">
              FAQ
            </a>
          </nav>

          {/* User Menu & Mobile Toggle */}
          <div className="flex items-center gap-2 md:gap-3">
            <UserMenu />

            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-800 text-neutral-400 hover:bg-neutral-800 hover:text-white md:hidden"
              aria-label="Toggle navigation menu"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {mobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Dropdown */}
        {mobileMenuOpen && (
          <div className="mx-auto mt-2 max-w-6xl rounded-2xl border border-neutral-800 bg-neutral-900/95 p-3 backdrop-blur md:hidden">
            <nav className="flex flex-col gap-1 text-sm text-neutral-300">
              <a
                href="/#features"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg px-3 py-2 hover:bg-neutral-800 hover:text-white"
              >
                Features
              </a>
              {SHOW_MONETIZATION && (
                <a
                  href="/#pricing"
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-lg px-3 py-2 hover:bg-neutral-800 hover:text-white"
                >
                  Pricing
                </a>
              )}
              <Link
                to="/live"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg px-3 py-2 hover:bg-neutral-800 hover:text-white"
              >
                Free Diff tool
              </Link>
              <a
                href="/#faq"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg px-3 py-2 hover:bg-neutral-800 hover:text-white"
              >
                FAQ
              </a>
            </nav>
          </div>
        )}
      </header>
    </div>
  );
}