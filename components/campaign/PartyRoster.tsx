"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { Player } from "@/types";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { LoadingPanel } from "@/components/shared/LoadingPanel";
import { PlayerPortrait } from "@/components/shared/PlayerPortrait";
import { useCampaign } from "@/components/providers/CampaignProvider";
import { PixelPanel } from "@/components/ui/PixelPanel";
import { getPartyOverview } from "@/lib/firebase/firestore";
import { abilityModifier, formatNumber } from "@/lib/utils";

const abilityOrder = ["str", "dex", "con", "int", "wis", "cha"] as const;

export function PartyRoster() {
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
          setError(loadError instanceof Error ? loadError.message : "Unable to load party roster.");
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
    return <LoadingPanel label="Loading party roster..." />;
  }

  if (error) {
    return <ErrorState body={error} />;
  }

  if (!players.length) {
    return <EmptyState body="No players are available for the selected campaign." title="Empty Party" />;
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.35em] text-crt-accent">Party</p>
        <h2 className="mt-2 text-3xl font-bold uppercase tracking-[0.12em] text-crt-text">Party Overview</h2>
        <p className="mt-2 text-sm text-crt-muted">
          High-level player state merged from `players`, `party/summary`, and `sheets`.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {players.map((player) => (
          <PixelPanel className="space-y-4" key={player.id}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <PlayerPortrait
                  campaignId={campaignId}
                  className="h-16 w-16 shrink-0 rounded-sm border border-crt-border object-cover"
                  player={player}
                  variant="reference"
                />
                <div className="min-w-0">
                  <p className="truncate text-lg font-bold uppercase tracking-[0.12em] text-crt-text">
                    {player.name ?? player.id}
                  </p>
                  <p className="mt-1 text-xs uppercase tracking-[0.18em] text-crt-muted">
                    {player.raceName} / {player.className} / {player.backgroundName}
                  </p>
                </div>
              </div>
              <Link
                className="border-2 border-crt-border px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-crt-accent transition hover:border-crt-accent"
                href={`/players/${player.id}`}
              >
                Character Sheet
              </Link>
            </div>

            <div className="grid gap-2 sm:grid-cols-4">
              <div className="border border-crt-border px-3 py-2 text-xs text-crt-muted">
                Level <span className="block pt-1 text-base font-bold text-crt-text">{formatNumber(player.level)}</span>
              </div>
              <div className="border border-crt-border px-3 py-2 text-xs text-crt-muted">
                HP <span className="block pt-1 text-base font-bold text-crt-text">{formatNumber(player.hpCurrent)}/{formatNumber(player.hpMax)}</span>
              </div>
              <div className="border border-crt-border px-3 py-2 text-xs text-crt-muted">
                AC <span className="block pt-1 text-base font-bold text-crt-text">{formatNumber(player.ac)}</span>
              </div>
              <div className="border border-crt-border px-3 py-2 text-xs text-crt-muted">
                Speed <span className="block pt-1 text-base font-bold text-crt-text">{formatNumber(player.speed)}</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {abilityOrder.map((ability) => {
                const score = player.abilityScores[ability];
                return (
                  <div className="border border-crt-border px-3 py-2 text-center" key={ability}>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-crt-muted">{ability}</p>
                    <p className="mt-1 text-lg font-bold text-crt-text">{formatNumber(score)}</p>
                    <p className="text-[10px] uppercase tracking-[0.15em] text-crt-accent">{abilityModifier(score)}</p>
                  </div>
                );
              })}
            </div>
          </PixelPanel>
        ))}
      </div>
    </div>
  );
}
