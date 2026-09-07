import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/AuthProvider";
import { supabase } from "../lib/supabaseClient";
import { SHOW_MONETIZATION, LAUNCH_OFFER_DEADLINE } from "../lib/featureFlags";
import { useCountdown } from "../hooks/useCountdown";
import ThemeToggle from "./ThemeToggle";

function LogoMark() {
  return (
    <div aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-500 text-chrome-950">
      <span className="text-base font-bold leading-none">^</span>
    </div>
  );
}

function AnnouncementBar() {
  const countdown = useCountdown(LAUNCH_OFFER_DEADLINE);
  if (Date.now() >= LAUNCH_OFFER_DEADLINE.getTime()) return null;

  return (
    <div className="border-b border-ink-800 bg-ink-900 px-4 py-2 text-center text-xs text-ink-300">
      🎉 Pro and Team accounts are live —{" "}
      <span className="font-semibold text-amber-fg-400">
        Launch offer ends Sunday at midnight — 50% off ends in{" "}
      </span>
      <span className="font-semibold text-purple-400">
        <span className="font-mono tabular-nums">{countdown}</span>
      </span>{" "}
      <Link to="/pricing" className="font-medium text-ink-100 hover:text-accent-fg-300">
        See pricing →
      </Link>
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
        className="whitespace-nowrap rounded-lg bg-accent-500 px-3.5 py-1.5 text-xs font-medium text-chrome-950 hover:bg-accent-400"
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
        className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-800 text-xs font-semibold text-ink-200 hover:bg-ink-700"
      >
        {user.email?.[0]?.toUpperCase() ?? "?"}
      </button>
      {isOpen && (
        <div className="absolute right-0 top-full z-10 w-48 overflow-hidden rounded-lg border border-ink-800 bg-ink-900 shadow-xl">
          <p className="truncate border-b border-ink-800 px-3 py-2 text-xs text-ink-400">{user.email}</p>
          <Link to="/projects" className="block px-3 py-2 text-xs text-ink-300 hover:bg-ink-800">
            Projects
          </Link>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="w-full px-3 py-2 text-left text-xs text-ink-300 hover:bg-ink-800"
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
      <header className="bg-ink-950 px-4 py-3">
        <div className="mx-auto flex max-w-6xl items-center justify-between rounded-full border border-ink-800 bg-ink-900/60 px-4 md:px-5 py-2.5 backdrop-blur">
          <Link to="/" className="flex items-center gap-2.5 shrink-0">
            <LogoMark />
            <span className="font-display text-base font-semibold text-ink-50">Meshdiff</span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-6 text-sm text-ink-400">
            <Link to="/features" className="hover:text-ink-200 transition-colors">
              Features
            </Link>
            <Link to="/roadmap" className="hover:text-ink-200 transition-colors">
              Roadmap
            </Link>
            <Link to="/blog" className="hover:text-ink-200 transition-colors">
              Blog
            </Link>
            <Link to="/docs" className="hover:text-ink-200 transition-colors">
              Docs
            </Link>
            {SHOW_MONETIZATION && (
              <Link to="/pricing" className="hover:text-ink-200 transition-colors">
                Pricing
              </Link>
            )}
            <Link to="/live" className="hover:text-ink-200 transition-colors">
              Free Diff tool
            </Link>
            <a href="/#faq" className="hover:text-ink-200 transition-colors">
              FAQ
            </a>
          </nav>

          {/* User Menu & Mobile Toggle */}
          <div className="flex items-center gap-2 md:gap-3">
            <ThemeToggle />
            <UserMenu />

            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-ink-800 text-ink-400 hover:bg-ink-800 hover:text-ink-50 md:hidden"
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
          <div className="mx-auto mt-2 max-w-6xl rounded-2xl border border-ink-800 bg-ink-900/95 p-3 backdrop-blur md:hidden">
            <nav className="flex flex-col gap-1 text-sm text-ink-300">
              <Link
                to="/features"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg px-3 py-2 hover:bg-ink-800 hover:text-ink-50"
              >
                Features
              </Link>
              <Link
                to="/roadmap"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg px-3 py-2 hover:bg-ink-800 hover:text-ink-50"
              >
                Roadmap
              </Link>
              <Link
                to="/blog"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg px-3 py-2 hover:bg-ink-800 hover:text-ink-50"
              >
                Blog
              </Link>
              <Link
                to="/docs"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg px-3 py-2 hover:bg-ink-800 hover:text-ink-50"
              >
                Docs
              </Link>
              {SHOW_MONETIZATION && (
                <Link
                  to="/pricing"
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-lg px-3 py-2 hover:bg-ink-800 hover:text-ink-50"
                >
                  Pricing
                </Link>
              )}
              <Link
                to="/live"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg px-3 py-2 hover:bg-ink-800 hover:text-ink-50"
              >
                Free Diff tool
              </Link>
              <a
                href="/#faq"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg px-3 py-2 hover:bg-ink-800 hover:text-ink-50"
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