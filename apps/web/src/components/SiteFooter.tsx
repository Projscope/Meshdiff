import { Link } from "react-router-dom";
import { Cube } from "@phosphor-icons/react";
import { APP_VERSION } from "../lib/version";
import { SHOW_MONETIZATION } from "../lib/featureFlags";
import projscopeFavicon from "../assets/projscope-favicon.png";

export default function SiteFooter() {
  return (
    <footer className="border-t border-ink-800 bg-ink-950 px-6 py-10">
      <div className="mx-auto grid max-w-6xl gap-8 sm:grid-cols-2 md:grid-cols-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent-500 text-chrome-950">
              <Cube size={16} weight="bold" />
            </div>
            <span className="font-display text-sm font-semibold text-ink-50">Meshdiff</span>
          </div>
          <p className="mt-2 max-w-[22ch] text-xs text-ink-400">
            See exactly what changed between two 3D models.
          </p>
          <span className="mt-2 inline-block rounded border border-ink-700 px-1.5 py-0.5 font-mono text-[10px] text-ink-400">
            v{APP_VERSION}
          </span>
        </div>

        <div>
          <p className="text-xs font-semibold text-ink-300">Product</p>
          <nav className="mt-3 flex flex-col gap-2 text-xs text-ink-400">
            <Link to="/features" className="hover:text-ink-300">
              Features
            </Link>
            <Link to="/roadmap" className="hover:text-ink-300">
              Roadmap
            </Link>
            {SHOW_MONETIZATION && (
              <a href="/#pricing" className="hover:text-ink-300">
                Pricing
              </a>
            )}
            <Link to="/live" className="hover:text-ink-300">
              Free Diff tool
            </Link>
          </nav>
        </div>

        <div>
          <p className="text-xs font-semibold text-ink-300">Resources</p>
          <nav className="mt-3 flex flex-col gap-2 text-xs text-ink-400">
            <a href="/#faq" className="hover:text-ink-300">
              FAQ
            </a>
            <Link to="/blog" className="hover:text-ink-300">
              Blog
            </Link>
            <Link to="/embed" className="hover:text-ink-300">
              Embed Badge
            </Link>
            {/* TODO: Create privacy policy page and uncomment this link */}
            {/* <a href="/privacy" className="hover:text-ink-300">
              Privacy Policy
            </a> */}
          </nav>
        </div>

        <div>
          <p className="text-xs font-semibold text-ink-300">Company</p>
          <nav className="mt-3 flex flex-col gap-2 text-xs text-ink-400">
            <a
              href="https://projscope.com"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 hover:text-ink-300"
            >
              <img src={projscopeFavicon} alt="" className="h-3.5 w-3.5" />
              Projscope
            </a>
            <a href="mailto:support@projscope.com" className="hover:text-ink-300">
              support@projscope.com
            </a>
          </nav>
        </div>
      </div>

      <div className="mx-auto mt-8 flex max-w-6xl items-center justify-between border-t border-ink-900 pt-4 text-xs text-ink-400">
        <span>© {new Date().getFullYear()} Meshdiff</span>
        <span>
          developed by{" "}
          <a
            href="https://projscope.com"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 align-middle hover:text-ink-300"
          >
            <img src={projscopeFavicon} alt="" className="h-3 w-3" />
            Projscope
          </a>
          .
        </span>
      </div>
    </footer>
  );
}
