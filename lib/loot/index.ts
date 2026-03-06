import type {
  CompendiumResult,
  CurrencyAmount,
  LootDraft,
  LootDropDoc,
  LootDropEntry,
  LootRandomOptions,
  LootRandomWeights,
  LootSearchItem,
  SendLootRequest,
  SendLootResponse
} from "@/types";
import { getDnDataBaseUrl, getTypeaheadResults } from "@/lib/compendium/api";
import { emptyCurrencyAmount, sanitizeCurrencyAmount } from "@/lib/currency";
import { isRecord, toStringValue } from "@/lib/utils";

interface LootApiResponse {
  lootId?: string;
  txId?: string;
  drops?: LootDropDoc[];
  drop?: LootDropDoc;
  error?: string;
}

const defaultWeights: LootRandomWeights = {
  consumable: 1,
  wondrous: 1,
  weapon: 1,
  armor: 1
};

const randomFallbackQueries = ["scroll", "potion", "sword", "amulet", "ring", "wand"];

function normalizeToken(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function normalizeList(values: string[]): string[] {
  return Array.from(new Set(values.map(normalizeToken).filter(Boolean)));
}

function requestPath(path: string, params?: Record<string, string | number | undefined>) {
  const searchParams = new URLSearchParams();

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined) {
        return;
      }

      searchParams.set(key, String(value));
    });
  }

  const search = searchParams.toString();
  return search ? `${path}?${search}` : path;
}

function nextEntryId(seed: string): string {
  return `${seed}-${Math.random().toString(36).slice(2, 9)}`;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function extractFromPropertyMap(raw: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const direct = toStringValue(raw[key]);

    if (direct) {
      return direct;
    }
  }

  const source = toRecord(raw.source);
  const taxonomy = toRecord(raw.taxonomy);
  const properties = toRecord(raw.properties);

  for (const container of [taxonomy, source, properties]) {
    if (!container) {
      continue;
    }

    for (const key of keys) {
      const value = toStringValue(container[key]);

      if (value) {
        return value;
      }
    }
  }

  return null;
}

export function extractLootRarity(raw: Record<string, unknown>): string | null {
  const rawRarity = extractFromPropertyMap(raw, ["rarity", "Rarity"]);

  if (!rawRarity) {
    return null;
  }

  return rawRarity;
}

export function extractLootItemType(raw: Record<string, unknown>): string {
  return (
    extractFromPropertyMap(raw, ["type", "Type", "category", "Category", "itemType"]) ??
    "item"
  );
}

function mapCompendiumItem(result: CompendiumResult): LootSearchItem | null {
  if (result.type !== "items") {
    return null;
  }

  const raw = toRecord(result.raw) ?? {};

  return {
    id: result.id,
    name: result.name,
    type: extractLootItemType(raw),
    rarity: extractLootRarity(raw),
    raw
  };
}

function mapDatasetItem(rawItem: unknown): LootSearchItem | null {
  const raw = toRecord(rawItem);

  if (!raw) {
    return null;
  }

  const id = toStringValue(raw.id);
  const name = toStringValue(raw.name);

  if (!id || !name) {
    return null;
  }

  return {
    id,
    name,
    type: extractLootItemType(raw),
    rarity: extractLootRarity(raw),
    raw
  };
}

async function fetchItemsDatasetPage(limit: number, offset: number): Promise<LootSearchItem[]> {
  const url = new URL(`${getDnDataBaseUrl()}/api/items`);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", String(offset));
  const response = await fetch(url.toString(), {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`DnData items request failed with ${response.status}.`);
  }

  const payload = (await response.json()) as unknown;
  const records = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.items)
      ? payload.items
      : isRecord(payload) && Array.isArray(payload.results)
        ? payload.results
        : [];

  return records.map(mapDatasetItem).filter((item): item is LootSearchItem => Boolean(item));
}

async function buildRandomPool(): Promise<LootSearchItem[]> {
  const dedupe = new Map<string, LootSearchItem>();
  const limit = 160;
  const maxPages = 6;

  try {
    for (let page = 0; page < maxPages; page += 1) {
      const offset = page * limit;
      const rows = await fetchItemsDatasetPage(limit, offset);

      rows.forEach((item) => {
        dedupe.set(item.id, item);
      });

      if (rows.length < limit) {
        break;
      }
    }
  } catch {
    // If dataset listing is unavailable, fallback to suggest endpoint seeds.
  }

  if (dedupe.size >= 24) {
    return Array.from(dedupe.values());
  }

  for (const query of randomFallbackQueries) {
    const results = await getTypeaheadResults(query);

    results
      .map(mapCompendiumItem)
      .filter((item): item is LootSearchItem => Boolean(item))
      .forEach((item) => {
        dedupe.set(item.id, item);
      });
  }

  return Array.from(dedupe.values());
}

function resolveWeightBucket(itemType: string): keyof LootRandomWeights | "other" {
  const normalized = normalizeToken(itemType);

  if (normalized.includes("consumable") || normalized.includes("potion") || normalized.includes("scroll")) {
    return "consumable";
  }

  if (normalized.includes("wondrous")) {
    return "wondrous";
  }

  if (normalized.includes("weapon")) {
    return "weapon";
  }

  if (normalized.includes("armor") || normalized.includes("shield")) {
    return "armor";
  }

  return "other";
}

function randomIndexByWeight(pool: LootSearchItem[], weights: LootRandomWeights): number {
  const weighted = pool.map((item) => {
    const bucket = resolveWeightBucket(item.type);

    if (bucket === "other") {
      return 1;
    }

    return Math.max(0, Number.isFinite(weights[bucket]) ? weights[bucket] : 1);
  });

  const total = weighted.reduce((sum, value) => sum + value, 0);

  if (total <= 0) {
    return Math.floor(Math.random() * pool.length);
  }

  let cursor = Math.random() * total;

  for (let index = 0; index < weighted.length; index += 1) {
    cursor -= weighted[index];

    if (cursor <= 0) {
      return index;
    }
  }

  return weighted.length - 1;
}

function toLootEntry(item: LootSearchItem, index: number): LootDropEntry {
  return {
    entryId: nextEntryId(`${item.id.replace(/[^a-zA-Z0-9._-]/g, "_")}-${index}`),
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

function applyPoolFilters(pool: LootSearchItem[], options: LootRandomOptions): LootSearchItem[] {
  const rarityFilter = new Set(normalizeList(options.allowedRarities));
  const typeFilter = new Set(normalizeList(options.allowedItemTypes));

  return pool.filter((item) => {
    const rarityToken = normalizeToken(item.rarity);
    const typeToken = normalizeToken(item.type);
    const rarityMatch =
      !rarityFilter.size ||
      Array.from(rarityFilter).some((allowedRarity) => rarityToken.includes(allowedRarity));
    const typeMatch =
      !typeFilter.size ||
      Array.from(typeFilter).some((allowedType) => typeToken.includes(allowedType));
    return rarityMatch && typeMatch;
  });
}

export function createDraft(): LootDraft {
  return {
    reason: "",
    mode: "manual",
    deliveryMode: "party_claim",
    targetPlayerId: null,
    includeDm: true,
    coins: emptyCurrencyAmount(),
    entries: []
  };
}

export async function searchCompendiumItems(query: string): Promise<LootSearchItem[]> {
  if (!query.trim()) {
    return [];
  }

  const typeahead = await getTypeaheadResults(query);

  return typeahead
    .map(mapCompendiumItem)
    .filter((item): item is LootSearchItem => Boolean(item));
}

export async function generate(options: LootRandomOptions): Promise<LootDropEntry[]> {
  const count = Math.max(0, Math.min(50, Math.floor(options.count)));

  if (!count) {
    return [];
  }

  const pool = applyPoolFilters(await buildRandomPool(), options);

  if (!pool.length) {
    throw new Error("No candidate items matched the selected random constraints.");
  }

  const weights: LootRandomWeights = {
    ...defaultWeights,
    ...options.weights
  };

  const workingPool = [...pool];
  const selected: LootSearchItem[] = [];

  while (selected.length < count && workingPool.length > 0) {
    const index = randomIndexByWeight(workingPool, weights);
    const nextItem = workingPool[index];

    selected.push(nextItem);

    if (!options.duplicatesAllowed) {
      workingPool.splice(index, 1);
    }
  }

  return selected.map((item, index) => toLootEntry(item, index));
}

export async function send(payload: SendLootRequest): Promise<SendLootResponse> {
  const response = await fetch("/api/loot/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const body = (await response.json()) as LootApiResponse;

  if (!response.ok || !body.lootId || !body.txId) {
    throw new Error(body.error || "Unable to send loot drop.");
  }

  return {
    lootId: body.lootId,
    txId: body.txId
  };
}

export async function listRecent(campaignId: string, limit = 20): Promise<LootDropDoc[]> {
  const response = await fetch(
    requestPath("/api/loot/list", {
      campaignId,
      limit
    }),
    {
      cache: "no-store"
    }
  );
  const body = (await response.json()) as LootApiResponse;

  if (!response.ok) {
    throw new Error(body.error || "Unable to load recent loot drops.");
  }

  return body.drops ?? [];
}

export async function readDrop(campaignId: string, lootId: string): Promise<LootDropDoc> {
  const response = await fetch(
    requestPath(`/api/loot/${encodeURIComponent(lootId)}`, {
      campaignId
    }),
    {
      cache: "no-store"
    }
  );
  const body = (await response.json()) as LootApiResponse;

  if (!response.ok || !body.drop) {
    throw new Error(body.error || "Unable to load this loot drop.");
  }

  return body.drop;
}

export function parseLootCoins(value: Partial<CurrencyAmount> | null | undefined): CurrencyAmount {
  return sanitizeCurrencyAmount(value ?? emptyCurrencyAmount());
}
