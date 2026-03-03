import { PixelPanel } from "@/components/ui/PixelPanel";

interface ErrorStateProps {
  title?: string;
  body: string;
}

export function ErrorState({ title = "Read Error", body }: ErrorStateProps) {
  return (
    <PixelPanel className="space-y-2 border-crt-danger text-center">
      <p className="text-xs font-bold uppercase tracking-[0.3em] text-crt-danger">{title}</p>
      <p className="text-sm text-crt-muted">{body}</p>
    </PixelPanel>
  );
}
