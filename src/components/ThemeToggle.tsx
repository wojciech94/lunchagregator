"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => { setDark(document.documentElement.classList.contains("dark")); }, []);
  return (
    <Button variant="ghost" size="icon" aria-label={dark ? "Włącz tryb jasny" : "Włącz tryb ciemny"} aria-pressed={dark}
      onClick={() => {
        const next = !dark;
        document.documentElement.classList.toggle("dark", next);
        document.cookie = `lunch-theme=${next ? "dark" : "light"}; Path=/; Max-Age=31536000; SameSite=Lax`;
        setDark(next);
      }}>
      {dark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
    </Button>
  );
}
