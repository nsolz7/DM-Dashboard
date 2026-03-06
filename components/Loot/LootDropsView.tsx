"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { LootDropDoc } from "@/types";
import { useCampaign } from "@/components/providers/CampaignProvider";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { LoadingPanel } from "@/components/shared/LoadingPanel";
import { PixelButton } from "@/components/ui/PixelButton";
import { PixelPanel } from "@/components/ui/PixelPanel";
import { listRecent, readDrop } from "@/lib/loot";

function formatDate(value: string | null): string {
  if (!value) {
    return "Pending";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Pending" : date.toLocaleString();
}

function formatCoins(drop: LootDropDoc): string {
  if (!drop.coins) {
    return "—";
  }

  const pairs = Object.entries(drop.coins)
    .filter(([, amount]) => typeof amount === "number" && amount > 0)
    .map(([coin, amount]) => `${amount} ${coin}`);

  return pairs.length ? pairs.join(", ") : "—";
}

export function LootDropsView() {
  const { campaignId } = useCampaign();
  const [drops, setDrops] = useState<LootDropDoc[]>([]);
  const [selectedDropId, setSelectedDropId] = useState<string | null>(null);
  const [selectedDrop, setSelectedDrop] = useState<LootDropDoc | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  const loadDrops = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const rows = await listRecent(campaignId, 30);
      setDrops(rows);
      setSelectedDropId((current) => current ?? rows[0]?.id ?? null);
    } catch (loadError) {
      setDrops([]);
      setError(loadError instanceof Error ? loadError.message : "Unable to load loot drops.");
    } finally {
      setIsLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    void loadDrops();

    const interval = window.setInterval(() => {
      void loadDrops();
    }, 12000);

    return () => {
      window.clearInterval(interval);
    };
  }, [campaignId, loadDrops]);

  useEffect(() => {
    if (!selectedDropId) {
      setSelectedDrop(null);
      setDetailError(null);
      return;
    }

    const currentDropId = selectedDropId;
    setIsLoadingDetail(true);
    setDetailError(null);

    function loadDetail() {
      return readDrop(campaignId, currentDropId)
        .then((drop) => {
          setSelectedDrop(drop);
        })
        .catch((loadError) => {
          setSelectedDrop(null);
          setDetailError(loadError instanceof Error ? loadError.message : "Unable to load loot drop detail.");
        })
        .finally(() => {
          setIsLoadingDetail(false);
        });
    }

    void loadDetail();
    const interval = window.setInterval(() => {
      void loadDetail();
    }, 12000);

    return () => {
      window.clearInterval(interval);
    };
  }, [campaignId, selectedDropId]);

  const selectedSummary = useMemo(
    () => drops.find((drop) => drop.id === selectedDropId) ?? null,
    [drops, selectedDropId]
  );

  if (isLoading) {
    return <LoadingPanel label="Loading loot drops..." />;
  }

  if (error) {
    return <ErrorState body={error} />;
  }

  if (!drops.length) {
    return <EmptyState body="No loot drops have been sent for this campaign yet." title="No Loot Drops" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.35em] text-crt-accent">Loot Management</p>
          <h2 className="mt-2 text-3xl font-bold uppercase tracking-[0.12em] text-crt-text">Recent Drops</h2>
        </div>
        <PixelButton onClick={() => void loadDrops()} variant="secondary">
          Refresh
        </PixelButton>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
        <PixelPanel className="space-y-3 p-0">
          <div className="border-b border-crt-border px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-crt-muted">Drops</p>
          </div>
          <div className="max-h-[520px] space-y-2 overflow-y-auto p-3">
            {drops.map((drop) => (
              <button
                className={`w-full border px-3 py-3 text-left transition ${
                  drop.id === selectedDropId
                    ? "border-crt-accent bg-crt-panel"
                    : "border-crt-border bg-crt-panel-2 hover:border-crt-accent"
                }`}
                key={drop.id}
                onClick={() => setSelectedDropId(drop.id)}
                type="button"
              >
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-crt-text">{drop.reason}</p>
                <p className="mt-2 text-[10px] uppercase tracking-[0.16em] text-crt-muted">
                  {drop.state.status} / {drop.delivery.mode}
                </p>
                <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-crt-muted">
                  {drop.entries.length} entries / coins {formatCoins(drop)}
                </p>
                <p className="mt-2 text-[10px] uppercase tracking-[0.14em] text-crt-muted">{formatDate(drop.createdAt)}</p>
              </button>
            ))}
          </div>
        </PixelPanel>

        <PixelPanel className="space-y-4">
          {isLoadingDetail ? (
            <LoadingPanel label="Loading selected drop..." />
          ) : detailError ? (
            <ErrorState body={detailError} />
          ) : selectedDrop ? (
            <>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-crt-muted">Drop Detail</p>
                <h3 className="mt-2 text-2xl font-bold uppercase tracking-[0.1em] text-crt-text">{selectedDrop.reason}</h3>
                <p className="mt-2 text-xs uppercase tracking-[0.16em] text-crt-muted">
                  {selectedDrop.state.status} / {selectedDrop.delivery.mode} / {formatDate(selectedDrop.createdAt)}
                </p>
                <p className="mt-1 text-xs uppercase tracking-[0.16em] text-crt-muted">
                  Coins: {formatCoins(selectedDrop)}
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-crt-muted">Entries</p>
                {selectedDrop.entries.map((entry) => (
                  <div className="border border-crt-border px-3 py-2" key={entry.entryId}>
                    <p className="text-xs font-bold uppercase tracking-[0.08em] text-crt-text">
                      {entry.namePreview ?? entry.ref?.id ?? entry.customItemId ?? entry.entryId}
                    </p>
                    <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-crt-muted">
                      remaining {selectedDrop.claimState.entryRemaining[entry.entryId] ?? entry.quantity} / qty {entry.quantity}
                    </p>
                  </div>
                ))}
              </div>

              <div className="text-[10px] uppercase tracking-[0.16em] text-crt-muted">
                claims: {selectedDrop.claimState.entryClaims.length} item claims
                {selectedDrop.claimState.coinClaims.length ? ` / ${selectedDrop.claimState.coinClaims.length} coin claims` : ""}
              </div>
            </>
          ) : (
            <EmptyState body="Choose a loot drop to inspect details." title="No Selection" />
          )}
        </PixelPanel>
      </div>

      {selectedSummary ? (
        <p className="text-xs uppercase tracking-[0.16em] text-crt-muted">Selected drop id: {selectedSummary.id}</p>
      ) : null}
    </div>
  );
}
