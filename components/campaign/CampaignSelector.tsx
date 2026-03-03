"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import type { Campaign } from "@/types";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { LoadingPanel } from "@/components/shared/LoadingPanel";
import { PixelButton } from "@/components/ui/PixelButton";
import { PixelPanel } from "@/components/ui/PixelPanel";
import { setSelectedCampaignIdInBrowser } from "@/lib/campaignSelection";
import { listCampaigns } from "@/lib/firebase/firestore";

export function CampaignSelector() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadCampaigns() {
      try {
        const nextCampaigns = await listCampaigns();

        if (!isMounted) {
          return;
        }

        setCampaigns(nextCampaigns);
        setSelectedCampaignId(nextCampaigns[0]?.id ?? "");
      } catch (loadError) {
        if (!isMounted) {
          return;
        }

        setError(loadError instanceof Error ? loadError.message : "Unable to load campaigns.");
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadCampaigns();

    return () => {
      isMounted = false;
    };
  }, []);

  function enterCampaign() {
    if (!selectedCampaignId) {
      return;
    }

    setIsSubmitting(true);
    setSelectedCampaignIdInBrowser(selectedCampaignId);
    router.push("/dashboard");
  }

  if (isLoading) {
    return <LoadingPanel label="Loading campaigns..." />;
  }

  if (error) {
    return <ErrorState body={error} />;
  }

  if (!campaigns.length) {
    return (
      <EmptyState
        title="No Campaigns"
        body="The campaigns collection is empty. Add a document under Firestore > campaigns, then reload."
      />
    );
  }

  return (
    <PixelPanel className="space-y-5">
      <div className="space-y-2 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.35em] text-crt-accent">Campaigns</p>
        <h2 className="text-2xl font-bold uppercase tracking-[0.12em] text-crt-text">Select Active Table</h2>
        <p className="text-sm text-crt-muted">Choose exactly one campaign to scope the dashboard session.</p>
      </div>
      <div className="grid gap-3">
        {campaigns.map((campaign) => (
          <label
            className={`block cursor-pointer border-2 p-4 transition ${
              selectedCampaignId === campaign.id
                ? "border-crt-accent bg-crt-panel-2"
                : "border-crt-border bg-crt-panel"
            }`}
            key={campaign.id}
          >
            <input
              checked={selectedCampaignId === campaign.id}
              className="sr-only"
              name="campaign"
              onChange={() => setSelectedCampaignId(campaign.id)}
              type="radio"
              value={campaign.id}
            />
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.14em] text-crt-text">{campaign.name}</p>
                <p className="mt-1 text-xs uppercase tracking-[0.2em] text-crt-muted">
                  {campaign.status ?? "active"} / {campaign.id}
                </p>
              </div>
              <span className="text-xs uppercase tracking-[0.2em] text-crt-accent">
                {selectedCampaignId === campaign.id ? "selected" : "ready"}
              </span>
            </div>
          </label>
        ))}
      </div>
      <PixelButton className="w-full" disabled={isSubmitting || !selectedCampaignId} onClick={enterCampaign}>
        {isSubmitting ? "Opening..." : "Open Dashboard"}
      </PixelButton>
    </PixelPanel>
  );
}
