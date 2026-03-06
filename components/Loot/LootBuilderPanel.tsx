"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { faBoxOpen, faDice, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import type {
  AssignablePlayerOption,
  CurrencyAmount,
  CustomItemDoc,
  LootBuilderMode,
  LootDeliveryMode,
  LootDropEntry
} from "@/types";
import { useCampaign } from "@/components/providers/CampaignProvider";
import { CustomItemModal } from "@/components/Loot/CustomItemModal";
import { createEntryFromCustomItem } from "@/components/Loot/entryHelpers";
import { LootSearch } from "@/components/Loot/LootSearch";
import { StagedLootTable } from "@/components/Loot/StagedLootTable";
import { PixelButton } from "@/components/ui/PixelButton";
import { PixelInput } from "@/components/ui/PixelInput";
import { PixelPanel } from "@/components/ui/PixelPanel";
import { PixelSelect } from "@/components/ui/PixelSelect";
import { currencyKeys, sanitizeCurrencyAmount } from "@/lib/currency";
import { listAssignablePlayers } from "@/lib/firebase/firestore";
import { createDraft, generate, send } from "@/lib/loot";

interface LootBuilderPanelProps {
  onSent?: () => void;
}

type CoinInputState = Record<keyof CurrencyAmount, string>;

const rarityOptions = ["common", "uncommon", "rare", "very rare", "legendary", "artifact"];
const itemTypeOptions = [
  "consumable",
  "wondrous",
  "weapon",
  "armor",
  "shield",
  "ring",
  "staff",
  "rod"
];

function parsePositiveInteger(value: string): number {
  if (!value.trim()) {
    return 0;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function parseWeight(value: string): number {
  if (!value.trim()) {
    return 1;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 1;
}

function buildCoinAmount(input: CoinInputState): CurrencyAmount {
  return sanitizeCurrencyAmount({
    cp: parsePositiveInteger(input.cp),
    sp: parsePositiveInteger(input.sp),
    ep: parsePositiveInteger(input.ep),
    gp: parsePositiveInteger(input.gp),
    pp: parsePositiveInteger(input.pp)
  });
}

function hasCoins(amount: CurrencyAmount): boolean {
  return currencyKeys.some((key) => amount[key] > 0);
}

function entryIdentity(entry: LootDropEntry): string {
  if (entry.kind === "custom_item") {
    return `custom:${entry.customItemId ?? entry.entryId}`;
  }

  return `item:${entry.ref?.type ?? "items"}:${entry.ref?.id ?? entry.entryId}`;
}

function upsertEntry(entries: LootDropEntry[], nextEntry: LootDropEntry): LootDropEntry[] {
  const key = entryIdentity(nextEntry);
  const existingIndex = entries.findIndex((entry) => entryIdentity(entry) === key);

  if (existingIndex < 0) {
    return [...entries, nextEntry];
  }

  return entries.map((entry, index) => {
    if (index !== existingIndex) {
      return entry;
    }

    return {
      ...entry,
      quantity: entry.quantity + nextEntry.quantity
    };
  });
}

function moveEntry(entries: LootDropEntry[], entryId: string, direction: "up" | "down"): LootDropEntry[] {
  const currentIndex = entries.findIndex((entry) => entry.entryId === entryId);

  if (currentIndex < 0) {
    return entries;
  }

  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

  if (targetIndex < 0 || targetIndex >= entries.length) {
    return entries;
  }

  const next = [...entries];
  const temp = next[currentIndex];
  next[currentIndex] = next[targetIndex];
  next[targetIndex] = temp;
  return next;
}

function toggleOption(values: string[], option: string): string[] {
  return values.includes(option) ? values.filter((value) => value !== option) : [...values, option];
}

export function LootBuilderPanel({ onSent }: LootBuilderPanelProps) {
  const { campaignId } = useCampaign();
  const [players, setPlayers] = useState<AssignablePlayerOption[]>([]);
  const [isLoadingPlayers, setIsLoadingPlayers] = useState(true);
  const [mode, setMode] = useState<LootBuilderMode>(createDraft().mode);
  const [reason, setReason] = useState(createDraft().reason);
  const [deliveryMode, setDeliveryMode] = useState<LootDeliveryMode>(createDraft().deliveryMode);
  const [targetPlayerId, setTargetPlayerId] = useState<string>(createDraft().targetPlayerId ?? "");
  const [includeDm, setIncludeDm] = useState(createDraft().includeDm);
  const [entries, setEntries] = useState<LootDropEntry[]>(createDraft().entries);
  const [coinInputs, setCoinInputs] = useState<CoinInputState>({
    cp: "",
    sp: "",
    ep: "",
    gp: "",
    pp: ""
  });
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    lootId: string;
    txId: string;
  } | null>(null);

  const [randomCount, setRandomCount] = useState("4");
  const [randomRarities, setRandomRarities] = useState<string[]>([]);
  const [randomTypes, setRandomTypes] = useState<string[]>([]);
  const [duplicatesAllowed, setDuplicatesAllowed] = useState(true);
  const [weightConsumable, setWeightConsumable] = useState("1");
  const [weightWondrous, setWeightWondrous] = useState("1");
  const [weightWeapon, setWeightWeapon] = useState("1");
  const [weightArmor, setWeightArmor] = useState("1");

  useEffect(() => {
    let active = true;
    setIsLoadingPlayers(true);

    void listAssignablePlayers(campaignId)
      .then((rows) => {
        if (!active) {
          return;
        }

        setPlayers(rows);
        setTargetPlayerId((current) => current || rows[0]?.id || "");
      })
      .catch((loadError) => {
        if (active) {
          setPlayers([]);
          setError(loadError instanceof Error ? loadError.message : "Unable to load players for loot delivery.");
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
    if (deliveryMode === "party_claim") {
      return;
    }

    if (!targetPlayerId && players.length) {
      setTargetPlayerId(players[0].id);
    }
  }, [deliveryMode, players, targetPlayerId]);

  function addEntry(entry: LootDropEntry) {
    setEntries((current) => upsertEntry(current, entry));
  }

  async function generateRandomEntries() {
    if (isGenerating) {
      return;
    }

    setError(null);
    setSuccess(null);
    setIsGenerating(true);

    try {
      const generated = await generate({
        count: parsePositiveInteger(randomCount),
        allowedRarities: randomRarities,
        allowedItemTypes: randomTypes,
        duplicatesAllowed,
        weights: {
          consumable: parseWeight(weightConsumable),
          wondrous: parseWeight(weightWondrous),
          weapon: parseWeight(weightWeapon),
          armor: parseWeight(weightArmor)
        }
      });

      if (!generated.length) {
        throw new Error("No random loot entries were generated.");
      }

      setEntries((current) => generated.reduce((next, entry) => upsertEntry(next, entry), current));
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : "Unable to generate random loot.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleSend() {
    if (isSending) {
      return;
    }

    setError(null);
    setSuccess(null);
    setIsSending(true);

    try {
      const coins = buildCoinAmount(coinInputs);

      if (deliveryMode === "assigned" && !targetPlayerId) {
        throw new Error("Select a player when delivery mode is assigned.");
      }

      const result = await send({
        campaignId,
        reason,
        delivery: {
          mode: deliveryMode,
          playerIds: deliveryMode === "assigned" ? [targetPlayerId] : undefined,
          includeDm
        },
        coins: hasCoins(coins) ? coins : null,
        entries
      });

      setSuccess(result);
      setEntries([]);
      setReason("");
      setCoinInputs({
        cp: "",
        sp: "",
        ep: "",
        gp: "",
        pp: ""
      });
      onSent?.();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Unable to send loot drop.");
    } finally {
      setIsSending(false);
    }
  }

  function applyCustomItem(item: CustomItemDoc) {
    addEntry(createEntryFromCustomItem(item));
  }

  return (
    <>
      <PixelPanel className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-crt-accent">Loot Builder</p>
            <p className="mt-2 text-sm text-crt-muted">
              Build manual or random loot drops, include optional coins, and send via campaign transactions.
            </p>
          </div>
          <div className="flex gap-2">
            <PixelButton onClick={() => setMode("manual")} variant={mode === "manual" ? "primary" : "secondary"}>
              <FontAwesomeIcon className="mr-2 text-[11px]" fixedWidth icon={faBoxOpen} />
              Manual
            </PixelButton>
            <PixelButton onClick={() => setMode("random")} variant={mode === "random" ? "primary" : "secondary"}>
              <FontAwesomeIcon className="mr-2 text-[11px]" fixedWidth icon={faDice} />
              Random
            </PixelButton>
          </div>
        </div>

        {error ? (
          <div className="border border-crt-danger px-3 py-3 text-xs uppercase tracking-[0.14em] text-crt-danger">{error}</div>
        ) : null}
        {success ? (
          <div className="border border-crt-accent px-3 py-3 text-xs uppercase tracking-[0.14em] text-crt-accent">
            Loot sent ({success.lootId}). Open{" "}
            <Link className="underline" href={`/notifications?tx=${encodeURIComponent(success.txId)}`}>
              transaction {success.txId}
            </Link>
            .
          </div>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-[0.16em] text-crt-muted">Reason</label>
                <PixelInput onChange={(event) => setReason(event.target.value)} placeholder="Required" value={reason} />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-[0.16em] text-crt-muted">Delivery Mode</label>
                <PixelSelect onChange={(event) => setDeliveryMode(event.target.value as LootDeliveryMode)} value={deliveryMode}>
                  <option value="party_claim">Party Claim</option>
                  <option value="assigned">Assigned</option>
                </PixelSelect>
              </div>
            </div>

            {deliveryMode === "assigned" ? (
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-[0.16em] text-crt-muted">Player Recipient</label>
                <PixelSelect
                  disabled={isLoadingPlayers}
                  onChange={(event) => setTargetPlayerId(event.target.value)}
                  value={targetPlayerId}
                >
                  {players.map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.name ?? player.id}
                    </option>
                  ))}
                </PixelSelect>
              </div>
            ) : null}

            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-[0.16em] text-crt-muted">Coins (optional)</label>
              <div className="grid grid-cols-5 gap-2">
                {currencyKeys.map((key) => (
                  <div className="space-y-2" key={key}>
                    <span className="block text-[10px] uppercase tracking-[0.16em] text-crt-muted">{key}</span>
                    <PixelInput
                      inputMode="numeric"
                      min="0"
                      onChange={(event) => setCoinInputs((current) => ({ ...current, [key]: event.target.value }))}
                      placeholder="0"
                      type="number"
                      value={coinInputs[key]}
                    />
                  </div>
                ))}
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-crt-text">
              <input
                checked={includeDm}
                className="pixel-choice"
                onChange={(event) => setIncludeDm(event.target.checked)}
                type="checkbox"
              />
              Include DM in delivery transaction recipients
            </label>
          </div>

          <div className="space-y-4">
            {mode === "manual" ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-crt-muted">Manual Item Builder</p>
                  <PixelButton onClick={() => setShowCustomModal(true)} variant="secondary">
                    <FontAwesomeIcon className="mr-2 text-[11px]" fixedWidth icon={faPlus} />
                    Add Custom Item
                  </PixelButton>
                </div>
                <LootSearch onAddEntry={addEntry} />
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-crt-muted">Random Item Generator</p>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-[0.16em] text-crt-muted">Number of items</label>
                    <PixelInput
                      inputMode="numeric"
                      min="1"
                      onChange={(event) => setRandomCount(event.target.value)}
                      type="number"
                      value={randomCount}
                    />
                  </div>
                  <label className="mt-6 flex items-center gap-2 text-sm text-crt-text">
                    <input
                      checked={duplicatesAllowed}
                      className="pixel-choice"
                      onChange={(event) => setDuplicatesAllowed(event.target.checked)}
                      type="checkbox"
                    />
                    Duplicates allowed
                  </label>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-crt-muted">Allowed rarities</p>
                    <div className="grid gap-1 rounded-sm border border-crt-border bg-crt-panel-2 p-2">
                      {rarityOptions.map((rarity) => (
                        <label className="flex items-center gap-2 text-xs text-crt-text" key={rarity}>
                          <input
                            checked={randomRarities.includes(rarity)}
                            className="pixel-choice"
                            onChange={() => setRandomRarities((current) => toggleOption(current, rarity))}
                            type="checkbox"
                          />
                          {rarity}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-crt-muted">Allowed item types</p>
                    <div className="grid gap-1 rounded-sm border border-crt-border bg-crt-panel-2 p-2">
                      {itemTypeOptions.map((itemType) => (
                        <label className="flex items-center gap-2 text-xs text-crt-text" key={itemType}>
                          <input
                            checked={randomTypes.includes(itemType)}
                            className="pixel-choice"
                            onChange={() => setRandomTypes((current) => toggleOption(current, itemType))}
                            type="checkbox"
                          />
                          {itemType}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-4">
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-[0.16em] text-crt-muted">Consumable wt</label>
                    <PixelInput onChange={(event) => setWeightConsumable(event.target.value)} value={weightConsumable} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-[0.16em] text-crt-muted">Wondrous wt</label>
                    <PixelInput onChange={(event) => setWeightWondrous(event.target.value)} value={weightWondrous} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-[0.16em] text-crt-muted">Weapon wt</label>
                    <PixelInput onChange={(event) => setWeightWeapon(event.target.value)} value={weightWeapon} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-[0.16em] text-crt-muted">Armor wt</label>
                    <PixelInput onChange={(event) => setWeightArmor(event.target.value)} value={weightArmor} />
                  </div>
                </div>

                <PixelButton disabled={isGenerating} onClick={() => void generateRandomEntries()} variant="secondary">
                  {isGenerating ? "Generating..." : "Generate Random Loot"}
                </PixelButton>
              </div>
            )}
          </div>
        </div>

        <StagedLootTable
          entries={entries}
          onAddEntry={addEntry}
          onMoveEntry={(entryId, direction) => setEntries((current) => moveEntry(current, entryId, direction))}
          onRemoveEntry={(entryId) => setEntries((current) => current.filter((entry) => entry.entryId !== entryId))}
          onUpdateQuantity={(entryId, quantity) =>
            setEntries((current) =>
              current.map((entry) =>
                entry.entryId === entryId
                  ? {
                      ...entry,
                      quantity: Math.max(1, quantity)
                    }
                  : entry
              )
            )
          }
        />

        <div className="flex justify-end">
          <PixelButton disabled={isSending || (!entries.length && !hasCoins(buildCoinAmount(coinInputs)))} onClick={() => void handleSend()}>
            {isSending ? "Sending..." : "Send Loot"}
          </PixelButton>
        </div>
      </PixelPanel>

      <CustomItemModal
        campaignId={campaignId}
        isOpen={showCustomModal}
        onClose={() => setShowCustomModal(false)}
        onCreated={applyCustomItem}
      />
    </>
  );
}
