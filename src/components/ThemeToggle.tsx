import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export type Theme = "light" | "dark";

interface Props {
  value: Theme;
  onChange: (theme: Theme) => void;
}

export default function ThemeToggle({ value, onChange }: Props) {
  const [theme, setTheme] = useState<Theme>(value);

  useEffect(() => setTheme(value), [value]);

  useEffect(() => {
    document.documentElement.className = theme;
    try {
      localStorage.setItem("trackd-theme", theme);
    } catch {
      /* storage unavailable */
    }
    if (theme !== value) onChange(theme);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  return (
    <button
      className="btn-outline h-9 w-9 !p-0"
      aria-label="Toggle color theme"
      title="Toggle light / dark"
      onClick={() => setTheme(theme === "light" ? "dark" : "light")}
    >
      {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
    </button>
  );
}
