"use client";

import type { SelectHTMLAttributes } from "react";

export function PixelSelect({ children, className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        className={`w-full appearance-none border-2 border-crt-border bg-crt-panel px-4 py-3 pr-11 text-sm font-bold uppercase tracking-[0.08em] text-crt-text shadow-[4px_4px_0_0_rgba(6,12,24,0.45)] outline-none transition focus:border-crt-accent disabled:cursor-not-allowed disabled:opacity-60 ${className}`.trim()}
        {...props}
      >
        {children}
      </select>
      <span
        aria-hidden
        className="pointer-events-none absolute right-3 top-1/2 inline-flex -translate-y-1/2 items-center border-l-2 border-crt-border pl-2 text-[10px] text-crt-accent"
      >
        ▼
      </span>
    </div>
  );
}
