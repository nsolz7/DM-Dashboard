"use client";

import { type InputHTMLAttributes } from "react";
import { type VariantProps, cva } from "class-variance-authority";

import { cn } from "@/components/ui/8bit/utils";

import "@/components/ui/8bit/styles/retro.css";

const inputVariants = cva(
  "w-full border-2 border-crt-border bg-crt-panel px-4 py-3 text-sm text-crt-text outline-none transition placeholder:text-crt-muted focus:border-crt-accent disabled:cursor-not-allowed disabled:opacity-60",
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

export interface InputProps
  extends InputHTMLAttributes<HTMLInputElement>,
    VariantProps<typeof inputVariants> {}

export function Input({ className, font, type = "text", ...props }: InputProps) {
  return <input className={cn(inputVariants({ font }), className)} type={type} {...props} />;
}
