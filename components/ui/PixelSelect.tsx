"use client";

import type { SelectHTMLAttributes } from "react";

export function PixelSelect({ children, className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`w-full border-2 border-crt-border bg-crt-panel px-4 py-3 text-sm text-crt-text outline-none transition focus:border-crt-accent ${className}`.trim()}
      {...props}
    >
      {children}
    </select>
  );
}
