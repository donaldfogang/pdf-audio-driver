"use client";
import { track } from "@/lib/track";
import { MoonIcon, SunIcon } from "./icons";

export default function ThemeToggle() {
  const toggle = () => {
    const dark = document.documentElement.classList.toggle("dark");
    try { localStorage.setItem("theme", dark ? "dark" : "light"); } catch {}
    track("theme_toggle", { theme: dark ? "dark" : "light" });
  };
  return (
    <button onClick={toggle} aria-label="Changer de thème"
      className="grid size-11 place-items-center rounded-full text-muted transition-colors hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-accent">
      <SunIcon className="hidden size-5 dark:block" />
      <MoonIcon className="size-5 dark:hidden" />
    </button>
  );
}
