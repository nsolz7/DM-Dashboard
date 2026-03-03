"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { CompendiumLinkedRecord, Player, PlayerGrantEntry, PlayerInventoryStack } from "@/types";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { LoadingPanel } from "@/components/shared/LoadingPanel";
import { PlayerPortrait } from "@/components/shared/PlayerPortrait";
import { LevelUpPanel } from "@/components/campaign/LevelUpPanel";
import { useCampaign } from "@/components/providers/CampaignProvider";
import { PixelPanel } from "@/components/ui/PixelPanel";
import { getCompendiumLinkedRecord } from "@/lib/compendium/api";
import { getPlayerDetail } from "@/lib/firebase/firestore";
import { abilityModifier, formatNumber, readableId } from "@/lib/utils";

const abilityOrder = ["str", "dex", "con", "int", "wis", "cha"] as const;
type RemovableGrantType = keyof Player["grants"];

const compendiumRouteByDataset: Record<string, string> = {
  species: "species",
  class: "classes",
  background: "backgrounds",
  item: "items",
  spell: "spells",
  trait: "traits"
};

interface PlayerDetailViewProps {
  playerId: string;
}

interface LinkedReferenceRequest {
  id: string;
  fallbackName?: string;
}

function getRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function getNestedValue(source: unknown, path: string[]): unknown {
  let current: unknown = source;

  for (const segment of path) {
    const record = getRecord(current);

    if (!record || !(segment in record)) {
      return null;
    }

    current = record[segment];
  }

  return current;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function formatReferenceValue(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    const normalized = normalizeText(value);
    return normalized || null;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    const formatted = value
      .map((item) => formatReferenceValue(item))
      .filter((item): item is string => Boolean(item));

    return formatted.length ? formatted.join(", ") : null;
  }

  const record = getRecord(value);

  if (!record) {
    return null;
  }

  return (
    formatReferenceValue(record.raw) ??
    formatReferenceValue(record.name) ??
    formatReferenceValue(record.text) ??
    formatReferenceValue(record.value) ??
    null
  );
}

function truncateText(value: string | null | undefined, maxLength = 200): string | null {
  const normalized = value ? normalizeText(value) : "";

  if (!normalized) {
    return null;
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength).trimEnd()}...`;
}

function getCompendiumHref(record: CompendiumLinkedRecord | null | undefined): string | null {
  if (!record) {
    return null;
  }

  const route = compendiumRouteByDataset[record.dataset];
  return route ? `/compendium/${route}/${encodeURIComponent(record.id)}` : null;
}

function getReferenceSummary(record: CompendiumLinkedRecord | null | undefined): string | null {
  return truncateText(record?.summary ?? null, 220);
}

function getReferenceMeta(record: CompendiumLinkedRecord | null | undefined): Array<{ label: string; value: string }> {
  if (!record) {
    return [];
  }

  const source = record.raw;
  const values: Array<{ label: string; value: string | null }> =
    record.dataset === "species"
      ? [
          { label: "Size", value: formatReferenceValue(getNestedValue(source, ["taxonomy", "size"])) },
          { label: "Speed", value: formatReferenceValue(getNestedValue(source, ["stats", "speed", "raw"])) },
          { label: "Languages", value: formatReferenceValue(getNestedValue(source, ["stats", "languages", "raw"])) }
        ]
      : record.dataset === "class"
        ? [
            { label: "Hit Die", value: formatReferenceValue(getNestedValue(source, ["hitDie"])) },
            { label: "Primary", value: formatReferenceValue(getNestedValue(source, ["primaryAbility"])) },
            {
              label: "Saves",
              value: formatReferenceValue(
                getNestedValue(source, ["proficiencies", "savingThrows"]) ?? getNestedValue(source, ["savingThrows"])
              )
            }
          ]
        : record.dataset === "background"
          ? [
              {
                label: "Skills",
                value: formatReferenceValue(getNestedValue(source, ["skills"]) ?? getNestedValue(source, ["stats", "skills"]))
              },
              { label: "Tools", value: formatReferenceValue(getNestedValue(source, ["tools"])) },
              { label: "Languages", value: formatReferenceValue(getNestedValue(source, ["languages"])) }
            ]
          : record.dataset === "item"
            ? [
                { label: "Type", value: formatReferenceValue(getNestedValue(source, ["taxonomy", "type"]) ?? source.type) },
                { label: "Rarity", value: formatReferenceValue(getNestedValue(source, ["taxonomy", "rarity"]) ?? source.rarity) },
                { label: "Damage", value: formatReferenceValue(source.damage ?? getNestedValue(source, ["stats", "damage"])) }
              ]
            : record.dataset === "spell"
              ? [
                  { label: "Level", value: formatReferenceValue(source.level ?? getNestedValue(source, ["taxonomy", "level"])) },
                  { label: "School", value: formatReferenceValue(source.school ?? getNestedValue(source, ["taxonomy", "school"])) },
                  { label: "Range", value: formatReferenceValue(source.range ?? getNestedValue(source, ["stats", "range"])) }
                ]
              : record.dataset === "trait" || record.dataset === "feature"
                ? [
                    {
                      label: "Source",
                      value: formatReferenceValue(getNestedValue(source, ["source", "sourceCode"]) ?? source.publisher)
                    },
                    { label: "Uses", value: formatReferenceValue(source.uses) },
                    { label: "Recharge", value: formatReferenceValue(source.recharge) }
                  ]
                : [];

  return values
    .filter((item): item is { label: string; value: string } => Boolean(item.value))
    .slice(0, 3);
}

function collectLinkedReferenceRequests(player: Player): LinkedReferenceRequest[] {
  const requests = new Map<string, string | undefined>();

  function add(id: string | null | undefined, fallbackName?: string | null) {
    if (!id || requests.has(id)) {
      return;
    }

    requests.set(id, fallbackName ?? undefined);
  }

  add(player.raceId, player.raceName);
  add(player.classId, player.className);
  add(player.backgroundId, player.backgroundName);

  player.inventory.stacks.forEach((stack) => {
    add(stack.itemId);
  });

  player.grants.traits.forEach((entry) => add(entry.refId, entry.name));
  player.grants.features.forEach((entry) => add(entry.refId, entry.name));
  player.grants.spells.forEach((entry) => add(entry.refId, entry.name));
  player.grants.items.forEach((entry) => add(entry.refId, entry.name));

  return Array.from(requests.entries()).map(([id, fallbackName]) => ({
    id,
    fallbackName
  }));
}

function buildLinkedLookup(records: CompendiumLinkedRecord[]) {
  return records.reduce<Record<string, CompendiumLinkedRecord>>((accumulator, record) => {
    accumulator[record.id] = record;
    return accumulator;
  }, {});
}

function formatDateLabel(value: string | null): string {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }

  return parsed.toLocaleString();
}

export function PlayerDetailView({ playerId }: PlayerDetailViewProps) {
  const { campaignId } = useCampaign();
  const [player, setPlayer] = useState<Player | null>(null);
  const [linkedLookup, setLinkedLookup] = useState<Record<string, CompendiumLinkedRecord>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isReferenceLoading, setIsReferenceLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [activeRemoveKey, setActiveRemoveKey] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let isMounted = true;

    async function loadPlayer() {
      setIsLoading(true);
      setIsReferenceLoading(false);
      setError(null);
      setActionError(null);
      setActionMessage(null);
      setActiveRemoveKey(null);
      setPlayer(null);
      setLinkedLookup({});

      try {
        const nextPlayer = await getPlayerDetail(campaignId, playerId);

        if (!isMounted) {
          return;
        }

        setPlayer(nextPlayer);
        setIsLoading(false);

        if (!nextPlayer) {
          return;
        }

        const referenceRequests = collectLinkedReferenceRequests(nextPlayer);

        if (!referenceRequests.length) {
          return;
        }

        setIsReferenceLoading(true);

        const linkedRecords = await Promise.all(
          referenceRequests.map((request) => getCompendiumLinkedRecord(request.id, request.fallbackName))
        );

        if (!isMounted) {
          return;
        }

        setLinkedLookup(buildLinkedLookup(linkedRecords));
        setIsReferenceLoading(false);
      } catch (loadError) {
        if (!isMounted) {
          return;
        }

        setError(loadError instanceof Error ? loadError.message : "Unable to load player detail.");
        setIsLoading(false);
        setIsReferenceLoading(false);
      }
    }

    void loadPlayer();

    return () => {
      isMounted = false;
    };
  }, [campaignId, playerId, refreshKey]);

  if (isLoading) {
    return <LoadingPanel label="Loading player..." />;
  }

  if (error) {
    return <ErrorState body={error} />;
  }

  if (!player) {
    return <EmptyState body="No player or sheet document matched this playerId." title="Player Missing" />;
  }

  const coreReferences = [
    {
      label: "Species",
      id: player.raceId,
      fallbackName: player.raceName
    },
    {
      label: "Class",
      id: player.classId,
      fallbackName: player.className
    },
    {
      label: "Background",
      id: player.backgroundId,
      fallbackName: player.backgroundName
    }
  ];
  const classLevelEntries = Object.entries(player.classLevels);
  const skillEntries = Object.entries(player.proficiencies?.skills ?? {});
  const spellSlotEntries = Object.entries(player.resources?.spellSlots ?? {});
  const currencyEntries = Object.entries(player.resources?.currency ?? {}).filter(([, amount]) => amount !== null);
  const hasMagicData =
    Boolean(player.grants.spells.length) ||
    Boolean(player.spellbook.knownSpellIds.length) ||
    Boolean(player.spellbook.preparedSpellIds.length) ||
    Boolean(player.spellbook.cantripIds.length) ||
    Boolean(spellSlotEntries.length);

  async function handleRemoveInventory(index: number) {
    const activePlayer = player;

    if (!activePlayer) {
      return;
    }

    const removeKey = `inventory-${index}`;
    setActiveRemoveKey(removeKey);
    setActionError(null);
    setActionMessage(null);

    try {
      const response = await fetch("/api/assign", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          campaignId,
          playerId: activePlayer.id,
          target: "inventory",
          index
        })
      });
      const payload = (await response.json()) as {
        status?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Unable to remove this inventory entry.");
      }

      setPlayer((current) => {
        if (!current || !current.inventory.stacks[index]) {
          return current;
        }

        const nextStacks = [...current.inventory.stacks];
        const existingStack = nextStacks[index];
        const existingQty = typeof existingStack.qty === "number" ? existingStack.qty : 1;

        if (payload.status === "decremented" && existingQty > 1) {
          nextStacks[index] = {
            ...existingStack,
            qty: existingQty - 1
          };
        } else {
          nextStacks.splice(index, 1);
        }

        return {
          ...current,
          inventory: {
            ...current.inventory,
            stacks: nextStacks
          }
        };
      });

      setActionMessage(payload.status === "decremented" ? "Item quantity reduced by one." : "Inventory entry removed.");
    } catch (removeError) {
      setActionError(removeError instanceof Error ? removeError.message : "Unable to remove this inventory entry.");
    } finally {
      setActiveRemoveKey(null);
    }
  }

  async function handleRemoveGrant(grantType: RemovableGrantType, index: number) {
    const activePlayer = player;

    if (!activePlayer) {
      return;
    }

    const removeKey = `grant-${grantType}-${index}`;
    setActiveRemoveKey(removeKey);
    setActionError(null);
    setActionMessage(null);

    try {
      const response = await fetch("/api/assign", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          campaignId,
          playerId: activePlayer.id,
          target: "grant",
          grantType,
          index
        })
      });
      const payload = (await response.json()) as {
        status?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Unable to remove this grant entry.");
      }

      setPlayer((current) => {
        if (!current || !current.grants[grantType][index]) {
          return current;
        }

        return {
          ...current,
          grants: {
            ...current.grants,
            [grantType]: current.grants[grantType].filter((_, entryIndex) => entryIndex !== index)
          }
        };
      });

      setActionMessage(`${readableId(grantType)} entry removed.`);
    } catch (removeError) {
      setActionError(removeError instanceof Error ? removeError.message : "Unable to remove this grant entry.");
    } finally {
      setActiveRemoveKey(null);
    }
  }

  function renderLinkedTitle(id: string | null, fallbackName: string | null | undefined) {
    const record = id ? linkedLookup[id] : null;
    const href = getCompendiumHref(record);
    const title = record?.name ?? fallbackName ?? readableId(id);

    if (href) {
      return (
        <Link className="transition hover:text-crt-accent" href={href}>
          {title}
        </Link>
      );
    }

    return title;
  }

  function renderGrantCards(entries: PlayerGrantEntry[], emptyBody: string, grantType: RemovableGrantType) {
    if (!entries.length) {
      return <p className="text-sm text-crt-muted">{emptyBody}</p>;
    }

    return (
      <div className="grid gap-3">
        {entries.map((entry, index) => {
          const record = entry.refId ? linkedLookup[entry.refId] : null;
          const summary = getReferenceSummary(record);
          const meta = getReferenceMeta(record);

          return (
            <div className="border-2 border-crt-border bg-crt-panel-2 p-3" key={`${entry.refId ?? entry.name ?? "grant"}-${index}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold uppercase tracking-[0.12em] text-crt-text">
                    {renderLinkedTitle(entry.refId, entry.name)}
                  </p>
                  <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-crt-muted">
                    {entry.sourceType ?? "source"} / {readableId(entry.sourceId)}
                    {typeof entry.grantedAtLevel === "number" ? ` / L${entry.grantedAtLevel}` : ""}
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <div className="text-right text-[10px] uppercase tracking-[0.16em] text-crt-accent">
                    {entry.isCantrip === true ? <div>Cantrip</div> : null}
                    {entry.prepared === true ? <div>Prepared</div> : null}
                    {entry.choiceGroupId ? <div>Choice</div> : null}
                  </div>
                  <button
                    aria-label={`Remove ${entry.name ?? entry.refId ?? "entry"}`}
                    className="inline-flex h-8 min-w-[2.5rem] items-center justify-center border border-crt-danger px-2 text-[10px] font-bold uppercase tracking-[0.12em] text-crt-danger transition hover:bg-crt-danger hover:text-crt-bg disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={activeRemoveKey === `grant-${grantType}-${index}`}
                    onClick={() => void handleRemoveGrant(grantType, index)}
                    type="button"
                  >
                    [-]
                  </button>
                </div>
              </div>
              {meta.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {meta.map((item) => (
                    <span
                      className="border border-crt-border px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-crt-muted"
                      key={`${entry.refId ?? entry.name}-${item.label}`}
                    >
                      {item.label}: <span className="text-crt-text">{item.value}</span>
                    </span>
                  ))}
                </div>
              ) : null}
              {summary ? <p className="mt-3 text-sm leading-6 text-crt-muted">{summary}</p> : null}
            </div>
          );
        })}
      </div>
    );
  }

  function renderInventoryStacks() {
    const activePlayer = player;

    if (!activePlayer) {
      return null;
    }

    if (!activePlayer.inventory.stacks.length) {
      return <p className="text-sm text-crt-muted">No inventory stacks are stored on the player document.</p>;
    }

    return (
      <div className="grid gap-3">
        {activePlayer.inventory.stacks.map((stack: PlayerInventoryStack, index) => {
          const record = stack.itemId ? linkedLookup[stack.itemId] : null;
          const summary = getReferenceSummary(record);
          const meta = getReferenceMeta(record);

          return (
            <div className="border-2 border-crt-border bg-crt-panel-2 p-3" key={`${stack.itemId ?? "item"}-${index}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold uppercase tracking-[0.12em] text-crt-text">
                    {renderLinkedTitle(stack.itemId, null)}
                  </p>
                  <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-crt-muted">
                    {stack.containerTag ?? "gear"} / qty {formatNumber(stack.qty)}
                    {stack.sourceType ? ` / from ${stack.sourceType}` : ""}
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <div className="flex flex-wrap justify-end gap-2 text-[10px] uppercase tracking-[0.16em]">
                    {stack.equipped ? <span className="border border-crt-accent px-2 py-1 text-crt-accent">Equipped</span> : null}
                    {stack.attuned ? <span className="border border-crt-border px-2 py-1 text-crt-text">Attuned</span> : null}
                  </div>
                  <button
                    aria-label={`Remove ${stack.itemId ?? "item"}`}
                    className="inline-flex h-8 min-w-[2.5rem] items-center justify-center border border-crt-danger px-2 text-[10px] font-bold uppercase tracking-[0.12em] text-crt-danger transition hover:bg-crt-danger hover:text-crt-bg disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={activeRemoveKey === `inventory-${index}`}
                    onClick={() => void handleRemoveInventory(index)}
                    type="button"
                  >
                    [-]
                  </button>
                </div>
              </div>
              {meta.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {meta.map((item) => (
                    <span
                      className="border border-crt-border px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-crt-muted"
                      key={`${stack.itemId ?? "item"}-${item.label}`}
                    >
                      {item.label}: <span className="text-crt-text">{item.value}</span>
                    </span>
                  ))}
                </div>
              ) : null}
              {summary ? <p className="mt-3 text-sm leading-6 text-crt-muted">{summary}</p> : null}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.35em] text-crt-accent">Character Sheet</p>
          <h2 className="mt-2 text-3xl font-bold uppercase tracking-[0.12em] text-crt-text">{player.name ?? player.id}</h2>
          <p className="mt-2 text-sm text-crt-muted">
            {player.raceName} / {player.className} / {player.backgroundName}
          </p>
          <p className="mt-2 text-[10px] uppercase tracking-[0.18em] text-crt-muted">
            Firestore player + sheet state
            {isReferenceLoading ? " / syncing DnData references..." : " / DnData links ready"}
          </p>
        </div>
        <div className="border-2 border-crt-border bg-crt-panel px-4 py-3 text-right text-xs uppercase tracking-[0.2em] text-crt-muted">
          <div>Level {formatNumber(player.level)}</div>
          <div className="mt-1">Order {formatNumber(player.partyOrder)}</div>
          <div className="mt-1">{player.active ? "Active" : "Inactive"}</div>
        </div>
      </div>
      {actionError ? (
        <div className="border-2 border-crt-danger bg-crt-panel px-4 py-3 text-xs font-bold uppercase tracking-[0.16em] text-crt-danger">
          {actionError}
        </div>
      ) : null}
      {actionMessage ? (
        <div className="border-2 border-crt-accent bg-crt-panel px-4 py-3 text-xs font-bold uppercase tracking-[0.16em] text-crt-accent">
          {actionMessage}
        </div>
      ) : null}

      <div className="grid gap-4 2xl:grid-cols-[320px_1fr]">
        <div className="space-y-4">
          <PixelPanel className="space-y-4">
            <PlayerPortrait
              campaignId={campaignId}
              className="aspect-[3/4] w-full rounded-sm border-2 border-crt-border object-cover"
              player={player}
              variant="detail"
            />
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="border border-crt-border px-2 py-2 text-[10px] uppercase tracking-[0.15em] text-crt-muted">
                HP
                <span className="block pt-1 text-base font-bold text-crt-text">
                  {formatNumber(player.hpCurrent)}/{formatNumber(player.hpMax)}
                </span>
              </div>
              <div className="border border-crt-border px-2 py-2 text-[10px] uppercase tracking-[0.15em] text-crt-muted">
                Temp HP
                <span className="block pt-1 text-base font-bold text-crt-text">{formatNumber(player.tempHp)}</span>
              </div>
              <div className="border border-crt-border px-2 py-2 text-[10px] uppercase tracking-[0.15em] text-crt-muted">
                AC
                <span className="block pt-1 text-base font-bold text-crt-text">{formatNumber(player.ac)}</span>
              </div>
              <div className="border border-crt-border px-2 py-2 text-[10px] uppercase tracking-[0.15em] text-crt-muted">
                Speed
                <span className="block pt-1 text-base font-bold text-crt-text">{formatNumber(player.speed)}</span>
              </div>
            </div>
          </PixelPanel>

          <PixelPanel className="space-y-4">
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-crt-muted">Identity</p>
            <div className="space-y-3 text-sm text-crt-muted">
              <p>
                <span className="font-bold text-crt-text">Player ID:</span> {player.playerId}
              </p>
              <p>
                <span className="font-bold text-crt-text">Portrait Path:</span> {player.portraitStoragePath ?? "—"}
              </p>
              <p>
                <span className="font-bold text-crt-text">Schema Version:</span> {formatNumber(player.schemaVersion)}
              </p>
              <p>
                <span className="font-bold text-crt-text">Updated:</span> {formatDateLabel(player.updatedAt)}
              </p>
            </div>
          </PixelPanel>

          <PixelPanel className="space-y-4">
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-crt-muted">Conditions & Notes</p>
            <div className="space-y-3 text-sm text-crt-muted">
              <p>
                <span className="font-bold text-crt-text">Conditions:</span>{" "}
                {player.conditions.length ? player.conditions.join(", ") : "—"}
              </p>
              <p>
                <span className="font-bold text-crt-text">Notes:</span> {player.notes ?? "—"}
              </p>
            </div>
          </PixelPanel>
        </div>

        <div className="space-y-4">
          <PixelPanel className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-crt-muted">Origin & Training</p>
              <p className="text-[10px] uppercase tracking-[0.16em] text-crt-muted">
                Stored ids hydrate against the local compendium API
              </p>
            </div>
            <div className="grid gap-3 xl:grid-cols-3">
              {coreReferences.map((entry) => {
                const record = entry.id ? linkedLookup[entry.id] : null;
                const meta = getReferenceMeta(record);
                const summary = getReferenceSummary(record);

                return (
                  <div className="border-2 border-crt-border bg-crt-panel-2 p-4" key={entry.label}>
                    <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-crt-accent">{entry.label}</p>
                    <p className="mt-2 text-sm font-bold uppercase tracking-[0.1em] text-crt-text">
                      {renderLinkedTitle(entry.id, entry.fallbackName)}
                    </p>
                    {meta.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {meta.map((item) => (
                          <span
                            className="border border-crt-border px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-crt-muted"
                            key={`${entry.label}-${item.label}`}
                          >
                            {item.label}: <span className="text-crt-text">{item.value}</span>
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {summary ? <p className="mt-3 text-sm leading-6 text-crt-muted">{summary}</p> : null}
                  </div>
                );
              })}
            </div>
          </PixelPanel>

          <PixelPanel className="space-y-4">
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-crt-muted">Ability Scores</p>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              {abilityOrder.map((ability) => {
                const score = player.abilityScores[ability];

                return (
                  <div className="border border-crt-border px-4 py-3 text-center" key={ability}>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-crt-muted">{ability}</p>
                    <p className="mt-1 text-2xl font-bold text-crt-text">{formatNumber(score)}</p>
                    <p className="text-xs uppercase tracking-[0.15em] text-crt-accent">{abilityModifier(score)}</p>
                  </div>
                );
              })}
            </div>
          </PixelPanel>

          <div className="grid gap-4 xl:grid-cols-2">
            <PixelPanel className="space-y-4">
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-crt-muted">Combat & Proficiencies</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="border border-crt-border px-3 py-2 text-xs text-crt-muted">
                  Hit Points
                  <span className="block pt-1 text-lg font-bold text-crt-text">
                    {formatNumber(player.vitals.hpCurrent)}/{formatNumber(player.vitals.hpMax)}
                  </span>
                </div>
                <div className="border border-crt-border px-3 py-2 text-xs text-crt-muted">
                  Temp HP
                  <span className="block pt-1 text-lg font-bold text-crt-text">{formatNumber(player.vitals.tempHp)}</span>
                </div>
                <div className="border border-crt-border px-3 py-2 text-xs text-crt-muted">
                  Armor Class
                  <span className="block pt-1 text-lg font-bold text-crt-text">{formatNumber(player.vitals.ac)}</span>
                </div>
                <div className="border border-crt-border px-3 py-2 text-xs text-crt-muted">
                  Speed
                  <span className="block pt-1 text-lg font-bold text-crt-text">{formatNumber(player.vitals.speed)}</span>
                </div>
              </div>
              <div className="space-y-3 text-sm text-crt-muted">
                <p>
                  <span className="font-bold text-crt-text">Saving Throws:</span>{" "}
                  {player.proficiencies?.savingThrows.length ? player.proficiencies.savingThrows.join(", ") : "—"}
                </p>
                <div>
                  <p className="font-bold text-crt-text">Skills</p>
                  {skillEntries.length ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {skillEntries.map(([skill, level]) => (
                        <span
                          className="border border-crt-border px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-crt-muted"
                          key={skill}
                        >
                          {readableId(skill)}: <span className="text-crt-text">{readableId(level)}</span>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2">No explicit skill proficiencies stored.</p>
                  )}
                </div>
              </div>
            </PixelPanel>

            <PixelPanel className="space-y-4">
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-crt-muted">Progression & Build</p>
              <div className="space-y-3 text-sm text-crt-muted">
                <p>
                  <span className="font-bold text-crt-text">Class Levels:</span>{" "}
                  {classLevelEntries.length
                    ? classLevelEntries.map(([id, level]) => `${readableId(id)} ${formatNumber(level)}`).join(", ")
                    : "—"}
                </p>
                <p>
                  <span className="font-bold text-crt-text">Advancement:</span>{" "}
                  {player.advancement?.mode ? readableId(player.advancement.mode) : "—"}
                  {player.advancement?.xpEnabled === false ? " (XP disabled)" : ""}
                </p>
                <p>
                  <span className="font-bold text-crt-text">XP:</span> {formatNumber(player.advancement?.xp)}
                </p>
                <div>
                  <p className="font-bold text-crt-text">Resolver Sources</p>
                  {player.buildMeta && Object.keys(player.buildMeta.resolvedBy).length ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {Object.entries(player.buildMeta.resolvedBy).map(([key, value]) => (
                        <span
                          className="border border-crt-border px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-crt-muted"
                          key={key}
                        >
                          {key}: <span className="text-crt-text">{value}</span>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2">No resolver metadata stored.</p>
                  )}
                </div>
                <div>
                  <p className="font-bold text-crt-text">Build Choices</p>
                  {player.buildChoices.length ? (
                    <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words bg-crt-bg/70 p-3 text-xs text-crt-text">
                      {JSON.stringify(player.buildChoices, null, 2)}
                    </pre>
                  ) : (
                    <p className="mt-2">No build choices stored.</p>
                  )}
                </div>
                <div>
                  <p className="font-bold text-crt-text">Pending Prompts</p>
                  {player.pendingChoicePrompts.length ? (
                    <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words bg-crt-bg/70 p-3 text-xs text-crt-text">
                      {JSON.stringify(player.pendingChoicePrompts, null, 2)}
                    </pre>
                  ) : (
                    <p className="mt-2">No pending build prompts.</p>
                  )}
                </div>
              </div>
            </PixelPanel>
          </div>

          <LevelUpPanel
            campaignId={campaignId}
            onLevelApplied={() => {
              setRefreshKey((current) => current + 1);
            }}
            playerId={player.id}
          />

          <PixelPanel className="space-y-4">
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-crt-muted">Traits & Features</p>
            <div className="grid gap-4 xl:grid-cols-2">
              <div className="space-y-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-crt-accent">Ancestry Traits</p>
                {renderGrantCards(player.grants.traits, "No species traits are stored on this player.", "traits")}
              </div>
              <div className="space-y-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-crt-accent">Class & Background Features</p>
                {renderGrantCards(
                  player.grants.features,
                  "No class or background features are stored on this player.",
                  "features"
                )}
              </div>
            </div>
            <div className="border-t border-crt-border pt-4 text-sm text-crt-muted">
              <p>
                <span className="font-bold text-crt-text">Sheet Feature IDs:</span>{" "}
                {player.features.featureIds.length ? player.features.featureIds.map((id) => readableId(id)).join(", ") : "—"}
              </p>
            </div>
          </PixelPanel>

          {hasMagicData ? (
            <PixelPanel className="space-y-4">
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-crt-muted">Spellbook & Magic</p>
              <div className="grid gap-4 xl:grid-cols-2">
                <div className="space-y-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-crt-accent">Granted Spells</p>
                  {renderGrantCards(player.grants.spells, "No granted spell refs are stored on this player.", "spells")}
                </div>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-crt-accent">Known</p>
                    <p className="text-sm text-crt-muted">
                      {player.spellbook.knownSpellIds.length
                        ? player.spellbook.knownSpellIds.map((id) => readableId(id)).join(", ")
                        : "—"}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-crt-accent">Prepared</p>
                    <p className="text-sm text-crt-muted">
                      {player.spellbook.preparedSpellIds.length
                        ? player.spellbook.preparedSpellIds.map((id) => readableId(id)).join(", ")
                        : "—"}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-crt-accent">Cantrips</p>
                    <p className="text-sm text-crt-muted">
                      {player.spellbook.cantripIds.length
                        ? player.spellbook.cantripIds.map((id) => readableId(id)).join(", ")
                        : "—"}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-crt-accent">Spell Slots</p>
                    {spellSlotEntries.length ? (
                      <div className="grid gap-2">
                        {spellSlotEntries.map(([level, slotState]) => (
                          <div className="border border-crt-border px-3 py-2 text-sm text-crt-muted" key={level}>
                            Level {level}
                            <span className="block pt-1 text-base font-bold text-crt-text">
                              {formatNumber(slotState.total - slotState.used)}/{formatNumber(slotState.total)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-crt-muted">No spell slots stored.</p>
                    )}
                  </div>
                </div>
              </div>
            </PixelPanel>
          ) : null}

          <PixelPanel className="space-y-4">
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-crt-muted">Inventory & Equipment</p>
            <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-crt-accent">Inventory Stacks</p>
                {renderInventoryStacks()}
              </div>
              <div className="space-y-4 text-sm text-crt-muted">
                <div>
                  <p className="font-bold text-crt-text">Equipped Weapons</p>
                  <p className="mt-2">
                    {player.equipment.equippedWeaponIds.length
                      ? player.equipment.equippedWeaponIds.map((id) => readableId(id)).join(", ")
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="font-bold text-crt-text">Equipped Armor</p>
                  <p className="mt-2">
                    {player.equipment.equippedArmorIds.length
                      ? player.equipment.equippedArmorIds.map((id) => readableId(id)).join(", ")
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="font-bold text-crt-text">Sheet Inventory IDs</p>
                  <p className="mt-2">
                    {player.inventory.sheetItemIds.length
                      ? player.inventory.sheetItemIds.map((id) => readableId(id)).join(", ")
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="font-bold text-crt-text">Granted Items</p>
                  {renderGrantCards(player.grants.items, "No granted item refs are stored on this player.", "items")}
                </div>
              </div>
            </div>
          </PixelPanel>

          <PixelPanel className="space-y-4">
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-crt-muted">Resources</p>
            <div className="grid gap-4 xl:grid-cols-2">
              <div className="space-y-3 text-sm text-crt-muted">
                <p>
                  <span className="font-bold text-crt-text">Inspiration:</span>{" "}
                  {player.resources?.inspiration === true ? "Yes" : "No"}
                </p>
                <p>
                  <span className="font-bold text-crt-text">Concentration:</span>{" "}
                  {player.resources?.concentration ?? "—"}
                </p>
                <p>
                  <span className="font-bold text-crt-text">Hit Dice:</span>{" "}
                  {player.resources?.hitDice
                    ? `${player.resources.hitDice.dieType ?? "—"} (${formatNumber(player.resources.hitDice.total)}/${formatNumber(
                        player.resources.hitDice.used !== null && player.resources.hitDice.total !== null
                          ? (player.resources.hitDice.total ?? 0) - (player.resources.hitDice.used ?? 0)
                          : null
                      )} remaining)`
                    : "—"}
                </p>
                <p>
                  <span className="font-bold text-crt-text">Death Saves:</span>{" "}
                  {player.resources?.deathSaves
                    ? `${player.resources.deathSaves.successes} success / ${player.resources.deathSaves.failures} failure`
                    : "—"}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-crt-accent">Currency</p>
                {currencyEntries.length ? (
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                    {currencyEntries.map(([currency, amount]) => (
                      <div className="border border-crt-border px-3 py-2 text-center" key={currency}>
                        <p className="text-[10px] uppercase tracking-[0.16em] text-crt-muted">{currency}</p>
                        <p className="mt-1 text-lg font-bold text-crt-text">{formatNumber(amount)}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-crt-muted">No currency state stored.</p>
                )}
              </div>
            </div>
          </PixelPanel>
        </div>
      </div>
    </div>
  );
}
