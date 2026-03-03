import { LoadingPanel } from "@/components/shared/LoadingPanel";

export default function Loading() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl items-center justify-center px-6">
      <LoadingPanel label="Loading app..." />
    </div>
  );
}
