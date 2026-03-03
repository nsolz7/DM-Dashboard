"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type PixelButtonVariant = "primary" | "secondary" | "ghost" | "danger";

interface PixelButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: PixelButtonVariant;
  children: ReactNode;
}

const variantClasses: Record<PixelButtonVariant, string> = {
  primary: "bg-crt-accent text-crt-bg hover:bg-[#9cf5a4]",
  secondary: "bg-crt-panel-2 text-crt-text hover:bg-[#2a3948]",
  ghost: "bg-transparent text-crt-text hover:bg-white/10",
  danger: "bg-crt-danger text-crt-bg hover:bg-[#ffb0b0]"
};

export function PixelButton({
  children,
  className = "",
  type = "button",
  variant = "primary",
  ...props
}: PixelButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center border-2 border-crt-border px-4 py-2 text-[11px] font-bold uppercase tracking-[0.2em] shadow-pixel transition ${variantClasses[variant]} ${className}`.trim()}
      type={type}
      {...props}
    >
      {children}
    </button>
  );
}
