export type CompendiumType =
  | "monsters"
  | "species"
  | "traits"
  | "tables"
  | "items"
  | "backgrounds"
  | "classes"
  | "spells";

export interface CompendiumResult {
  id: string;
  name: string;
  type: CompendiumType;
  summary?: string | null;
  raw: Record<string, unknown>;
}

export interface CompendiumDetail {
  id: string;
  name: string;
  type: CompendiumType;
  raw: Record<string, unknown>;
}

export interface CompendiumLinkedRecord {
  id: string;
  dataset: string;
  name: string;
  summary: string | null;
  raw: Record<string, unknown>;
}

export interface CompendiumSearchResponse {
  items: CompendiumResult[];
  total: number;
  count: number;
  limit: number;
  offset: number;
}
