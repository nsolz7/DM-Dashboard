import type {
  EquipSettingsDoc,
  EquipSlotCounts,
  EquipmentSlotKey,
  InventoryRef,
  PlayerEquipmentSlots
} from "@/types";
import { isRecord, toNumber, toStringValue } from "@/lib/utils";

export const EQUIP_SETTINGS_DOC_ID = "equip";

export const EQUIPMENT_SLOT_KEYS: EquipmentSlotKey[] = [
  "head",
  "body",
  "cloak",
  "hands",
  "feet",
  "bracers",
  "neck",
  "mainHand",
  "offHand"
];

export const EQUIPMENT_SLOT_LABELS: Record<EquipmentSlotKey | "ring", string> = {
  head: "Head",
  body: "Body",
  cloak: "Cloak",
  hands: "Hands",
  feet: "Feet",
  bracers: "Bracers",
  neck: "Neck",
  mainHand: "Main Hand",
  offHand: "Off Hand",
  ring: "Ring"
};

const MIN_SLOT_COUNT = 0;
const MAX_SLOT_COUNT = 8;
const MAX_RING_COUNT = 8;
const MAX_ATTUNEMENT_LIMIT = 10;

export const DEFAULT_EQUIP_SLOT_COUNTS: EquipSlotCounts = {
  head: 1,
  body: 1,
  cloak: 1,
  hands: 1,
  feet: 1,
  bracers: 1,
  neck: 1,
  rings: 2,
  mainHand: 1,
  offHand: 1
};

export const DEFAULT_EQUIP_SETTINGS: EquipSettingsDoc = {
  schemaVersion: 1,
  slots: DEFAULT_EQUIP_SLOT_COUNTS,
  enforceAttunementLimit: true,
  attunementLimit: 3,
  enforceWeight: false,
  maxCarryWeightOverride: null,
  notes: ""
};

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = toNumber(value);

  if (numeric === null) {
    return fallback;
  }

  const integer = Math.floor(numeric);
  return Math.min(max, Math.max(min, integer));
}

function sanitizeSlotCounts(value: unknown): EquipSlotCounts {
  if (!isRecord(value)) {
    return { ...DEFAULT_EQUIP_SLOT_COUNTS };
  }

  return {
    head: clampInteger(value.head, DEFAULT_EQUIP_SLOT_COUNTS.head, MIN_SLOT_COUNT, MAX_SLOT_COUNT),
    body: clampInteger(value.body, DEFAULT_EQUIP_SLOT_COUNTS.body, MIN_SLOT_COUNT, MAX_SLOT_COUNT),
    cloak: clampInteger(value.cloak, DEFAULT_EQUIP_SLOT_COUNTS.cloak, MIN_SLOT_COUNT, MAX_SLOT_COUNT),
    hands: clampInteger(value.hands, DEFAULT_EQUIP_SLOT_COUNTS.hands, MIN_SLOT_COUNT, MAX_SLOT_COUNT),
    feet: clampInteger(value.feet, DEFAULT_EQUIP_SLOT_COUNTS.feet, MIN_SLOT_COUNT, MAX_SLOT_COUNT),
    bracers: clampInteger(value.bracers, DEFAULT_EQUIP_SLOT_COUNTS.bracers, MIN_SLOT_COUNT, MAX_SLOT_COUNT),
    neck: clampInteger(value.neck, DEFAULT_EQUIP_SLOT_COUNTS.neck, MIN_SLOT_COUNT, MAX_SLOT_COUNT),
    rings: clampInteger(value.rings, DEFAULT_EQUIP_SLOT_COUNTS.rings, MIN_SLOT_COUNT, MAX_RING_COUNT),
    mainHand: clampInteger(value.mainHand, DEFAULT_EQUIP_SLOT_COUNTS.mainHand, MIN_SLOT_COUNT, MAX_SLOT_COUNT),
    offHand: clampInteger(value.offHand, DEFAULT_EQUIP_SLOT_COUNTS.offHand, MIN_SLOT_COUNT, MAX_SLOT_COUNT)
  };
}

function sanitizeInventoryRef(value: unknown): InventoryRef | null {
  if (!isRecord(value)) {
    return null;
  }

  const inventoryItemId = toStringValue(value.inventoryItemId);
  if (!inventoryItemId) {
    return null;
  }

  const compendium = isRecord(value.compendium)
    ? {
        type: toStringValue(value.compendium.type) ?? "items",
        id: toStringValue(value.compendium.id) ?? ""
      }
    : undefined;

  return {
    inventoryItemId,
    source: "inventory",
    ...(compendium?.id
      ? {
          compendium
        }
      : {}),
    customItemId: toStringValue(value.customItemId) ?? undefined
  };
}

function sanitizeRingSlots(value: unknown, ringCount: number): Array<InventoryRef | null> {
  const normalized = Array.isArray(value) ? value.map((entry) => sanitizeInventoryRef(entry)) : [];
  const target = Math.max(0, ringCount);

  while (normalized.length < target) {
    normalized.push(null);
  }

  return normalized.slice(0, target);
}

export function createEmptyEquipmentSlots(ringCount = DEFAULT_EQUIP_SLOT_COUNTS.rings): PlayerEquipmentSlots {
  return {
    head: null,
    body: null,
    cloak: null,
    hands: null,
    feet: null,
    bracers: null,
    neck: null,
    rings: Array.from({ length: Math.max(0, ringCount) }, () => null),
    mainHand: null,
    offHand: null
  };
}

export function sanitizeEquipSettings(value: unknown): EquipSettingsDoc {
  if (!isRecord(value)) {
    return {
      ...DEFAULT_EQUIP_SETTINGS,
      slots: { ...DEFAULT_EQUIP_SLOT_COUNTS }
    };
  }

  return {
    schemaVersion: 1,
    slots: sanitizeSlotCounts(value.slots),
    enforceAttunementLimit: value.enforceAttunementLimit !== false,
    attunementLimit: clampInteger(value.attunementLimit, DEFAULT_EQUIP_SETTINGS.attunementLimit, 0, MAX_ATTUNEMENT_LIMIT),
    enforceWeight: value.enforceWeight === true,
    maxCarryWeightOverride:
      value.maxCarryWeightOverride === null
        ? null
        : clampInteger(value.maxCarryWeightOverride, 0, 0, 100000),
    notes: toStringValue(value.notes) ?? ""
  };
}

export function normalizePlayerEquipment(
  value: unknown,
  settings: EquipSettingsDoc | null | undefined
): PlayerEquipmentSlots {
  const ringCount = settings?.slots.rings ?? DEFAULT_EQUIP_SLOT_COUNTS.rings;
  const source = isRecord(value) ? value : {};

  return {
    head: sanitizeInventoryRef(source.head),
    body: sanitizeInventoryRef(source.body),
    cloak: sanitizeInventoryRef(source.cloak),
    hands: sanitizeInventoryRef(source.hands),
    feet: sanitizeInventoryRef(source.feet),
    bracers: sanitizeInventoryRef(source.bracers),
    neck: sanitizeInventoryRef(source.neck),
    rings: sanitizeRingSlots(source.rings, ringCount),
    mainHand: sanitizeInventoryRef(source.mainHand),
    offHand: sanitizeInventoryRef(source.offHand)
  };
}

interface InventoryStackRaw extends Record<string, unknown> {
  inventoryItemId?: unknown;
  itemId?: unknown;
  qty?: unknown;
  equipped?: unknown;
  attuned?: unknown;
  sourceType?: unknown;
  sourceId?: unknown;
  grantedAtLevel?: unknown;
  containerTag?: unknown;
}

export interface NormalizedInventoryStack {
  inventoryItemId: string;
  itemId: string | null;
  qty: number;
  equipped: boolean;
  attuned: boolean;
  sourceType: string | null;
  sourceId: string | null;
  grantedAtLevel: number | null;
  containerTag: string | null;
  raw: InventoryStackRaw;
}

export interface NormalizeInventoryStacksResult {
  stacks: NormalizedInventoryStack[];
  didAssignInventoryIds: boolean;
}

function createInventoryItemId(index: number): string {
  const globalCrypto = globalThis.crypto as { randomUUID?: () => string } | undefined;
  const uuid = typeof globalCrypto?.randomUUID === "function" ? globalCrypto.randomUUID() : null;

  if (uuid) {
    return `inv_${uuid}`;
  }

  return `inv_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeInventoryStacks(value: unknown): NormalizeInventoryStacksResult {
  if (!Array.isArray(value)) {
    return {
      stacks: [],
      didAssignInventoryIds: false
    };
  }

  let didAssignInventoryIds = false;
  const stacks = value
    .filter((entry): entry is InventoryStackRaw => isRecord(entry))
    .map((entry, index) => {
      const inventoryItemId = toStringValue(entry.inventoryItemId) ?? createInventoryItemId(index);

      if (!toStringValue(entry.inventoryItemId)) {
        didAssignInventoryIds = true;
      }

      const qty = clampInteger(entry.qty, 1, 1, 999);
      const normalized: NormalizedInventoryStack = {
        inventoryItemId,
        itemId: toStringValue(entry.itemId),
        qty,
        equipped: entry.equipped === true,
        attuned: entry.attuned === true,
        sourceType: toStringValue(entry.sourceType),
        sourceId: toStringValue(entry.sourceId),
        grantedAtLevel: toNumber(entry.grantedAtLevel),
        containerTag: toStringValue(entry.containerTag),
        raw: {
          ...entry,
          inventoryItemId,
          qty,
          equipped: entry.equipped === true,
          attuned: entry.attuned === true
        }
      };

      return normalized;
    });

  return {
    stacks,
    didAssignInventoryIds
  };
}

export function toFirestoreInventoryStacks(stacks: NormalizedInventoryStack[]): Array<Record<string, unknown>> {
  return stacks.map((stack) => ({
    ...stack.raw,
    inventoryItemId: stack.inventoryItemId,
    itemId: stack.itemId,
    qty: stack.qty,
    equipped: stack.equipped,
    attuned: stack.attuned,
    sourceType: stack.sourceType,
    sourceId: stack.sourceId,
    grantedAtLevel: stack.grantedAtLevel,
    containerTag: stack.containerTag
  }));
}

export function toFirestoreEquipmentSlots(equipment: PlayerEquipmentSlots): Record<string, unknown> {
  return {
    head: equipment.head,
    body: equipment.body,
    cloak: equipment.cloak,
    hands: equipment.hands,
    feet: equipment.feet,
    bracers: equipment.bracers,
    neck: equipment.neck,
    rings: equipment.rings,
    mainHand: equipment.mainHand,
    offHand: equipment.offHand
  };
}
