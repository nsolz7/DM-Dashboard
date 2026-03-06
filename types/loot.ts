import type { CurrencyAmount } from "@/types/barter";

export type LootDeliveryMode = "party_claim" | "assigned";
export type LootDropStatus = "sent" | "opened" | "partially_claimed" | "fully_claimed" | "closed";
export type LootEntryKind = "item" | "custom_item";
export type LootBuilderMode = "manual" | "random";
export type LootSortKey = "name" | "type" | "rarity";

export interface LootEntryRef {
  type: string;
  id: string;
}

export interface LootDropEntry {
  entryId: string;
  kind: LootEntryKind;
  ref: LootEntryRef | null;
  customItemId?: string;
  namePreview?: string;
  rarity?: string;
  quantity: number;
}

export interface LootEntryClaim {
  entryId: string;
  playerId: string;
  qty: number;
  claimedAt: string | null;
}

export interface LootCoinClaim {
  playerId: string;
  amount: CurrencyAmount;
  claimedAt: string | null;
}

export interface LootClaimState {
  entryRemaining: Record<string, number>;
  entryClaims: LootEntryClaim[];
  coinClaims: LootCoinClaim[];
}

export interface LootDropSource {
  scenarioId?: string;
  location?: string;
}

export interface LootDropDoc {
  id: string;
  campaignId: string;
  schemaVersion: 1;
  createdAt: string | null;
  createdByUid: string;
  reason: string;
  source?: LootDropSource;
  delivery: {
    mode: LootDeliveryMode;
    recipientKeys: string[];
    playerIds?: string[];
  };
  visibility: {
    revealOnOpen: boolean;
  };
  state: {
    status: LootDropStatus;
  };
  coins?: CurrencyAmount;
  entries: LootDropEntry[];
  claimState: LootClaimState;
}

export interface CustomItemDoc {
  id: string;
  campaignId: string;
  name: string;
  type: string;
  rarity: string | null;
  description: string;
  value?: unknown;
  createdAt: string | null;
  createdByUid: string;
}

export interface LootDraft {
  reason: string;
  source?: LootDropSource;
  mode: LootBuilderMode;
  deliveryMode: LootDeliveryMode;
  targetPlayerId: string | null;
  includeDm: boolean;
  coins: CurrencyAmount;
  entries: LootDropEntry[];
}

export interface SendLootRequest {
  campaignId: string;
  reason: string;
  source?: LootDropSource;
  delivery: {
    mode: LootDeliveryMode;
    playerIds?: string[];
    includeDm?: boolean;
  };
  coins?: CurrencyAmount | null;
  entries: LootDropEntry[];
}

export interface SendLootResponse {
  lootId: string;
  txId: string;
}

export interface LootRandomWeights {
  consumable: number;
  wondrous: number;
  weapon: number;
  armor: number;
}

export interface LootRandomOptions {
  count: number;
  allowedRarities: string[];
  allowedItemTypes: string[];
  duplicatesAllowed: boolean;
  weights?: Partial<LootRandomWeights>;
}

export interface LootSearchItem {
  id: string;
  name: string;
  type: string;
  rarity: string | null;
  raw: Record<string, unknown>;
}

export interface CreateCustomItemRequest {
  campaignId: string;
  name: string;
  type: string;
  rarity?: string | null;
  description: string;
  value?: unknown;
}
