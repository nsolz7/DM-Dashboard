import type { AbilityScores } from "@/types";

export function readableId(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }

  const lastSegment = value.split(".").pop() ?? value;
  const trimmedHash = lastSegment.replace(/-[a-f0-9]{8}$/i, "");
  const normalized = trimmedHash.replace(/[_-]+/g, " ").trim();

  if (!normalized) {
    return "—";
  }

  return normalized
    .split(" ")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

export function formatNumber(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "—";
}

export function abilityModifier(score: number | null | undefined): string {
  if (typeof score !== "number") {
    return "—";
  }

  const modifier = Math.floor((score - 10) / 2);
  return modifier >= 0 ? `+${modifier}` : `${modifier}`;
}

export function emptyAbilityScores(): AbilityScores {
  return {
    str: null,
    dex: null,
    con: null,
    int: null,
    wis: null,
    cha: null
  };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function toIsoString(value: unknown): string | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (isRecord(value) && typeof value.toDate === "function") {
    const date = value.toDate() as Date;
    return date.toISOString();
  }

  return null;
}

export function toNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function toStringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}
