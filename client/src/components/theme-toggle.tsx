import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/hooks/useTheme";

/** Sun / moon button that switches the screen between light and dark mode. */
export function ThemeToggle({ className, showLabel = false }: { className?: string; showLabel?: boolean }) {
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";
  const label = dark ? "Light mode" : "Dark mode";
  return (
    <button
      type="button"
      onClick={toggle}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={dark}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md px-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 print:hidden",
        className,
      )}
    >
      {dark ? <Sun className="h-4 w-4 shrink-0 text-amber-500" /> : <Moon className="h-4 w-4 shrink-0" />}
      {showLabel && <span>{label}</span>}
    </button>
  );
}
