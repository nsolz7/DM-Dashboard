"use client";

import { useEffect, useState } from "react";

import type { Campaign } from "@/types";
import { useCampaign } from "@/components/providers/CampaignProvider";
import { listCampaigns } from "@/lib/firebase/firestore";

export function CampaignDropdown() {
  const { campaignId, selectCampaign } = useCampaign();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);

  useEffect(() => {
    let isMounted = true;

    void listCampaigns()
      .then((nextCampaigns) => {
        if (isMounted) {
          setCampaigns(nextCampaigns);
        }
      })
      .catch(() => {
        if (isMounted) {
          setCampaigns([]);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <label className="flex items-center gap-3 text-xs font-bold uppercase tracking-[0.2em] text-crt-muted">
      <span className="hidden sm:inline">Campaign</span>
      <select
        className="min-w-[220px] border-2 border-crt-border bg-crt-panel px-3 py-2 text-xs text-crt-text outline-none focus:border-crt-accent"
        onChange={(event) => selectCampaign(event.target.value)}
        value={campaignId}
      >
        {campaigns.map((campaign) => (
          <option key={campaign.id} value={campaign.id}>
            {campaign.name}
          </option>
        ))}
      </select>
    </label>
  );
}
