"use client";

import type { InputHTMLAttributes } from "react";

export function PixelInput({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full border-2 border-crt-border bg-crt-panel px-4 py-3 text-sm text-crt-text outline-none transition placeholder:text-crt-muted focus:border-crt-accent ${className}`.trim()}
      {...props}
    />
  );
}
