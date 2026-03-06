"use client";

import { type ButtonHTMLAttributes } from "react";
import { type VariantProps, cva } from "class-variance-authority";

import { cn } from "@/components/ui/8bit/utils";

import "@/components/ui/8bit/styles/retro.css";

export const buttonVariants = cva(
  "relative inline-flex items-center justify-center border-2 border-crt-border uppercase transition active:translate-y-[2px] disabled:cursor-not-allowed disabled:opacity-60",
  {
    variants: {
      font: {
        normal: "",
        retro: "retro"
      },
      variant: {
        default: "bg-crt-accent text-crt-bg hover:bg-[#9cf5a4]",
        secondary: "bg-crt-panel-2 text-crt-text hover:bg-[#2a3948]",
        ghost: "bg-transparent text-crt-text hover:bg-white/10",
        destructive: "bg-crt-danger text-crt-bg hover:bg-[#ffb0b0]"
      },
      size: {
        default: "px-4 py-2 text-[11px] tracking-[0.2em] shadow-pixel",
        sm: "px-3 py-2 text-[10px] tracking-[0.16em] shadow-pixel",
        lg: "px-6 py-3 text-xs tracking-[0.24em] shadow-pixel",
        icon: "h-10 w-10 text-sm"
      }
    },
    defaultVariants: {
      font: "retro",
      variant: "default",
      size: "default"
    }
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, font, size, type = "button", variant, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ font, size, variant }), className)} type={type} {...props} />;
}
