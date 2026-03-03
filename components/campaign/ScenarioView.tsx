"use client";

import { useEffect, useState } from "react";

import type { ScenarioState } from "@/types";
import { BarterPanel } from "@/components/Barter/BarterPanel";
import { RecentTransactions } from "@/components/Barter/RecentTransactions";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { LoadingPanel } from "@/components/shared/LoadingPanel";
import { useCampaign } from "@/components/providers/CampaignProvider";
import { PixelPanel } from "@/components/ui/PixelPanel";
import { getScenarioState } from "@/lib/firebase/firestore";

export function ScenarioView() {
  const { campaignId } = useCampaign();
  const [scenario, setScenario] = useState<ScenarioState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [barterRefreshKey, setBarterRefreshKey] = useState(0);

  useEffect(() => {
    let isMounted = true;

    setIsLoading(true);
    setError(null);

    void getScenarioState(campaignId)
      .then((nextScenario) => {
        if (isMounted) {
          setScenario(nextScenario);
        }
      })
      .catch((loadError) => {
        if (isMounted) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load scenario state.");
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [campaignId]);

  if (isLoading) {
    return <LoadingPanel label="Loading scenario..." />;
  }

  if (error) {
    return <ErrorState body={error} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.35em] text-crt-accent">Scenario</p>
        <h2 className="mt-2 text-3xl font-bold uppercase tracking-[0.12em] text-crt-text">Scene Staging</h2>
        <p className="mt-2 text-sm text-crt-muted">
          Read-only scaffold for the current scenario document. Editing tools can be layered here later.
        </p>
      </div>

      {scenario ? (
        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <PixelPanel className="space-y-4">
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-crt-muted">Current Broadcast</p>
            <div className="space-y-3">
              <p className="text-2xl font-bold uppercase tracking-[0.1em] text-crt-text">{scenario.title ?? "Untitled"}</p>
              <p className="text-sm text-crt-muted">Mode: {scenario.mode ?? "—"}</p>
              <p className="text-sm leading-7 text-crt-text">{scenario.text ?? "No text payload stored yet."}</p>
              <p className="text-xs uppercase tracking-[0.18em] text-crt-muted">
                Image Path: {scenario.imagePath ?? "—"}
              </p>
            </div>
          </PixelPanel>
          <PixelPanel className="space-y-4">
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-crt-muted">List Payload</p>
            {scenario.listItems.length ? (
              <div className="space-y-3">
                {scenario.listItems.map((item, index) => (
                  <div className="border border-crt-border px-3 py-3" key={`${item.label}-${index}`}>
                    <p className="text-sm font-bold uppercase tracking-[0.1em] text-crt-text">{item.label}</p>
                    <p className="mt-1 text-xs text-crt-muted">{item.subtext ?? "—"}</p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState body="No list items are present on the current scenario document." title="No List Data" />
            )}
          </PixelPanel>
        </div>
      ) : (
        <EmptyState body="No scenario/current document exists for the selected campaign yet." title="No Scenario" />
      )}

      <BarterPanel onApplied={() => setBarterRefreshKey((current) => current + 1)} />
      <RecentTransactions
        onTransactionChange={() => setBarterRefreshKey((current) => current + 1)}
        refreshKey={barterRefreshKey}
      />
    </div>
  );
}
