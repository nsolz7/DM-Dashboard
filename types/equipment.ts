export type EquipmentHandedness = "one-handed" | "two-handed" | "versatile" | "unknown";

export type EquipmentSlotKey =
  | "head"
  | "body"
  | "cloak"
  | "hands"
  | "feet"
  | "bracers"
  | "neck"
  | "mainHand"
  | "offHand";

export type EquipmentSlotHint = EquipmentSlotKey | "ring";

export interface InventoryRef {
  inventoryItemId: string;
  source: "inventory";
  compendium?: {
    type: string;
    id: string;
  };
  customItemId?: string;
}

export interface PlayerEquipmentSlots {
  head: InventoryRef | null;
  body: InventoryRef | null;
  cloak: InventoryRef | null;
  hands: InventoryRef | null;
  feet: InventoryRef | null;
  bracers: InventoryRef | null;
  neck: InventoryRef | null;
  rings: Array<InventoryRef | null>;
  mainHand: InventoryRef | null;
  offHand: InventoryRef | null;
}

export interface EquipSlotCounts {
  head: number;
  body: number;
  cloak: number;
  hands: number;
  feet: number;
  bracers: number;
  neck: number;
  rings: number;
  mainHand: number;
  offHand: number;
}

export interface EquipSettingsDoc {
  schemaVersion: 1;
  slots: EquipSlotCounts;
  enforceAttunementLimit: boolean;
  attunementLimit: number;
  enforceWeight: boolean;
  maxCarryWeightOverride: number | null;
  notes?: string;
}

export interface EquipmentChangeRecord {
  action: "equip" | "unequip" | "swap";
  slot: EquipmentSlotHint;
  ringIndex?: number | null;
  inventoryItemId?: string | null;
}

export type EquipmentInventoryCategory = "weapons" | "armor" | "wearables" | "consumables" | "misc";

export interface EquipmentItemClassification {
  category: EquipmentInventoryCategory;
  equippable: boolean;
  equipSlotHint: EquipmentSlotHint | null;
  weaponHandedness: EquipmentHandedness;
  isShield: boolean;
  rarity: string | null;
  typeLabel: string | null;
}

export interface EquipmentOperationResponse {
  playerId: string;
  campaignId: string;
  equipment: PlayerEquipmentSlots;
  changes: EquipmentChangeRecord[];
}
