"use client";

import { useEffect, useMemo, useState } from "react";

import type { AssignablePlayerOption, BarterSplitMode, BarterTargetMode, BarterTxType, CurrencyAmount } from "@/types";
import { useCampaign } from "@/components/providers/CampaignProvider";
import { PixelButton } from "@/components/ui/PixelButton";
import { PixelInput } from "@/components/ui/PixelInput";
import { PixelPanel } from "@/components/ui/PixelPanel";
import { PixelSelect } from "@/components/ui/PixelSelect";
import { buildBarterTargetDeltas } from "@/lib/barter/plan";
import { emptyCurrencyAmount, sanitizeCurrencyAmount } from "@/lib/currency";
import { listAssignablePlayers } from "@/lib/firebase/firestore";
import { BarterPreviewTable } from "@/components/Barter/BarterPreviewTable";

interface BarterPanelProps {
  onApplied: () => void;
}

const currencyFields: Array<keyof CurrencyAmount> = ["cp", "sp", "ep", "gp", "pp"];

function parseCoinInput(value: string): number {
  if (!value.trim()) {
    return 0;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function buildAmount(formValues: Record<keyof CurrencyAmount, string>): CurrencyAmount {
  return sanitizeCurrencyAmount({
    cp: parseCoinInput(formValues.cp),
    sp: parseCoinInput(formValues.sp),
    ep: parseCoinInput(formValues.ep),
    gp: parseCoinInput(formValues.gp),
    pp: parseCoinInput(formValues.pp)
  });
}

export function BarterPanel({ onApplied }: BarterPanelProps) {
  const { campaignId } = useCampaign();
  const [players, setPlayers] = useState<AssignablePlayerOption[]>([]);
  const [isLoadingPlayers, setIsLoadingPlayers] = useState(true);
  const [type, setType] = useState<BarterTxType>("award");
  const [targetMode, setTargetMode] = useState<BarterTargetMode>("party");
  const [splitMode, setSplitMode] = useState<BarterSplitMode>("equal");
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [fromPlayerId, setFromPlayerId] = useState("");
  const [toPlayerId, setToPlayerId] = useState("");
  const [reason, setReason] = useState("");
  const [allowNegative, setAllowNegative] = useState(false);
  const [autoMakeChange, setAutoMakeChange] = useState(true);
  const [coins, setCoins] = useState<Record<keyof CurrencyAmount, string>>({
    cp: "",
    sp: "",
    ep: "",
    gp: "",
    pp: ""
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setIsLoadingPlayers(true);

    void listAssignablePlayers(campaignId)
      .then((rows) => {
        if (!active) {
          return;
        }

        setPlayers(rows);
        const firstActive = rows.find((player) => player.active)?.id ?? rows[0]?.id ?? "";
        setSelectedPlayerId((current) => current || firstActive);
        setFromPlayerId((current) => current || firstActive);
        setToPlayerId((current) => current || rows.find((player) => player.id !== firstActive)?.id || firstActive);
        setSelectedPlayerIds((current) => (current.length ? current : firstActive ? [firstActive] : []));
      })
      .catch((loadError) => {
        if (active) {
          setPlayers([]);
          setError(loadError instanceof Error ? loadError.message : "Unable to load party members.");
        }
      })
      .finally(() => {
        if (active) {
          setIsLoadingPlayers(false);
        }
      });

    return () => {
      active = false;
    };
  }, [campaignId]);

  useEffect(() => {
    if (type === "transfer") {
      setTargetMode("individual");
      setAutoMakeChange(true);
    }
  }, [type]);

  const amount = useMemo(() => buildAmount(coins), [coins]);
  const activePartyIds = useMemo(() => players.filter((player) => player.active).map((player) => player.id), [players]);

  const previewTargets = useMemo(() => {
    try {
      return buildBarterTargetDeltas({
        type,
        targetMode,
        amount,
        targetPlayerIds:
          targetMode === "party"
            ? activePartyIds
            : targetMode === "individual"
              ? selectedPlayerId
                ? [selectedPlayerId]
                : []
              : selectedPlayerIds,
        fromPlayerId,
        toPlayerId,
        splitMode
      });
    } catch {
      return [];
    }
  }, [activePartyIds, amount, fromPlayerId, selectedPlayerId, selectedPlayerIds, splitMode, targetMode, toPlayerId, type]);

  function toggleSelectedPlayer(playerId: string) {
    setSelectedPlayerIds((current) =>
      current.includes(playerId) ? current.filter((value) => value !== playerId) : [...current, playerId]
    );
  }

  async function handleSubmit() {
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/barter/apply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          campaignId,
          type,
          targetMode,
          amount,
          reason,
          targetPlayerIds:
            targetMode === "party"
              ? []
              : targetMode === "individual"
                ? selectedPlayerId
                  ? [selectedPlayerId]
                  : []
                : selectedPlayerIds,
          fromPlayerId: type === "transfer" ? fromPlayerId : null,
          toPlayerId: type === "transfer" ? toPlayerId : null,
          splitMode,
          autoMakeChange,
          allowNegative
        })
      });

      const payload = (await response.json()) as {
        txId?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Unable to apply barter transaction.");
      }

      setMessage(`Transaction saved to ledger (${payload.txId}).`);
      setReason("");
      setCoins({
        cp: "",
        sp: "",
        ep: "",
        gp: "",
        pp: ""
      });
      onApplied();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to apply barter transaction.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function submitWithLock() {
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    await handleSubmit();
  }

  return (
    <PixelPanel className="space-y-5">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-crt-muted">Barter</p>
        <p className="mt-2 text-sm text-crt-muted">
          DM-controlled coin awards, charges, and transfers. Transactions update player pouches and create a campaign ledger entry.
        </p>
      </div>

      {error ? (
        <div className="border border-crt-danger px-3 py-3 text-xs uppercase tracking-[0.14em] text-crt-danger">{error}</div>
      ) : null}
      {message ? (
        <div className="border border-crt-accent px-3 py-3 text-xs uppercase tracking-[0.14em] text-crt-accent">{message}</div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-[0.18em] text-crt-muted">Transaction Type</label>
              <PixelSelect onChange={(event) => setType(event.target.value as BarterTxType)} value={type}>
                <option value="award">Award</option>
                <option value="charge">Charge</option>
                <option value="transfer">Transfer</option>
              </PixelSelect>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-[0.18em] text-crt-muted">Target Mode</label>
              <PixelSelect
                disabled={type === "transfer"}
                onChange={(event) => setTargetMode(event.target.value as BarterTargetMode)}
                value={type === "transfer" ? "individual" : targetMode}
              >
                <option value="party">Party</option>
                <option value="individual">Individual</option>
                <option value="multi">Multi-select</option>
              </PixelSelect>
            </div>
          </div>

          {type === "transfer" ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-[0.18em] text-crt-muted">From</label>
                <PixelSelect disabled={isLoadingPlayers} onChange={(event) => setFromPlayerId(event.target.value)} value={fromPlayerId}>
                  {players.map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.name ?? player.id}
                    </option>
                  ))}
                </PixelSelect>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-[0.18em] text-crt-muted">To</label>
                <PixelSelect disabled={isLoadingPlayers} onChange={(event) => setToPlayerId(event.target.value)} value={toPlayerId}>
                  {players.map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.name ?? player.id}
                    </option>
                  ))}
                </PixelSelect>
              </div>
            </div>
          ) : null}

          {type !== "transfer" && targetMode === "individual" ? (
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-[0.18em] text-crt-muted">Player</label>
              <PixelSelect disabled={isLoadingPlayers} onChange={(event) => setSelectedPlayerId(event.target.value)} value={selectedPlayerId}>
                {players.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.name ?? player.id}
                  </option>
                ))}
              </PixelSelect>
            </div>
          ) : null}

          {type !== "transfer" && targetMode === "multi" ? (
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-[0.18em] text-crt-muted">Players</label>
              <div className="grid gap-2 rounded-sm border-2 border-crt-border p-3">
                {players.map((player) => (
                  <label className="flex items-center gap-2 text-sm text-crt-text" key={player.id}>
                    <input
                      checked={selectedPlayerIds.includes(player.id)}
                      className="h-4 w-4 accent-[#7ee787]"
                      onChange={() => toggleSelectedPlayer(player.id)}
                      type="checkbox"
                    />
                    <span>{player.name ?? player.id}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : null}

          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-[0.18em] text-crt-muted">Amount</label>
            <div className="grid grid-cols-5 gap-2">
              {currencyFields.map((field) => (
                <div className="space-y-2" key={field}>
                  <span className="block text-[10px] uppercase tracking-[0.16em] text-crt-muted">{field}</span>
                  <PixelInput
                    inputMode="numeric"
                    min="0"
                    onChange={(event) => setCoins((current) => ({ ...current, [field]: event.target.value }))}
                    placeholder="0"
                    type="number"
                    value={coins[field]}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-[0.18em] text-crt-muted">Split Mode</label>
              <PixelSelect
                disabled={type === "transfer" || targetMode === "individual"}
                onChange={(event) => setSplitMode(event.target.value as BarterSplitMode)}
                value={splitMode}
              >
                <option value="equal">Equal</option>
              </PixelSelect>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-[0.18em] text-crt-muted">Reason / Notes</label>
              <PixelInput onChange={(event) => setReason(event.target.value)} placeholder="Required" value={reason} />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex items-center gap-2 text-sm text-crt-text">
              <input
                checked={autoMakeChange}
                className="h-4 w-4 accent-[#7ee787]"
                disabled={type === "award"}
                onChange={(event) => setAutoMakeChange(event.target.checked)}
                type="checkbox"
              />
              Auto-make-change
            </label>
            <label className="flex items-center gap-2 text-sm text-crt-text">
              <input
                checked={allowNegative}
                className="h-4 w-4 accent-[#7ee787]"
                onChange={(event) => setAllowNegative(event.target.checked)}
                type="checkbox"
              />
              Allow negative balances
            </label>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-crt-accent">Preview</p>
            <p className="mt-2 text-sm text-crt-muted">Review each impacted player’s net currency delta before confirming.</p>
          </div>
          <BarterPreviewTable players={players} targets={previewTargets} />
          <PixelButton
            className="w-full"
            disabled={isLoadingPlayers || isSubmitting || !previewTargets.length || !reason.trim()}
            onClick={() => void submitWithLock()}
          >
            {isSubmitting ? "Applying..." : "Confirm"}
          </PixelButton>
        </div>
      </div>
    </PixelPanel>
  );
}
