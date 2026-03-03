import { PixelPanel } from "@/components/ui/PixelPanel";

interface LoadingPanelProps {
  label?: string;
}

export function LoadingPanel({ label = "Loading..." }: LoadingPanelProps) {
  return (
    <PixelPanel className="flex min-h-[180px] items-center justify-center text-sm text-crt-muted">
      <div className="space-y-3 text-center">
        <div className="mx-auto h-3 w-24 animate-pulse bg-crt-accent/80" />
        <p>{label}</p>
      </div>
    </PixelPanel>
  );
}
