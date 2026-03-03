import type {
  CompendiumDetail,
  CompendiumLinkedRecord,
  CompendiumResult,
  CompendiumSearchResponse,
  CompendiumType
} from "@/types";
import { isRecord, readableId, toStringValue } from "@/lib/utils";

export const DEFAULT_DNDATA_BASE_URL = "http://127.0.0.1:8080";
const SEARCH_LIMIT = 12;

const DATASET_ENDPOINTS: Record<CompendiumType, string> = {
  monsters: "/api/monsters",
  species: "/api/species",
  traits: "/api/traits",
  tables: "/api/tables",
  items: "/api/items",
  backgrounds: "/api/backgrounds",
  classes: "/api/classes",
  spells: "/api/spells"
};

const LINKED_DATASET_ENDPOINTS: Record<string, string> = {
  species: "/api/species",
  class: "/api/classes",
  background: "/api/backgrounds",
  item: "/api/items",
  spell: "/api/spells",
  trait: "/api/traits",
  feature: "/api/features"
};

export function getDnDataBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_DNDATA_BASE_URL || DEFAULT_DNDATA_BASE_URL).replace(/\/+$/, "");
}

function buildUrl(path: string, params?: Record<string, string | number | boolean | undefined>): string {
  const url = new URL(`${getDnDataBaseUrl()}${path}`);

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === "") {
        return;
      }

      url.searchParams.set(key, String(value));
    });
  }

  return url.toString();
}

async function requestJson<T>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
  const response = await fetch(buildUrl(path, params), {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`DnData request failed with ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T;
}

function normalizeType(value: string | null | undefined): CompendiumType {
  const normalized = (value || "").toLowerCase();

  if (normalized in DATASET_ENDPOINTS) {
    return normalized as CompendiumType;
  }

  return "items";
}

function getLinkedDataset(refId: string): string {
  return refId.split(".")[0]?.toLowerCase() || "unknown";
}

function summarizeLinkedPayload(payload: Record<string, unknown>): string | null {
  const directSummary = toStringValue(payload.summary) ?? toStringValue(payload.description);

  if (directSummary) {
    return directSummary;
  }

  const lore = isRecord(payload.lore) ? payload.lore : null;
  const source = isRecord(payload.source) ? payload.source : null;

  return (
    toStringValue(lore?.summary) ??
    toStringValue(payload.descriptionRaw) ??
    toStringValue(source?.descriptionRaw) ??
    null
  );
}

function mapResult(item: unknown): CompendiumResult | null {
  if (!isRecord(item)) {
    return null;
  }

  const type = normalizeType(toStringValue(item.dataset) ?? toStringValue(item.type));
  const id = toStringValue(item.id);
  const name = toStringValue(item.name);

  if (!id || !name) {
    return null;
  }

  return {
    id,
    name,
    type,
    summary: toStringValue(item.summary) ?? toStringValue(item.text),
    raw: item
  };
}

export async function getTypeaheadResults(query: string): Promise<CompendiumResult[]> {
  if (!query.trim()) {
    return [];
  }

  const payload = await requestJson<{ items?: unknown[] }>("/api/search/suggest", {
    dataset: "all",
    q: query,
    limit: 8
  });

  return (payload.items ?? []).map(mapResult).filter((item): item is CompendiumResult => Boolean(item));
}

export async function searchCompendium(query: string, page: number): Promise<CompendiumSearchResponse> {
  if (!query.trim()) {
    return {
      items: [],
      total: 0,
      count: 0,
      limit: SEARCH_LIMIT,
      offset: 0
    };
  }

  const limit = SEARCH_LIMIT;
  const offset = Math.max(page - 1, 0) * limit;

  const payload = await requestJson<{
    items?: unknown[];
    total?: number;
    count?: number;
    limit?: number;
    offset?: number;
  }>("/api/search", {
    dataset: "all",
    q: query,
    limit,
    offset
  });

  return {
    items: (payload.items ?? []).map(mapResult).filter((item): item is CompendiumResult => Boolean(item)),
    total: typeof payload.total === "number" ? payload.total : 0,
    count: typeof payload.count === "number" ? payload.count : 0,
    limit: typeof payload.limit === "number" ? payload.limit : limit,
    offset: typeof payload.offset === "number" ? payload.offset : offset
  };
}

export async function getCompendiumDetail(type: CompendiumType, id: string): Promise<CompendiumDetail> {
  const path = `${DATASET_ENDPOINTS[type]}/${encodeURIComponent(id)}`;
  const payload = await requestJson<Record<string, unknown>>(path);

  return {
    id,
    type,
    name: toStringValue(payload.name) ?? id,
    raw: payload
  };
}

export async function getCompendiumLinkedRecord(refId: string, fallbackName?: string): Promise<CompendiumLinkedRecord> {
  const dataset = getLinkedDataset(refId);
  const endpoint = LINKED_DATASET_ENDPOINTS[dataset];
  const fallbackRecord = {
    id: refId,
    dataset,
    name: fallbackName ?? readableId(refId),
    summary: null,
    raw: {}
  };

  if (!endpoint) {
    return fallbackRecord;
  }

  try {
    const payload = await requestJson<Record<string, unknown>>(`${endpoint}/${encodeURIComponent(refId)}`);

    return {
      id: refId,
      dataset,
      name: toStringValue(payload.name) ?? fallbackRecord.name,
      summary: summarizeLinkedPayload(payload),
      raw: payload
    };
  } catch {
    return fallbackRecord;
  }
}

export const compendiumEndpoints = {
  health: "/api/health",
  search: "/api/search",
  suggest: "/api/search/suggest",
  datasets: DATASET_ENDPOINTS
};
