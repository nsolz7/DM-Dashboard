import type { HTMLAttributes, ReactNode } from "react";
import { type VariantProps, cva } from "class-variance-authority";

import { cn } from "@/components/ui/8bit/utils";

import "@/components/ui/8bit/styles/retro.css";

const cardVariants = cva("border-2 border-crt-border bg-crt-panel/95 shadow-pixel", {
  variants: {
    font: {
      normal: "",
      retro: "retro"
    }
  },
  defaultVariants: {
    font: "retro"
  }
});

interface BitCardProps extends HTMLAttributes<HTMLElement>, VariantProps<typeof cardVariants> {}

export function Card({ className, font, ...props }: BitCardProps) {
  return <section className={cn(cardVariants({ font }), className)} {...props} />;
}

interface BitCardSectionProps extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof cardVariants> {
  children: ReactNode;
}

export function CardHeader({ children, className, font, ...props }: BitCardSectionProps) {
  return (
    <div className={cn("px-4 pt-4", font === "retro" && "retro", className)} {...props}>
      {children}
    </div>
  );
}

export function CardContent({ children, className, font, ...props }: BitCardSectionProps) {
  return (
    <div className={cn("px-4 pb-4", font === "retro" && "retro", className)} {...props}>
      {children}
    </div>
  );
}

export function CardFooter({ children, className, font, ...props }: BitCardSectionProps) {
  return (
    <div className={cn("border-t border-crt-border px-4 py-4", font === "retro" && "retro", className)} {...props}>
      {children}
    </div>
  );
}
