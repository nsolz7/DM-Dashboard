import { Suspense } from "react";

import { LoadingPanel } from "@/components/shared/LoadingPanel";
import { CompendiumResults } from "@/components/compendium/CompendiumResults";

export default function CompendiumResultsPage() {
  return (
    <Suspense fallback={<LoadingPanel label="Loading compendium results..." />}>
      <CompendiumResults />
    </Suspense>
  );
}
