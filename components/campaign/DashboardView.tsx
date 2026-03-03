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
import { formatNumber } from "@/lib/utils";

function statCard(label: string, value: string, accent?: string) {
  return (
    <PixelPanel className="space-y-2" key={label}>
      <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-crt-muted">{label}</p>
      <p className={`text-3xl font-bold uppercase tracking-[0.08em] ${accent ?? "text-crt-text"}`}>{value}</p>
    </PixelPanel>
  );
}

export function DashboardView() {
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
          setError(loadError instanceof Error ? loadError.message : "Unable to load dashboard data.");
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
    return <LoadingPanel label="Loading dashboard..." />;
  }

  if (error) {
    return <ErrorState body={error} />;
  }

  if (!players.length) {
    return <EmptyState body="Create players under this campaign to populate the dashboard." title="No Party Data" />;
  }

  const averageLevel =
    players.reduce((sum, player) => sum + (player.level ?? 0), 0) / Math.max(players.length, 1);
  const currentHp = players.reduce((sum, player) => sum + (player.hpCurrent ?? 0), 0);
  const maxHp = players.reduce((sum, player) => sum + (player.hpMax ?? 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.35em] text-crt-accent">Dashboard</p>
        <h2 className="mt-2 text-3xl font-bold uppercase tracking-[0.12em] text-crt-text">Campaign Command</h2>
        <p className="mt-2 text-sm text-crt-muted">
          Quick-read scaffolding for the selected campaign. This page stays read-only for now.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        {statCard("Players", formatNumber(players.length), "text-crt-accent")}
        {statCard("Avg Level", averageLevel ? averageLevel.toFixed(1) : "0.0")}
        {statCard("Party HP", `${formatNumber(currentHp)} / ${formatNumber(maxHp)}`)}
        {statCard("Scenario", "Standby", "text-crt-warn")}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <PixelPanel className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-crt-muted">Party Pulse</p>
              <h3 className="mt-2 text-xl font-bold uppercase tracking-[0.12em] text-crt-text">Frontline Summary</h3>
            </div>
            <Link className="text-xs uppercase tracking-[0.2em] text-crt-accent hover:text-crt-text" href="/party">
              Open Party
            </Link>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {players.slice(0, 4).map((player) => (
              <Link
                className="block border-2 border-crt-border bg-crt-panel-2 p-4 transition hover:border-crt-accent"
                href={`/players/${player.id}`}
                key={player.id}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <PlayerPortrait
                      campaignId={campaignId}
                      className="h-14 w-14 shrink-0 rounded-sm border border-crt-border object-cover"
                      player={player}
                      variant="reference"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold uppercase tracking-[0.12em] text-crt-text">
                        {player.name ?? player.id}
                      </p>
                      <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-crt-muted">
                        {player.raceName} / {player.className}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs text-crt-muted">Lv {formatNumber(player.level)}</span>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[10px] uppercase tracking-[0.15em] text-crt-muted">
                  <div className="border border-crt-border px-2 py-2">HP {formatNumber(player.hpCurrent)}</div>
                  <div className="border border-crt-border px-2 py-2">AC {formatNumber(player.ac)}</div>
                  <div className="border border-crt-border px-2 py-2">SPD {formatNumber(player.speed)}</div>
                </div>
              </Link>
            ))}
          </div>
        </PixelPanel>

        <PixelPanel className="space-y-4">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-crt-muted">Next Hooks</p>
          <div className="space-y-3 text-sm text-crt-muted">
            <p>Scenario staging tiles will live here once DM-managed editing is added.</p>
            <p>Storage-backed handouts, maps, and loot reveal flows can be layered into the current shell without changing routing.</p>
            <p>Player write actions are intentionally out of scope for this first pass.</p>
          </div>
        </PixelPanel>
      </div>
    </div>
  );
}
