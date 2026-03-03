"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { Player } from "@/types";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { LoadingPanel } from "@/components/shared/LoadingPanel";
import { PlayerPortrait } from "@/components/shared/PlayerPortrait";
import { useCampaign } from "@/components/providers/CampaignProvider";
import { getPartyOverview } from "@/lib/firebase/firestore";
import { formatNumber } from "@/lib/utils";

export function PartyQuickView() {
  const { campaignId } = useCampaign();
  const [players, setPlayers] = useState<Player[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setError(null);

    void getPartyOverview(campaignId)
      .then((nextPlayers) => {
        if (isMounted) {
          setPlayers(nextPlayers);
        }
      })
      .catch((loadError) => {
        if (isMounted) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load party.");
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
    return <LoadingPanel label="Loading party..." />;
  }

  if (error) {
    return <ErrorState body={error} />;
  }

  if (!players.length) {
    return <EmptyState body="No players were found under campaigns/{campaignId}/players." title="Empty Party" />;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-crt-accent">Party</p>
        <Link className="text-[10px] uppercase tracking-[0.2em] text-crt-muted hover:text-crt-text" href="/party">
          View All
        </Link>
      </div>
      <div className="space-y-2">
        {players.slice(0, 5).map((player) => (
          <Link
            className="block border-2 border-crt-border bg-crt-panel px-3 py-2 text-xs transition hover:border-crt-accent"
            href={`/players/${player.id}`}
            key={player.id}
          >
            <div className="flex items-center gap-3">
              <PlayerPortrait
                campaignId={campaignId}
                className="h-10 w-10 shrink-0 rounded-sm border border-crt-border object-cover"
                player={player}
                variant="reference"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate font-bold uppercase tracking-[0.12em] text-crt-text">
                    {player.name ?? player.id}
                  </span>
                  <span className="shrink-0 text-crt-muted">Lv {formatNumber(player.level)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-3 text-[10px] uppercase tracking-[0.15em] text-crt-muted">
                  <span>HP {formatNumber(player.hpCurrent)}/{formatNumber(player.hpMax)}</span>
                  <span>AC {formatNumber(player.ac)}</span>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
