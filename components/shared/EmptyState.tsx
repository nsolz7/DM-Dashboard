import { PixelPanel } from "@/components/ui/PixelPanel";

interface EmptyStateProps {
  title: string;
  body: string;
}

export function EmptyState({ title, body }: EmptyStateProps) {
  return (
    <PixelPanel className="space-y-2 text-center">
      <p className="text-xs font-bold uppercase tracking-[0.3em] text-crt-warn">{title}</p>
      <p className="text-sm text-crt-muted">{body}</p>
    </PixelPanel>
  );
}
