import type { ReactNode } from "react";

interface PixelPanelProps {
  children: ReactNode;
  className?: string;
}

export function PixelPanel({ children, className = "" }: PixelPanelProps) {
  return (
    <section
      className={`border-2 border-crt-border bg-crt-panel/95 p-4 shadow-pixel ${className}`.trim()}
    >
      {children}
    </section>
  );
}
