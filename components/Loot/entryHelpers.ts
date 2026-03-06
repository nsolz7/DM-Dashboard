import type { LootDropEntry, LootSearchItem } from "@/types";

export const LOOT_DRAG_MIME = "application/x-septagon-loot-entry";

function nextEntryId(seed: string): string {
  return `${seed}-${Math.random().toString(36).slice(2, 9)}`;
}

function safeSeed(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function createEntryFromSearchItem(item: LootSearchItem): LootDropEntry {
  return {
    entryId: nextEntryId(safeSeed(item.id)),
    kind: "item",
    ref: {
      type: "items",
      id: item.id
    },
    namePreview: item.name,
    rarity: item.rarity ?? undefined,
    quantity: 1
  };
}

export function createEntryFromCustomItem(item: { id: string; name: string; rarity?: string | null }): LootDropEntry {
  return {
    entryId: nextEntryId(`custom_${safeSeed(item.id)}`),
    kind: "custom_item",
    ref: null,
    customItemId: item.id,
    namePreview: item.name,
    rarity: item.rarity ?? undefined,
    quantity: 1
  };
}

export function encodeDraggedEntry(entry: LootDropEntry): string {
  return JSON.stringify(entry);
}

export function decodeDraggedEntry(value: string | null): LootDropEntry | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as LootDropEntry;

    if (!parsed || typeof parsed !== "object" || !parsed.entryId || !parsed.kind) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}
