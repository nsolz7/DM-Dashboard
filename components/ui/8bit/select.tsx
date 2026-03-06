"use client";

import type { SelectHTMLAttributes } from "react";
import { type VariantProps, cva } from "class-variance-authority";

import { cn } from "@/components/ui/8bit/utils";

import "@/components/ui/8bit/styles/retro.css";

const selectVariants = cva(
  "w-full border-2 border-crt-border bg-crt-panel px-4 py-3 text-sm text-crt-text outline-none transition focus:border-crt-accent disabled:cursor-not-allowed disabled:opacity-60",
  {
    variants: {
      font: {
        normal: "",
        retro: "retro"
      }
    },
    defaultVariants: {
      font: "retro"
    }
  }
);

export interface SelectProps
  extends SelectHTMLAttributes<HTMLSelectElement>,
    VariantProps<typeof selectVariants> {}

export function Select({ children, className, font, ...props }: SelectProps) {
  return (
    <select className={cn(selectVariants({ font }), className)} {...props}>
      {children}
    </select>
  );
}
