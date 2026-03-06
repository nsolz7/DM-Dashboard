"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { CompendiumLinkedRecord, Player, PlayerGrantEntry } from "@/types";
import { PlayerEquipmentManager } from "@/components/campaign/PlayerEquipmentManager";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { LoadingPanel } from "@/components/shared/LoadingPanel";
import { PlayerPortrait } from "@/components/shared/PlayerPortrait";
import { LevelUpPanel } from "@/components/campaign/LevelUpPanel";
import { useCampaign } from "@/components/providers/CampaignProvider";
import { PixelPanel } from "@/components/ui/PixelPanel";
import { getCompendiumLinkedRecord } from "@/lib/compendium/api";
import { getPlayerDetail } from "@/lib/firebase/firestore";
import { abilityModifier, formatNumber, readableId, toStringValue } from "@/lib/utils";

const abilityOrder = ["str", "dex", "con", "int", "wis", "cha"] as const;
type RemovableGrantType = keyof Player["grants"];
type PlayerDetailTab = "about" | "advancement" | "traits" | "inventory" | "resources";
type AboutSubTab = "species" | "class" | "background";

const playerDetailTabs: Array<{ id: PlayerDetailTab; label: string }> = [
  { id: "about", label: "About" },
  { id: "advancement", label: "Character Advancement" },
  { id: "traits", label: "Traits & Features" },
  { id: "inventory", label: "Inventory & Equipment" },
  { id: "resources", label: "Resources" }
];

const aboutSubTabs: Array<{ id: AboutSubTab; label: string }> = [
  { id: "species", label: "Species" },
  { id: "class", label: "Class" },
  { id: "background", label: "Background" }
];

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
  const resolvedId = toStringValue(getNestedValue(record.raw, ["id"])) ?? record.id;
  return route ? `/compendium/${route}/${encodeURIComponent(resolvedId)}` : null;
}

function getReferenceSummary(record: CompendiumLinkedRecord | null | undefined): string | null {
  return truncateText(record?.summary ?? null, 220);
}

function getReferenceDescription(record: CompendiumLinkedRecord | null | undefined): string | null {
  if (!record) {
    return null;
  }

  const source = record.raw;
  const candidates = [
    formatReferenceValue(getNestedValue(source, ["description"])),
    formatReferenceValue(getNestedValue(source, ["descriptionRaw"])),
    formatReferenceValue(getNestedValue(source, ["lore", "summary"])),
    formatReferenceValue(getNestedValue(source, ["summary"])),
    formatReferenceValue(getNestedValue(source, ["source", "descriptionRaw"])),
    formatReferenceValue(getNestedValue(source, ["details", "description"])),
    record.summary
  ];
  const description = candidates.find((value): value is string => Boolean(value));

  return description ? normalizeText(description) : null;
}

function getFirstPathValue(source: unknown, paths: string[][]): string | null {
  for (const path of paths) {
    const value = formatReferenceValue(getNestedValue(source, path));

    if (value) {
      return value;
    }
  }

  return null;
}

function getValueOrDash(value: string | null | undefined): string {
  return value ?? "—";
}

function getHitDieSizeFromValue(hitDie: string | null | undefined): string | null {
  if (!hitDie) {
    return null;
  }

  const match = hitDie.match(/d(\d+)/i);
  return match?.[1] ?? null;
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

function isLinkedRecord(value: unknown): value is CompendiumLinkedRecord {
  const record = getRecord(value);

  if (!record) {
    return false;
  }

  return (
    typeof record.id === "string" &&
    typeof record.dataset === "string" &&
    typeof record.name === "string" &&
    ("summary" in record ? record.summary === null || typeof record.summary === "string" : true) &&
    Boolean(getRecord(record.raw))
  );
}

async function fetchLinkedRecords(requests: LinkedReferenceRequest[]): Promise<CompendiumLinkedRecord[]> {
  try {
    const response = await fetch("/api/compendium/linked", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ records: requests }),
      cache: "no-store"
    });

    if (response.ok) {
      const payload = (await response.json()) as { records?: unknown[] };
      const records = Array.isArray(payload.records) ? payload.records.filter(isLinkedRecord) : [];

      if (records.length || requests.length === 0) {
        return records;
      }
    }
  } catch {
    // Fallback to direct client-side fetch below.
  }

  return Promise.all(requests.map((request) => getCompendiumLinkedRecord(request.id, request.fallbackName)));
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
  const [activeTab, setActiveTab] = useState<PlayerDetailTab>("about");
  const [activeAboutTab, setActiveAboutTab] = useState<AboutSubTab>("species");

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

        const linkedRecords = await fetchLinkedRecords(referenceRequests);

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
  const speciesEntry = coreReferences[0];
  const classEntry = coreReferences[1];
  const backgroundEntry = coreReferences[2];
  const speciesRecord = speciesEntry.id ? linkedLookup[speciesEntry.id] : null;
  const classRecord = classEntry.id ? linkedLookup[classEntry.id] : null;
  const backgroundRecord = backgroundEntry.id ? linkedLookup[backgroundEntry.id] : null;
  const speciesSource = speciesRecord?.raw ?? null;
  const classSource = classRecord?.raw ?? null;
  const backgroundSource = backgroundRecord?.raw ?? null;
  const speciesCharacteristics = [
    {
      label: "Personality",
      value: getFirstPathValue(speciesSource, [
        ["extracted", "characteristics", "personality"],
        ["characteristics", "personality"],
        ["lore", "personality"],
        ["personality"]
      ])
    },
    {
      label: "Homelands",
      value: getFirstPathValue(speciesSource, [
        ["extracted", "characteristics", "homelands"],
        ["characteristics", "homelands"],
        ["lore", "homelands"],
        ["homelands"]
      ])
    },
    {
      label: "Favored Climate",
      value: getFirstPathValue(speciesSource, [
        ["extracted", "characteristics", "favoredClimate"],
        ["characteristics", "favoredClimate"],
        ["ecology", "favoredClimate"],
        ["favoredClimate"]
      ])
    },
    {
      label: "Favored Terrain",
      value: getFirstPathValue(speciesSource, [
        ["extracted", "characteristics", "favoredTerrain"],
        ["characteristics", "favoredTerrain"],
        ["ecology", "favoredTerrain"],
        ["favoredTerrain"]
      ])
    },
    {
      label: "Description",
      value: getFirstPathValue(speciesSource, [
        ["extracted", "characteristics", "description"],
        ["characteristics", "description"],
        ["extracted", "lore", "summary"],
        ["description"],
        ["descriptionRaw"],
        ["lore", "summary"],
        ["summary"]
      ])
    }
  ];
  const speciesMechanics = [
    {
      label: "Age",
      value: getFirstPathValue(speciesSource, [
        ["extracted", "characteristics", "age"],
        ["extracted", "mechanics", "age"],
        ["mechanics", "age"],
        ["age"],
        ["traits", "age"]
      ])
    },
    {
      label: "Type",
      value: getFirstPathValue(speciesSource, [
        ["extracted", "mechanics", "type"],
        ["mechanics", "type"],
        ["taxonomy", "type"],
        ["type"]
      ])
    },
    {
      label: "Size",
      value: getFirstPathValue(speciesSource, [
        ["extracted", "mechanics", "size"],
        ["mechanics", "size"],
        ["taxonomy", "size"],
        ["size"]
      ])
    },
    {
      label: "Speed",
      value: getFirstPathValue(speciesSource, [
        ["extracted", "mechanics", "speed", "walk"],
        ["extracted", "mechanics", "speed"],
        ["mechanics", "speed"],
        ["stats", "speed", "raw"],
        ["speed"]
      ])
    },
    {
      label: "Darkvision",
      value: getFirstPathValue(speciesSource, [
        ["extracted", "mechanics", "darkvision", "rangeFeet"],
        ["extracted", "mechanics", "darkvision", "has"],
        ["extracted", "mechanics", "darkvision"],
        ["mechanics", "darkvision"],
        ["stats", "senses", "darkvision"],
        ["senses", "darkvision"],
        ["darkvision"]
      ])
    },
    {
      label: "Languages",
      value: getFirstPathValue(speciesSource, [
        ["extracted", "mechanics", "languages"],
        ["mechanics", "languages"],
        ["stats", "languages", "raw"],
        ["languages"]
      ])
    }
  ];
  const speciesLore = [
    {
      label: "Lore Summary",
      value: getFirstPathValue(speciesSource, [["extracted", "lore", "summary"], ["lore", "summary"], ["summary"], ["description"]])
    },
    {
      label: "Naming",
      value: getFirstPathValue(speciesSource, [
        ["extracted", "naming", "summary"],
        ["lore", "naming"],
        ["naming", "summary"],
        ["naming"]
      ])
    },
    {
      label: "Appearance",
      value: getFirstPathValue(speciesSource, [
        ["extracted", "appearance", "summary"],
        ["lore", "appearance"],
        ["appearance", "summary"],
        ["appearance"]
      ])
    },
    {
      label: "Society",
      value: getFirstPathValue(speciesSource, [
        ["extracted", "society", "summary"],
        ["lore", "society"],
        ["society", "summary"],
        ["society"]
      ])
    },
    {
      label: "Origins",
      value: getFirstPathValue(speciesSource, [
        ["extracted", "origins", "summary"],
        ["lore", "origins"],
        ["origins", "summary"],
        ["origins"]
      ])
    },
    {
      label: "Alignment",
      value: getFirstPathValue(speciesSource, [
        ["extracted", "alignment", "summary"],
        ["lore", "alignment"],
        ["alignment", "summary"],
        ["alignment"],
        ["taxonomy", "alignment"]
      ])
    },
    {
      label: "Habitat",
      value: getFirstPathValue(speciesSource, [
        ["extracted", "habitat", "summary"],
        ["lore", "habitat"],
        ["habitat", "summary"],
        ["habitat"]
      ])
    }
  ];
  const classHitDie = getFirstPathValue(classSource, [["classification", "hitDie"], ["hitDie"], ["stats", "hitDie"]]);
  const classHitDieSize =
    getFirstPathValue(classSource, [["classification", "hitDieSize"], ["hitDieSize"]]) ?? getHitDieSizeFromValue(classHitDie);
  const classClassification = [
    {
      label: "Hit Die",
      value: classHitDie
    },
    {
      label: "Hit Die Size",
      value: classHitDieSize
    },
    {
      label: "Primary Abilities",
      value: getFirstPathValue(classSource, [["classification", "primaryAbilities"], ["primaryAbility"], ["primaryAbilities"]])
    }
  ];
  const classCasterProgression = [
    {
      label: "Caster Progression",
      value: getFirstPathValue(classSource, [
        ["classification", "casterProgression"],
        ["casterProgression"],
        ["spellcasting", "progression"],
        ["spellcastingProgression"]
      ])
    },
    {
      label: "Spellcasting Ability",
      value: getFirstPathValue(classSource, [
        ["spellcastingAbility"],
        ["spellcasting", "ability"],
        ["classification", "spellcastingAbility"]
      ])
    },
    {
      label: "Subclass Name",
      value: getFirstPathValue(classSource, [["classification", "subclassName"], ["subclassName"], ["subclass", "name"]])
    },
    {
      label: "Subclass Level",
      value: getFirstPathValue(classSource, [["classification", "subclassLevel"], ["subclassLevel"], ["progression", "subclassLevel"]])
    },
    {
      label: "Ability Score Levels",
      value: getFirstPathValue(classSource, [
        ["classification", "abilityScoreLevels"],
        ["abilityScoreLevels"],
        ["progression", "abilityScoreLevels"]
      ])
    }
  ];
  const backgroundDetails = [
    {
      label: "Proficiencies",
      value: getFirstPathValue(backgroundSource, [
        ["proficiencies", "skills", "raw"],
        ["proficiencies", "skills", "fixed"],
        ["proficiencies", "skills"],
        ["skills"],
        ["stats", "skills"]
      ])
    },
    {
      label: "Tools",
      value: getFirstPathValue(backgroundSource, [
        ["proficiencies", "tools", "raw"],
        ["proficiencies", "tools", "fixed"],
        ["tools"],
        ["toolProficiencies"]
      ])
    },
    {
      label: "Summary",
      value: getFirstPathValue(backgroundSource, [
        ["text", "summary"],
        ["summary"],
        ["description"],
        ["descriptionRaw"],
        ["lore", "summary"]
      ])
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
  const hasGrantedItems = player.grants.items.length > 0;

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

          <PixelPanel className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {playerDetailTabs.map((tab) => (
                <button
                  className={`border px-3 py-2 text-[10px] font-bold uppercase tracking-[0.16em] transition ${
                    activeTab === tab.id
                      ? "border-crt-accent bg-crt-panel text-crt-accent"
                      : "border-crt-border bg-crt-panel-2 text-crt-text hover:border-crt-accent"
                  }`}
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  type="button"
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </PixelPanel>

          {activeTab === "about" ? (
            <PixelPanel className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-crt-muted">Origin & Training</p>
                <p className="text-[10px] uppercase tracking-[0.16em] text-crt-muted">
                  Species, class, and background details hydrated from the compendium API
                </p>
              </div>
              <div className="flex flex-wrap gap-2 border-b border-crt-border pb-3">
                {aboutSubTabs.map((tab) => (
                  <button
                    className={`border px-3 py-2 text-[10px] font-bold uppercase tracking-[0.16em] transition ${
                      activeAboutTab === tab.id
                        ? "border-crt-accent bg-crt-panel text-crt-accent"
                        : "border-crt-border bg-crt-panel-2 text-crt-text hover:border-crt-accent"
                    }`}
                    key={tab.id}
                    onClick={() => setActiveAboutTab(tab.id)}
                    type="button"
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {activeAboutTab === "species" ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-crt-accent">Species</p>
                    <p className="mt-2 text-base font-bold uppercase tracking-[0.08em] text-crt-text">
                      {renderLinkedTitle(speciesEntry.id, speciesEntry.fallbackName)}
                    </p>
                  </div>

                  <div className="grid gap-3 xl:grid-cols-2">
                    <div className="border-2 border-crt-border bg-crt-panel-2 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-crt-accent">Characteristics</p>
                      <div className="mt-3 space-y-2 text-sm text-crt-muted">
                        {speciesCharacteristics.map((field) => (
                          <div className="border-b border-crt-border pb-2 last:border-b-0 last:pb-0" key={`species-char-${field.label}`}>
                            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-crt-muted">{field.label}</p>
                            <p className="mt-1 leading-6 text-crt-text">{getValueOrDash(field.value)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="border-2 border-crt-border bg-crt-panel-2 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-crt-accent">Mechanics</p>
                      <div className="mt-3 space-y-2 text-sm text-crt-muted">
                        {speciesMechanics.map((field) => (
                          <div className="border-b border-crt-border pb-2 last:border-b-0 last:pb-0" key={`species-mech-${field.label}`}>
                            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-crt-muted">{field.label}</p>
                            <p className="mt-1 leading-6 text-crt-text">{getValueOrDash(field.value)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="border-2 border-crt-border bg-crt-panel-2 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-crt-accent">Lore</p>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      {speciesLore.map((field) => (
                        <div className="border border-crt-border bg-crt-panel px-3 py-2" key={`species-lore-${field.label}`}>
                          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-crt-muted">{field.label}</p>
                          <p className="mt-1 text-sm leading-6 text-crt-text">{getValueOrDash(field.value)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              {activeAboutTab === "class" ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-crt-accent">Class</p>
                    <p className="mt-2 text-base font-bold uppercase tracking-[0.08em] text-crt-text">
                      {renderLinkedTitle(classEntry.id, classEntry.fallbackName)}
                    </p>
                  </div>

                  <div className="grid gap-3 xl:grid-cols-2">
                    <div className="border-2 border-crt-border bg-crt-panel-2 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-crt-accent">Classification</p>
                      <div className="mt-3 space-y-2 text-sm text-crt-muted">
                        {classClassification.map((field) => (
                          <div className="border-b border-crt-border pb-2 last:border-b-0 last:pb-0" key={`class-class-${field.label}`}>
                            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-crt-muted">{field.label}</p>
                            <p className="mt-1 leading-6 text-crt-text">{getValueOrDash(field.value)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="border-2 border-crt-border bg-crt-panel-2 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-crt-accent">Caster Progression</p>
                      <div className="mt-3 space-y-2 text-sm text-crt-muted">
                        {classCasterProgression.map((field) => (
                          <div className="border-b border-crt-border pb-2 last:border-b-0 last:pb-0" key={`class-caster-${field.label}`}>
                            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-crt-muted">{field.label}</p>
                            <p className="mt-1 leading-6 text-crt-text">{getValueOrDash(field.value)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="border-2 border-crt-border bg-crt-panel-2 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-crt-accent">Class Description</p>
                    <p className="mt-2 text-sm leading-7 text-crt-text">
                      {getValueOrDash(getReferenceDescription(classRecord))}
                    </p>
                  </div>
                </div>
              ) : null}

              {activeAboutTab === "background" ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-crt-accent">Background</p>
                    <p className="mt-2 text-base font-bold uppercase tracking-[0.08em] text-crt-text">
                      {renderLinkedTitle(backgroundEntry.id, backgroundEntry.fallbackName)}
                    </p>
                  </div>

                  <div className="grid gap-3 xl:grid-cols-[0.9fr_1.1fr]">
                    <div className="border-2 border-crt-border bg-crt-panel-2 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-crt-accent">Background Data</p>
                      <div className="mt-3 space-y-2 text-sm text-crt-muted">
                        {backgroundDetails
                          .filter((field) => field.label !== "Summary")
                          .map((field) => (
                            <div
                              className="border-b border-crt-border pb-2 last:border-b-0 last:pb-0"
                              key={`background-${field.label}`}
                            >
                              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-crt-muted">{field.label}</p>
                              <p className="mt-1 leading-6 text-crt-text">{getValueOrDash(field.value)}</p>
                            </div>
                          ))}
                      </div>
                    </div>
                    <div className="border-2 border-crt-border bg-crt-panel-2 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-crt-accent">Summary</p>
                      <p className="mt-2 text-sm leading-7 text-crt-text">
                        {getValueOrDash(backgroundDetails.find((field) => field.label === "Summary")?.value)}
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}
            </PixelPanel>
          ) : null}

          {activeTab === "advancement" ? (
            <LevelUpPanel
              campaignId={campaignId}
              onLevelApplied={() => {
                setRefreshKey((current) => current + 1);
              }}
              playerId={player.id}
            />
          ) : null}

          {activeTab === "traits" ? (
            <>
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
            </>
          ) : null}

          {activeTab === "inventory" ? (
            <>
              <PlayerEquipmentManager
                campaignId={campaignId}
                linkedLookup={linkedLookup}
                onRefresh={() => setRefreshKey((current) => current + 1)}
                player={player}
              />

              {hasGrantedItems ? (
                <PixelPanel className="space-y-4">
                  <p className="text-xs font-bold uppercase tracking-[0.3em] text-crt-muted">Granted Items</p>
                  {renderGrantCards(player.grants.items, "No granted item refs are stored on this player.", "items")}
                </PixelPanel>
              ) : null}
            </>
          ) : null}

          {activeTab === "resources" ? (
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
          ) : null}
        </div>
      </div>
    </div>
  );
}
