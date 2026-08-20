import { Moon, Sun } from "@phosphor-icons/react";
import { useTheme } from "../lib/theme";

export default function ThemeToggle() {
  const [theme, setTheme] = useTheme();
  const isLight = theme === "light";

  return (
    <button
      type="button"
      onClick={() => setTheme(isLight ? "dark" : "light")}
      aria-label={isLight ? "Switch to dark theme" : "Switch to light theme"}
      title={isLight ? "Switch to dark theme" : "Switch to light theme"}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-ink-800 text-ink-400 transition hover:bg-ink-800 hover:text-ink-50"
    >
      {isLight ? <Moon size={15} weight="fill" /> : <Sun size={15} weight="fill" />}
    </button>
  );
}
