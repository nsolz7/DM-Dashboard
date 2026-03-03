"use client";

import { useEffect, useMemo, useState } from "react";

import type { CompendiumDetail as CompendiumDetailType, CompendiumType } from "@/types";
import { CompendiumAssignPanel } from "@/components/compendium/CompendiumAssignPanel";
import { getCompendiumDetail } from "@/lib/compendium/api";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { LoadingPanel } from "@/components/shared/LoadingPanel";
import { PixelPanel } from "@/components/ui/PixelPanel";

interface PreviewField {
  label: string;
  value: string;
}

interface PreviewEntry {
  name: string;
  text: string;
}

type PreviewSection =
  | {
      kind: "fields";
      title: string;
      fields: PreviewField[];
    }
  | {
      kind: "abilities";
      title: string;
      abilities: PreviewField[];
    }
  | {
      kind: "entries";
      title: string;
      entries: PreviewEntry[];
    }
  | {
      kind: "prose";
      title: string;
      body: string;
    };

interface FieldConfig {
  label: string;
  paths: string[][];
}

const commonFieldConfigs: FieldConfig[] = [
  { label: "Publisher", paths: [["publisher"]] },
  { label: "Book", paths: [["book"]] },
  { label: "Source", paths: [["source", "sourceCode"], ["source", "category"]] }
];

const typeFieldConfigs: Record<CompendiumType, FieldConfig[]> = {
  monsters: [
    { label: "Size", paths: [["taxonomy", "size"], ["size"]] },
    { label: "Type", paths: [["taxonomy", "type"], ["type"]] },
    { label: "Alignment", paths: [["taxonomy", "alignment"], ["alignment"]] },
    { label: "CR", paths: [["taxonomy", "challengeRating"], ["challengeRating"]] },
    { label: "XP", paths: [["taxonomy", "xp"], ["xp"]] },
    { label: "AC", paths: [["stats", "armorClass", "raw"], ["stats", "armorClass"]] },
    { label: "HP", paths: [["stats", "hitPoints", "raw"], ["stats", "hitPoints"]] },
    { label: "Speed", paths: [["stats", "speed", "raw"], ["stats", "speed"]] },
    { label: "Senses", paths: [["stats", "senses", "raw"], ["stats", "senses"]] },
    { label: "Languages", paths: [["stats", "languages", "raw"], ["stats", "languages", "list"]] },
    {
      label: "Condition Immunities",
      paths: [["stats", "defenses", "conditionImmunities"], ["stats", "defenses", "immunities"]]
    }
  ],
  species: [
    { label: "Size", paths: [["taxonomy", "size"], ["size"]] },
    { label: "Type", paths: [["taxonomy", "type"], ["type"]] },
    { label: "Speed", paths: [["stats", "speed", "raw"], ["speed"]] },
    { label: "Languages", paths: [["stats", "languages", "raw"], ["languages"]] },
    { label: "Senses", paths: [["stats", "senses", "raw"], ["senses"]] }
  ],
  items: [
    { label: "Category", paths: [["source", "category"], ["taxonomy", "category"], ["category"]] },
    { label: "Type", paths: [["taxonomy", "type"], ["type"]] },
    { label: "Rarity", paths: [["taxonomy", "rarity"], ["rarity"]] },
    { label: "Attunement", paths: [["attunement"], ["requiresAttunement"]] },
    { label: "Weight", paths: [["weight"], ["stats", "weight"]] },
    { label: "Cost", paths: [["cost"], ["value"], ["price"]] },
    { label: "Damage", paths: [["damage"], ["stats", "damage"]] },
    { label: "Properties", paths: [["properties"], ["stats", "properties"]] }
  ],
  backgrounds: [
    { label: "Skill Proficiencies", paths: [["skills"], ["stats", "skills"]] },
    { label: "Tool Proficiencies", paths: [["tools"], ["toolProficiencies"]] },
    { label: "Languages", paths: [["languages"], ["stats", "languages", "raw"]] },
    { label: "Equipment", paths: [["equipment"], ["startingEquipment"]] },
    { label: "Feature", paths: [["feature"], ["features", "traits"]] }
  ],
  classes: [
    { label: "Hit Die", paths: [["hitDie"], ["stats", "hitDie"]] },
    { label: "Primary Ability", paths: [["primaryAbility"], ["spellcastingAbility"]] },
    { label: "Saving Throws", paths: [["savingThrows"], ["proficiencies", "savingThrows"]] },
    { label: "Armor", paths: [["armorProficiencies"], ["proficiencies", "armor"]] },
    { label: "Weapons", paths: [["weaponProficiencies"], ["proficiencies", "weapons"]] },
    { label: "Skills", paths: [["skillChoices"], ["proficiencies", "skills"]] }
  ],
  spells: [
    { label: "Level", paths: [["level"], ["taxonomy", "level"]] },
    { label: "School", paths: [["school"], ["taxonomy", "school"]] },
    { label: "Casting Time", paths: [["castingTime"], ["time"]] },
    { label: "Range", paths: [["range"], ["stats", "range"]] },
    { label: "Duration", paths: [["duration"], ["stats", "duration"]] },
    { label: "Components", paths: [["components"], ["materials"]] },
    { label: "Attack / Save", paths: [["save"], ["attack"], ["dc"]] },
    { label: "Damage / Effect", paths: [["damage"], ["effect"]] }
  ],
  traits: [
    { label: "Category", paths: [["source", "category"], ["category"]] },
    { label: "Prerequisite", paths: [["prerequisite"], ["requirements"]] },
    { label: "Uses", paths: [["uses"], ["charges"]] },
    { label: "Recharge", paths: [["recharge"], ["reset"]] }
  ],
  tables: [
    { label: "Dice", paths: [["dice"], ["roll"]] },
    { label: "Rows", paths: [["rows"], ["table", "rows"]] },
    { label: "Columns", paths: [["columns"], ["table", "columns"]] },
    { label: "Range", paths: [["range"], ["rollRange"]] }
  ]
};

const abilityOrder = [
  { key: "str", label: "STR" },
  { key: "dex", label: "DEX" },
  { key: "con", label: "CON" },
  { key: "int", label: "INT" },
  { key: "wis", label: "WIS" },
  { key: "cha", label: "CHA" }
];

function getScalarPreview(detail: CompendiumDetailType) {
  return Object.entries(detail.raw)
    .filter(([, value]) => ["string", "number", "boolean"].includes(typeof value))
    .filter(([key]) => !["id", "name"].includes(key))
    .slice(0, 10);
}

function getRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function toDisplayLabel(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getNestedValue(source: unknown, path: string[]) {
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

function getFirstDefinedValue(source: Record<string, unknown>, paths: string[][]) {
  for (const path of paths) {
    const value = getNestedValue(source, path);

    if (value !== null && value !== undefined && value !== "") {
      return value;
    }
  }

  return null;
}

function formatFieldValue(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    const normalized = normalizeText(value);
    return normalized ? normalized : null;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    if (!value.length) {
      return null;
    }

    const formattedValues = value
      .map((item) => formatFieldValue(item))
      .filter((item): item is string => Boolean(item));

    if (formattedValues.length === value.length) {
      return formattedValues.join(", ");
    }

    return `${value.length} ${value.length === 1 ? "entry" : "entries"}`;
  }

  const record = getRecord(value);

  if (!record) {
    return null;
  }

  const preferredValue = getFirstDefinedValue(record, [["raw"], ["value"], ["name"], ["text"]]);

  if (preferredValue !== null) {
    return formatFieldValue(preferredValue);
  }

  const scalarPairs = Object.entries(record)
    .filter(([, item]) => ["string", "number", "boolean"].includes(typeof item))
    .slice(0, 3)
    .map(([key, item]) => `${toDisplayLabel(key)}: ${String(item)}`);

  return scalarPairs.length ? scalarPairs.join(" | ") : null;
}

function getPreviewText(value: unknown, maxLength = 320) {
  const formatted = formatFieldValue(value);

  if (!formatted) {
    return null;
  }

  if (formatted.length <= maxLength) {
    return formatted;
  }

  return `${formatted.slice(0, maxLength).trimEnd()}...`;
}

function getNamedEntries(value: unknown, maxItems = 4) {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const entries: PreviewEntry[] = [];

  for (const item of value) {
    const record = getRecord(item);

    if (!record) {
      continue;
    }

    const name = formatFieldValue(record.name) ?? formatFieldValue(record.label) ?? "Feature";
    const text = getPreviewText(record.text ?? record.description ?? record.value, 260);

    if (!text) {
      continue;
    }

    const dedupeKey = `${name}:${text}`;

    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    entries.push({ name, text });

    if (entries.length === maxItems) {
      break;
    }
  }

  return entries;
}

function buildFieldSection(title: string, source: Record<string, unknown>, configs: FieldConfig[]): PreviewSection | null {
  const fields = configs
    .map((config) => {
      const value = formatFieldValue(getFirstDefinedValue(source, config.paths));

      if (!value) {
        return null;
      }

      return {
        label: config.label,
        value
      };
    })
    .filter((item): item is PreviewField => Boolean(item));

  if (!fields.length) {
    return null;
  }

  return {
    kind: "fields",
    title,
    fields
  };
}

function buildAbilitiesSection(source: Record<string, unknown>): PreviewSection | null {
  const abilities = getRecord(getNestedValue(source, ["stats", "abilities"]));

  if (!abilities) {
    return null;
  }

  const values = abilityOrder
    .map((ability) => {
      const value = formatFieldValue(abilities[ability.key]);

      if (!value) {
        return null;
      }

      return {
        label: ability.label,
        value
      };
    })
    .filter((item): item is PreviewField => Boolean(item));

  if (!values.length) {
    return null;
  }

  return {
    kind: "abilities",
    title: "Ability Scores",
    abilities: values
  };
}

function buildProseSection(title: string, source: Record<string, unknown>, paths: string[][], maxLength = 360): PreviewSection | null {
  const body = paths
    .map((path) => getPreviewText(getNestedValue(source, path), maxLength))
    .find((value): value is string => Boolean(value));

  if (!body) {
    return null;
  }

  return {
    kind: "prose",
    title,
    body
  };
}

function buildEntriesSection(title: string, source: Record<string, unknown>, path: string[]): PreviewSection | null {
  const entries = getNamedEntries(getNestedValue(source, path));

  if (!entries.length) {
    return null;
  }

  return {
    kind: "entries",
    title,
    entries
  };
}

function buildFallbackSection(detail: CompendiumDetailType): PreviewSection | null {
  const fields = getScalarPreview(detail).map(([key, value]) => ({
    label: toDisplayLabel(key),
    value: String(value)
  }));

  if (!fields.length) {
    return null;
  }

  return {
    kind: "fields",
    title: "Notable Properties",
    fields
  };
}

function buildPreviewSections(detail: CompendiumDetailType) {
  const sections: PreviewSection[] = [];
  const sourceSection = buildFieldSection("Source", detail.raw, commonFieldConfigs);
  const summarySection = buildFieldSection("Quick View", detail.raw, typeFieldConfigs[detail.type]);

  if (sourceSection) {
    sections.push(sourceSection);
  }

  if (summarySection) {
    sections.push(summarySection);
  }

  if (detail.type === "monsters") {
    const abilities = buildAbilitiesSection(detail.raw);
    const traits = buildEntriesSection("Traits", detail.raw, ["features", "traits"]);
    const actions = buildEntriesSection("Actions", detail.raw, ["features", "actions"]);
    const lore = buildProseSection(
      "Lore",
      detail.raw,
      [["lore", "summary"], ["source", "descriptionRaw"], ["descriptionRaw"]],
      420
    );

    if (abilities) {
      sections.push(abilities);
    }

    if (traits) {
      sections.push(traits);
    }

    if (actions) {
      sections.push(actions);
    }

    if (lore) {
      sections.push(lore);
    }
  } else {
    const overviewTitle =
      detail.type === "spells"
        ? "Spell Text"
        : detail.type === "items"
          ? "Item Notes"
          : detail.type === "classes"
            ? "Class Notes"
            : detail.type === "backgrounds"
              ? "Background Notes"
              : "Description";

    const description = buildProseSection(
      overviewTitle,
      detail.raw,
      [["lore", "summary"], ["description"], ["descriptionRaw"], ["source", "descriptionRaw"]],
      420
    );
    const traits = buildEntriesSection("Features", detail.raw, ["features", "traits"]);
    const actions = buildEntriesSection("Notable Actions", detail.raw, ["features", "actions"]);

    if (description) {
      sections.push(description);
    }

    if (traits) {
      sections.push(traits);
    }

    if (actions) {
      sections.push(actions);
    }
  }

  if (!sections.length) {
    const fallback = buildFallbackSection(detail);

    if (fallback) {
      sections.push(fallback);
    }
  }

  return sections;
}

interface CompendiumDetailProps {
  id: string;
  type: CompendiumType;
}

export function CompendiumDetail({ id, type }: CompendiumDetailProps) {
  const [detail, setDetail] = useState<CompendiumDetailType | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setError(null);

    void getCompendiumDetail(type, id)
      .then((payload) => {
        if (isMounted) {
          setDetail(payload);
        }
      })
      .catch((loadError) => {
        if (isMounted) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load compendium detail.");
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
  }, [id, type]);

  const previewSections = useMemo(() => (detail ? buildPreviewSections(detail) : []), [detail]);

  if (isLoading) {
    return <LoadingPanel label="Loading compendium entry..." />;
  }

  if (error) {
    return <ErrorState body={error} title="DnData API" />;
  }

  if (!detail) {
    return <EmptyState body="This compendium record could not be loaded." title="Missing Entry" />;
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.35em] text-crt-accent">Compendium Detail</p>
        <h2 className="mt-2 text-3xl font-bold uppercase tracking-[0.12em] text-crt-text">{detail.name}</h2>
        <p className="mt-2 text-sm uppercase tracking-[0.18em] text-crt-muted">
          {detail.type} / {detail.id}
        </p>
      </div>

      <div className="grid gap-4 xl:items-stretch xl:grid-cols-[0.9fr_1.1fr]">
        <PixelPanel className="space-y-4">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-crt-muted">Quick View</p>
          <CompendiumAssignPanel detail={detail} />
          {previewSections.length ? (
            <div className="space-y-5">
              {previewSections.map((section) => {
                if (section.kind === "fields") {
                  return (
                    <div className="space-y-2" key={section.title}>
                      <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-crt-accent">{section.title}</p>
                      {section.fields.map((field, index) => (
                        <div
                          className={`flex items-start justify-between gap-4 pb-2 text-sm ${
                            index === section.fields.length - 1 ? "" : "border-b border-crt-border"
                          }`}
                          key={`${section.title}-${field.label}`}
                        >
                          <span className="font-bold uppercase tracking-[0.15em] text-crt-muted">{field.label}</span>
                          <span className="max-w-[60%] text-right text-crt-text">{field.value}</span>
                        </div>
                      ))}
                    </div>
                  );
                }

                if (section.kind === "abilities") {
                  return (
                    <div className="space-y-2" key={section.title}>
                      <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-crt-accent">{section.title}</p>
                      <div className="grid grid-cols-3 gap-2">
                        {section.abilities.map((ability) => (
                          <div
                            className="border-2 border-crt-border bg-crt-panel-2 px-3 py-2 text-center"
                            key={`${section.title}-${ability.label}`}
                          >
                            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-crt-muted">
                              {ability.label}
                            </p>
                            <p className="mt-1 text-lg font-bold text-crt-text">{ability.value}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }

                if (section.kind === "entries") {
                  return (
                    <div className="space-y-2" key={section.title}>
                      <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-crt-accent">{section.title}</p>
                      <div className="space-y-2">
                        {section.entries.map((entry) => (
                          <div className="border-2 border-crt-border bg-crt-panel-2 p-3" key={`${entry.name}-${entry.text}`}>
                            <p className="text-xs font-bold uppercase tracking-[0.15em] text-crt-text">{entry.name}</p>
                            <p className="mt-2 text-sm leading-6 text-crt-muted">{entry.text}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }

                return (
                  <div className="space-y-2" key={section.title}>
                    <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-crt-accent">{section.title}</p>
                    <div className="border-2 border-crt-border bg-crt-panel-2 p-3">
                      <p className="text-sm leading-6 text-crt-muted">{section.body}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState body="This record does not expose structured preview data." title="No Quick View" />
          )}
        </PixelPanel>
        <PixelPanel className="space-y-4 xl:flex xl:h-full xl:min-h-0 xl:flex-col xl:gap-4 xl:overflow-hidden xl:space-y-0">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-crt-muted">Raw Payload</p>
          <pre className="overflow-y-auto whitespace-pre-wrap break-words bg-crt-bg/70 p-4 text-xs text-crt-text xl:h-full xl:min-h-0 xl:flex-1">
            {JSON.stringify(detail.raw, null, 2)}
          </pre>
        </PixelPanel>
      </div>
    </div>
  );
}
