import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/AuthProvider";
import { supabase } from "../lib/supabaseClient";

function LogoMark() {
  return (
    <div aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500 text-neutral-950">
      <span className="text-sm font-bold leading-none">^</span>
    </div>
  );
}

function UserMenu() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);

  if (!user) {
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
    <header className="border-b border-neutral-800 bg-neutral-950 px-4 py-3">
      <div className="mx-auto flex max-w-6xl items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <LogoMark />
          <div className="flex items-center gap-1.5 leading-tight">
            <h1 className="text-sm font-semibold text-white">Meshdiff</h1>
          </div>
        </Link>

        <nav className="flex items-right gap-4 text-xs text-neutral-500">
          <Link to="/live" className="hover:text-neutral-300">
            Free Diff tool
          </Link>
          <a href="/#pricing" className="hover:text-neutral-300">
            Pricing
          </a>
          <a href="/#faq" className="hover:text-neutral-300">
            FAQ
          </a>
        </nav>

        <UserMenu />
      </div>
    </header>
  );
}
