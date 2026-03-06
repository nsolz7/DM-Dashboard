"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

import { Button as BitButton, type ButtonProps as BitButtonProps } from "@/components/ui/8bit/button";

type PixelButtonVariant = "primary" | "secondary" | "ghost" | "danger";

interface PixelButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: PixelButtonVariant;
  children: ReactNode;
}

const variantMap: Record<PixelButtonVariant, NonNullable<BitButtonProps["variant"]>> = {
  primary: "default",
  secondary: "secondary",
  ghost: "ghost",
  danger: "destructive"
};

export function PixelButton({
  children,
  className = "",
  type = "button",
  variant = "primary",
  ...props
}: PixelButtonProps) {
  return (
    <BitButton className={className} type={type} variant={variantMap[variant]} {...props}>
      {children}
    </BitButton>
  );
}
