import type { CurrencyAmount } from "@/types/barter";
import type { PlayerEquipmentSlots } from "@/types/equipment";

export interface AbilityScores {
  str: number | null;
  dex: number | null;
  con: number | null;
  int: number | null;
  wis: number | null;
  cha: number | null;
}

export interface PlayerAdvancementState {
  mode: string | null;
  xpEnabled: boolean | null;
  xp: number | null;
}

export interface PlayerInventoryStack {
  inventoryItemId: string | null;
  itemId: string | null;
  qty: number | null;
  equipped: boolean;
  attuned: boolean;
  sourceType: string | null;
  sourceId: string | null;
  grantedAtLevel: number | null;
  containerTag: string | null;
}

export interface PlayerInventoryState {
  stacks: PlayerInventoryStack[];
  sheetItemIds: string[];
}

export interface PlayerGrantEntry {
  refId: string | null;
  name: string | null;
  sourceType: string | null;
  sourceId: string | null;
  grantedAtLevel: number | null;
  choiceGroupId: string | null;
  isCantrip?: boolean;
  prepared?: boolean;
}

export interface PlayerGrantsState {
  traits: PlayerGrantEntry[];
  features: PlayerGrantEntry[];
  spells: PlayerGrantEntry[];
  items: PlayerGrantEntry[];
}

export interface PlayerVitals {
  hpCurrent: number | null;
  hpMax: number | null;
  tempHp: number | null;
  ac: number | null;
  speed: number | null;
}

export interface PlayerEquipmentState extends PlayerEquipmentSlots {
  equippedWeaponIds: string[];
  equippedArmorIds: string[];
}

export interface PlayerSpellbookState {
  knownSpellIds: string[];
  preparedSpellIds: string[];
  cantripIds: string[];
}

export interface PlayerFeaturesState {
  featureIds: string[];
}

export interface PlayerProficienciesState {
  savingThrows: string[];
  skills: Record<string, string>;
}

export interface SpellSlotState {
  total: number;
  used: number;
}

export interface PlayerResourceState {
  inspiration?: boolean;
  concentration?: string | null;
  spellSlots?: Record<string, SpellSlotState>;
  hitDice?: {
    dieType?: string | null;
    total?: number | null;
    used?: number | null;
  } | null;
  deathSaves?: {
    successes: number;
    failures: number;
  } | null;
  currency?: CurrencyAmount | null;
}

export interface PlayerBuildMetaState {
  resolvedBy: Record<string, string>;
}

export interface AssignablePlayerOption {
  id: string;
  name: string | null;
  partyOrder: number | null;
  active: boolean;
}

export interface Player {
  id: string;
  playerId: string;
  partyOrder: number | null;
  active: boolean;
  name: string | null;
  raceId: string | null;
  raceName: string | null;
  classId: string | null;
  className: string | null;
  backgroundId: string | null;
  backgroundName: string | null;
  level: number | null;
  classLevels: Record<string, number | null>;
  advancement: PlayerAdvancementState | null;
  vitals: PlayerVitals;
  abilityScores: AbilityScores;
  inventory: PlayerInventoryState;
  grants: PlayerGrantsState;
  equipment: PlayerEquipmentState;
  spellbook: PlayerSpellbookState;
  features: PlayerFeaturesState;
  proficiencies: PlayerProficienciesState | null;
  portraitStoragePath: string | null;
  portraitUrl: string | null;
  notes: string | null;
  conditions: string[];
  resources: PlayerResourceState | null;
  buildChoices: unknown[];
  pendingChoicePrompts: unknown[];
  buildMeta: PlayerBuildMetaState | null;
  schemaVersion: number | null;
  updatedAt: string | null;
  hpCurrent: number | null;
  hpMax: number | null;
  ac: number | null;
  speed: number | null;
  tempHp: number | null;
}
