"use client";

import { useEffect, useState } from "react";

import type { AssignablePlayerOption, CurrencyTransactionDoc } from "@/types";
import { useCampaign } from "@/components/providers/CampaignProvider";
import { EmptyState } from "@/components/shared/EmptyState";
import { PixelButton } from "@/components/ui/PixelButton";
import { PixelPanel } from "@/components/ui/PixelPanel";
import { PixelSelect } from "@/components/ui/PixelSelect";
import { formatCurrencyAmount } from "@/lib/currency";
import { listAssignablePlayers } from "@/lib/firebase/firestore";

interface RecentTransactionsProps {
  refreshKey: number;
  onTransactionChange: () => void;
}

function formatDate(value: string | null): string {
  if (!value) {
    return "Pending";
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Pending" : parsed.toLocaleString();
}

function getPlayerName(players: AssignablePlayerOption[], playerId: string): string {
  return players.find((player) => player.id === playerId)?.name ?? playerId;
}

export function RecentTransactions({ refreshKey, onTransactionChange }: RecentTransactionsProps) {
  const { campaignId } = useCampaign();
  const [players, setPlayers] = useState<AssignablePlayerOption[]>([]);
  const [transactions, setTransactions] = useState<CurrencyTransactionDoc[]>([]);
  const [selectedPlayerId, setSelectedPlayerId] = useState("all");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeReverseId, setActiveReverseId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void listAssignablePlayers(campaignId)
      .then((rows) => {
        if (active) {
          setPlayers(rows);
        }
      })
      .catch(() => {
        if (active) {
          setPlayers([]);
        }
      });

    return () => {
      active = false;
    };
  }, [campaignId]);

  useEffect(() => {
    let active = true;

    async function loadTransactions() {
      setIsLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          campaignId,
          limit: "20"
        });

        if (selectedPlayerId !== "all") {
          params.set("playerId", selectedPlayerId);
        }

        const response = await fetch(`/api/barter/list?${params.toString()}`, {
          cache: "no-store"
        });
        const payload = (await response.json()) as {
          items?: CurrencyTransactionDoc[];
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error || "Unable to load recent transactions.");
        }

        if (active) {
          setTransactions(payload.items ?? []);
        }
      } catch (loadError) {
        if (active) {
          setTransactions([]);
          setError(loadError instanceof Error ? loadError.message : "Unable to load recent transactions.");
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void loadTransactions();
    const interval = window.setInterval(() => {
      void loadTransactions();
    }, 10000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [campaignId, refreshKey, selectedPlayerId]);

  async function handleReverse(txId: string) {
    setActiveReverseId(txId);
    setError(null);

    try {
      const response = await fetch("/api/barter/reverse", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          campaignId,
          txId
        })
      });
      const payload = (await response.json()) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Unable to reverse this barter transaction.");
      }

      onTransactionChange();
    } catch (reverseError) {
      setError(reverseError instanceof Error ? reverseError.message : "Unable to reverse this barter transaction.");
    } finally {
      setActiveReverseId(null);
    }
  }

  return (
    <PixelPanel className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-crt-muted">Recent Transactions</p>
          <p className="mt-2 text-sm text-crt-muted">Latest 20 ledger entries for this campaign. Reverse creates an opposite entry.</p>
        </div>
        <div className="w-full max-w-[260px]">
          <PixelSelect onChange={(event) => setSelectedPlayerId(event.target.value)} value={selectedPlayerId}>
            <option value="all">All Players</option>
            {players.map((player) => (
              <option key={player.id} value={player.id}>
                {player.name ?? player.id}
              </option>
            ))}
          </PixelSelect>
        </div>
      </div>

      {error ? (
        <div className="border border-crt-danger px-3 py-3 text-xs uppercase tracking-[0.14em] text-crt-danger">{error}</div>
      ) : null}

      {isLoading ? (
        <div className="border border-dashed border-crt-border px-4 py-4 text-sm text-crt-muted">Loading transactions...</div>
      ) : transactions.length ? (
        <div className="space-y-3">
          {transactions.map((transaction) => (
            <div className="border-2 border-crt-border bg-crt-panel-2 p-4" key={transaction.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-crt-text">
                    {transaction.type} / {formatDate(transaction.createdAt)}
                  </p>
                  <p className="mt-2 text-sm text-crt-muted">{transaction.reason}</p>
                  <p className="mt-2 text-[10px] uppercase tracking-[0.16em] text-crt-muted">
                    Created by {transaction.createdByUid}
                    {transaction.metadata.reversalOfTxId ? ` / reversal of ${transaction.metadata.reversalOfTxId}` : ""}
                    {transaction.metadata.reversedByTxId ? ` / reversed by ${transaction.metadata.reversedByTxId}` : ""}
                  </p>
                </div>
                <PixelButton
                  disabled={Boolean(transaction.metadata.reversedByTxId) || activeReverseId === transaction.id}
                  onClick={() => void handleReverse(transaction.id)}
                  variant="danger"
                >
                  {activeReverseId === transaction.id ? "Reversing..." : "Reverse"}
                </PixelButton>
              </div>
              <div className="mt-4 grid gap-2">
                {transaction.targets.map((target) => (
                  <div
                    className="flex flex-wrap items-center justify-between gap-3 border border-crt-border px-3 py-2"
                    key={`${transaction.id}-${target.playerId}`}
                  >
                    <span className="text-xs font-bold uppercase tracking-[0.16em] text-crt-text">
                      {getPlayerName(players, target.playerId)}
                    </span>
                    <span className="text-xs uppercase tracking-[0.16em] text-crt-muted">
                      {formatCurrencyAmount(target.delta)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState body="No barter transactions have been recorded for this campaign yet." title="No Ledger Entries" />
      )}
    </PixelPanel>
  );
}
