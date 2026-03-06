import { type Firestore, FieldValue } from "firebase-admin/firestore";

import { classifyInventoryItem } from "@/lib/equipment/inference";
import {
  DEFAULT_EQUIP_SETTINGS,
  EQUIP_SETTINGS_DOC_ID,
  normalizeInventoryStacks,
  normalizePlayerEquipment,
  sanitizeEquipSettings,
  toFirestoreEquipmentSlots,
  toFirestoreInventoryStacks,
  type NormalizedInventoryStack
} from "@/lib/equipment/schema";
import { isRecord, toStringValue } from "@/lib/utils";
import type {
  EquipSettingsDoc,
  EquipmentChangeRecord,
  EquipmentHandedness,
  EquipmentOperationResponse,
  EquipmentSlotHint,
  EquipmentSlotKey,
  InventoryRef,
  PlayerEquipmentSlots
} from "@/types";

const INVENTORY_COMPENDIUM_PREFIX_MAP: Record<string, string> = {
  item: "items",
  spell: "spells",
  trait: "traits",
  feature: "traits"
};

export class EquipmentValidationError extends Error {
  status = 400;
  code = "invalid_equipment_request";

  constructor(message: string, code?: string) {
    super(message);
    this.code = code ?? this.code;
  }
}

export class EquipmentConflictError extends Error {
  status = 409;
  code = "equipment_conflict";
  details: Record<string, unknown> | undefined;

  constructor(message: string, code?: string, details?: Record<string, unknown>) {
    super(message);
    this.code = code ?? this.code;
    this.details = details;
  }
}

interface CampaignPlayerState {
  playerName: string | null;
  equipment: PlayerEquipmentSlots;
  stacks: NormalizedInventoryStack[];
}

interface EquipResolvedMeta {
  slotHint: EquipmentSlotHint | null;
  weaponHandedness: EquipmentHandedness;
  isShield: boolean;
}

interface EquipMutationInput {
  campaignId: string;
  playerId: string;
  inventoryItemId?: string;
  inventoryIndex?: number | null;
  slotHint?: EquipmentSlotHint | null;
  ringIndex?: number | null;
  forceReplace?: boolean;
  autoUnequipConflicts?: boolean;
  weaponHandedness?: EquipmentHandedness | null;
  isShield?: boolean | null;
}

interface UnequipMutationInput {
  campaignId: string;
  playerId: string;
  slot: EquipmentSlotKey | "ring";
  ringIndex?: number | null;
}

export interface EquipMutationResult extends EquipmentOperationResponse {
  playerName: string | null;
  itemName: string;
}

export interface UnequipMutationResult extends EquipmentOperationResponse {
  playerName: string | null;
  unequippedItemName: string | null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function cloneEquipment(equipment: PlayerEquipmentSlots): PlayerEquipmentSlots {
  return {
    head: equipment.head ? { ...equipment.head } : null,
    body: equipment.body ? { ...equipment.body } : null,
    cloak: equipment.cloak ? { ...equipment.cloak } : null,
    hands: equipment.hands ? { ...equipment.hands } : null,
    feet: equipment.feet ? { ...equipment.feet } : null,
    bracers: equipment.bracers ? { ...equipment.bracers } : null,
    neck: equipment.neck ? { ...equipment.neck } : null,
    rings: equipment.rings.map((entry) => (entry ? { ...entry } : null)),
    mainHand: equipment.mainHand ? { ...equipment.mainHand } : null,
    offHand: equipment.offHand ? { ...equipment.offHand } : null
  };
}

function trimCampaignId(value: string): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new EquipmentValidationError("campaignId is required.");
  }

  return normalized;
}

function trimPlayerId(value: string): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new EquipmentValidationError("playerId is required.");
  }

  return normalized;
}

function parseRingIndex(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return null;
  }

  return value;
}

function buildInventoryRef(stack: NormalizedInventoryStack): InventoryRef {
  const customItemId = stack.sourceType?.includes("custom") ? stack.sourceId : null;
  const prefix = stack.itemId?.split(".")[0]?.toLowerCase() ?? "";
  const compendiumType = INVENTORY_COMPENDIUM_PREFIX_MAP[prefix];

  return {
    inventoryItemId: stack.inventoryItemId,
    source: "inventory",
    ...(stack.itemId && compendiumType
      ? {
          compendium: {
            type: compendiumType,
            id: stack.itemId
          }
        }
      : {}),
    ...(customItemId
      ? {
          customItemId
        }
      : {})
  };
}

function stackLabel(stack: NormalizedInventoryStack): string {
  return stack.itemId ?? stack.inventoryItemId;
}

function getSlotRef(equipment: PlayerEquipmentSlots, slot: EquipmentSlotKey): InventoryRef | null {
  return equipment[slot];
}

function setSlotRef(equipment: PlayerEquipmentSlots, slot: EquipmentSlotKey, value: InventoryRef | null) {
  equipment[slot] = value;
}

function getRingRef(equipment: PlayerEquipmentSlots, ringIndex: number): InventoryRef | null {
  return equipment.rings[ringIndex] ?? null;
}

function setRingRef(equipment: PlayerEquipmentSlots, ringIndex: number, value: InventoryRef | null) {
  equipment.rings[ringIndex] = value;
}

function clearInventoryRefFromEquipment(equipment: PlayerEquipmentSlots, inventoryItemId: string): EquipmentChangeRecord[] {
  const changes: EquipmentChangeRecord[] = [];

  for (const slot of ["head", "body", "cloak", "hands", "feet", "bracers", "neck", "mainHand", "offHand"] as EquipmentSlotKey[]) {
    const current = getSlotRef(equipment, slot);

    if (current?.inventoryItemId === inventoryItemId) {
      setSlotRef(equipment, slot, null);
      changes.push({
        action: "unequip",
        slot,
        inventoryItemId
      });
    }
  }

  equipment.rings.forEach((entry, index) => {
    if (entry?.inventoryItemId === inventoryItemId) {
      setRingRef(equipment, index, null);
      changes.push({
        action: "unequip",
        slot: "ring",
        ringIndex: index,
        inventoryItemId
      });
    }
  });

  return changes;
}

function findFirstOpenRingSlot(equipment: PlayerEquipmentSlots): number | null {
  for (let index = 0; index < equipment.rings.length; index += 1) {
    if (!equipment.rings[index]) {
      return index;
    }
  }

  return null;
}

function getEquippedInventoryIds(equipment: PlayerEquipmentSlots): Set<string> {
  const ids = new Set<string>();

  for (const slot of ["head", "body", "cloak", "hands", "feet", "bracers", "neck", "mainHand", "offHand"] as EquipmentSlotKey[]) {
    const ref = getSlotRef(equipment, slot);

    if (ref?.inventoryItemId) {
      ids.add(ref.inventoryItemId);
    }
  }

  equipment.rings.forEach((entry) => {
    if (entry?.inventoryItemId) {
      ids.add(entry.inventoryItemId);
    }
  });

  return ids;
}

function syncStackEquippedFlags(stacks: NormalizedInventoryStack[], equipment: PlayerEquipmentSlots) {
  const equippedIds = getEquippedInventoryIds(equipment);

  stacks.forEach((stack) => {
    const nextEquipped = equippedIds.has(stack.inventoryItemId);
    stack.equipped = nextEquipped;
    stack.raw.equipped = nextEquipped;
  });
}

function readSettingsData(raw: unknown): EquipSettingsDoc {
  return sanitizeEquipSettings(raw);
}

export async function getOrSeedCampaignEquipSettings(db: Firestore, campaignIdInput: string): Promise<EquipSettingsDoc> {
  const campaignId = trimCampaignId(campaignIdInput);
  const settingsRef = db.collection("campaigns").doc(campaignId).collection("settings").doc(EQUIP_SETTINGS_DOC_ID);

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(settingsRef);

    if (!snapshot.exists) {
      const seeded = {
        ...DEFAULT_EQUIP_SETTINGS,
        slots: { ...DEFAULT_EQUIP_SETTINGS.slots },
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      };
      transaction.set(settingsRef, seeded, { merge: true });
      return {
        ...DEFAULT_EQUIP_SETTINGS,
        slots: { ...DEFAULT_EQUIP_SETTINGS.slots }
      };
    }

    const settings = readSettingsData(snapshot.data());
    transaction.set(
      settingsRef,
      {
        ...settings,
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    return settings;
  });
}

export async function saveCampaignEquipSettings(
  db: Firestore,
  campaignIdInput: string,
  nextSettingsInput: unknown
): Promise<EquipSettingsDoc> {
  const campaignId = trimCampaignId(campaignIdInput);
  const nextSettings = sanitizeEquipSettings(nextSettingsInput);
  const settingsRef = db.collection("campaigns").doc(campaignId).collection("settings").doc(EQUIP_SETTINGS_DOC_ID);

  await settingsRef.set(
    {
      ...nextSettings,
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  return nextSettings;
}

async function loadCampaignPlayerState(
  db: Firestore,
  campaignId: string,
  playerId: string,
  settings: EquipSettingsDoc
): Promise<CampaignPlayerState> {
  const playerRef = db.collection("campaigns").doc(campaignId).collection("players").doc(playerId);

  return db.runTransaction(async (transaction) => {
    const playerSnapshot = await transaction.get(playerRef);

    if (!playerSnapshot.exists) {
      throw new EquipmentValidationError("Player could not be found for this campaign.", "player_not_found");
    }

    const playerData = asRecord(playerSnapshot.data());
    const { stacks, didAssignInventoryIds } = normalizeInventoryStacks(asRecord(playerData.inventory).stacks);
    const equipment = normalizePlayerEquipment(playerData.equipment, settings);

    const validIds = new Set(stacks.map((stack) => stack.inventoryItemId));
    let equipmentChanged = false;

    for (const slot of ["head", "body", "cloak", "hands", "feet", "bracers", "neck", "mainHand", "offHand"] as EquipmentSlotKey[]) {
      const current = equipment[slot];
      if (current && !validIds.has(current.inventoryItemId)) {
        equipment[slot] = null;
        equipmentChanged = true;
      }
    }

    equipment.rings = equipment.rings.map((entry) => {
      if (!entry) {
        return null;
      }

      if (!validIds.has(entry.inventoryItemId)) {
        equipmentChanged = true;
        return null;
      }

      return entry;
    });

    if (didAssignInventoryIds || equipmentChanged) {
      transaction.update(playerRef, {
        "inventory.stacks": toFirestoreInventoryStacks(stacks),
        equipment: toFirestoreEquipmentSlots(equipment),
        updatedAt: FieldValue.serverTimestamp()
      });
    }

    return {
      playerName: toStringValue(playerData.name),
      equipment,
      stacks
    };
  });
}

function resolveEquipMeta(stack: NormalizedInventoryStack, input: EquipMutationInput): EquipResolvedMeta {
  const inferred = classifyInventoryItem({
    itemId: stack.itemId,
    containerTag: stack.containerTag
  });

  return {
    slotHint: input.slotHint ?? inferred.equipSlotHint,
    weaponHandedness: input.weaponHandedness ?? inferred.weaponHandedness,
    isShield: typeof input.isShield === "boolean" ? input.isShield : inferred.isShield
  };
}

function ensureAttunementLimit(
  stacks: NormalizedInventoryStack[],
  equipment: PlayerEquipmentSlots,
  settings: EquipSettingsDoc
) {
  if (!settings.enforceAttunementLimit) {
    return;
  }

  const equippedIds = getEquippedInventoryIds(equipment);
  const attunedCount = stacks.filter((stack) => stack.attuned && equippedIds.has(stack.inventoryItemId)).length;

  if (attunedCount > settings.attunementLimit) {
    throw new EquipmentConflictError(
      `Attunement limit exceeded (${attunedCount}/${settings.attunementLimit}).`,
      "attunement_limit_exceeded"
    );
  }
}

function resolveTargetSlot(
  equipment: PlayerEquipmentSlots,
  settings: EquipSettingsDoc,
  input: EquipMutationInput,
  meta: EquipResolvedMeta
): { slot: EquipmentSlotKey | "ring"; ringIndex?: number } {
  const slotHint = meta.slotHint;

  if (!slotHint) {
    throw new EquipmentValidationError("This inventory item cannot be equipped.", "item_not_equippable");
  }

  if (slotHint === "ring") {
    if (settings.slots.rings <= 0) {
      throw new EquipmentConflictError("Ring slots are disabled in campaign settings.", "ring_slots_disabled");
    }

    const requestedRingIndex = parseRingIndex(input.ringIndex);

    if (requestedRingIndex !== null) {
      if (requestedRingIndex < 0 || requestedRingIndex >= equipment.rings.length) {
        throw new EquipmentValidationError("ringIndex is out of range.", "ring_index_out_of_range");
      }

      return {
        slot: "ring",
        ringIndex: requestedRingIndex
      };
    }

    const openRingSlot = findFirstOpenRingSlot(equipment);

    if (openRingSlot !== null) {
      return {
        slot: "ring",
        ringIndex: openRingSlot
      };
    }

    throw new EquipmentConflictError("All ring slots are occupied. Choose a ring slot to replace.", "ring_slots_occupied", {
      availableRingSlots: equipment.rings.length
    });
  }

  if (settings.slots[slotHint] <= 0) {
    throw new EquipmentConflictError(`${slotHint} slot is disabled in campaign settings.`, "slot_disabled", {
      slot: slotHint
    });
  }

  return {
    slot: slotHint
  };
}

function getSlotOccupant(
  equipment: PlayerEquipmentSlots,
  target: { slot: EquipmentSlotKey | "ring"; ringIndex?: number }
): InventoryRef | null {
  if (target.slot === "ring") {
    return typeof target.ringIndex === "number" ? getRingRef(equipment, target.ringIndex) : null;
  }

  return getSlotRef(equipment, target.slot);
}

function setSlotOccupant(
  equipment: PlayerEquipmentSlots,
  target: { slot: EquipmentSlotKey | "ring"; ringIndex?: number },
  value: InventoryRef | null
) {
  if (target.slot === "ring") {
    if (typeof target.ringIndex !== "number") {
      throw new EquipmentValidationError("ringIndex is required for ring slot updates.", "ring_index_required");
    }

    setRingRef(equipment, target.ringIndex, value);
    return;
  }

  setSlotRef(equipment, target.slot, value);
}

function stackByInventoryItemId(stacks: NormalizedInventoryStack[]): Map<string, NormalizedInventoryStack> {
  return stacks.reduce<Map<string, NormalizedInventoryStack>>((accumulator, stack) => {
    accumulator.set(stack.inventoryItemId, stack);
    return accumulator;
  }, new Map());
}

function isTwoHandedEquipped(equipment: PlayerEquipmentSlots): boolean {
  return Boolean(
    equipment.mainHand &&
      equipment.offHand &&
      equipment.mainHand.inventoryItemId &&
      equipment.mainHand.inventoryItemId === equipment.offHand.inventoryItemId
  );
}

function classifyStack(stacksById: Map<string, NormalizedInventoryStack>, ref: InventoryRef | null) {
  if (!ref) {
    return null;
  }

  const stack = stacksById.get(ref.inventoryItemId);
  if (!stack) {
    return null;
  }

  return classifyInventoryItem({
    itemId: stack.itemId,
    containerTag: stack.containerTag
  });
}

function buildLegacySheetEquipment(
  equipment: PlayerEquipmentSlots,
  stacksById: Map<string, NormalizedInventoryStack>
): { equippedWeaponIds: string[]; equippedArmorId: string[] } {
  const weaponIds = new Set<string>();
  const armorIds = new Set<string>();

  const addCompendiumId = (ref: InventoryRef | null, bucket: Set<string>) => {
    if (!ref) {
      return;
    }

    const stack = stacksById.get(ref.inventoryItemId);
    if (stack?.itemId) {
      bucket.add(stack.itemId);
      return;
    }

    if (ref.compendium?.id) {
      bucket.add(ref.compendium.id);
    }
  };

  const offHandClassification = classifyStack(stacksById, equipment.offHand);

  addCompendiumId(equipment.mainHand, weaponIds);

  if (equipment.offHand) {
    if (offHandClassification?.isShield) {
      addCompendiumId(equipment.offHand, armorIds);
    } else {
      addCompendiumId(equipment.offHand, weaponIds);
    }
  }

  addCompendiumId(equipment.body, armorIds);

  return {
    equippedWeaponIds: Array.from(weaponIds),
    equippedArmorId: Array.from(armorIds)
  };
}

async function persistEquipmentState(
  db: Firestore,
  campaignId: string,
  playerId: string,
  stacks: NormalizedInventoryStack[],
  equipment: PlayerEquipmentSlots
) {
  const playerRef = db.collection("campaigns").doc(campaignId).collection("players").doc(playerId);
  const sheetRef = db.collection("campaigns").doc(campaignId).collection("sheets").doc(playerId);
  const stacksById = stackByInventoryItemId(stacks);
  const legacySheetEquipment = buildLegacySheetEquipment(equipment, stacksById);

  await db.runTransaction(async (transaction) => {
    transaction.update(playerRef, {
      "inventory.stacks": toFirestoreInventoryStacks(stacks),
      equipment: toFirestoreEquipmentSlots(equipment),
      updatedAt: FieldValue.serverTimestamp()
    });

    transaction.set(
      sheetRef,
      {
        equipment: legacySheetEquipment,
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
  });
}

export async function equipInventoryItem(db: Firestore, input: EquipMutationInput): Promise<EquipMutationResult> {
  const campaignId = trimCampaignId(input.campaignId);
  const playerId = trimPlayerId(input.playerId);
  const requestedInventoryItemId = input.inventoryItemId?.trim();
  const requestedInventoryIndex = typeof input.inventoryIndex === "number" ? input.inventoryIndex : null;

  const settings = await getOrSeedCampaignEquipSettings(db, campaignId);
  const state = await loadCampaignPlayerState(db, campaignId, playerId, settings);
  const stacksById = stackByInventoryItemId(state.stacks);
  const stack =
    (requestedInventoryItemId ? stacksById.get(requestedInventoryItemId) : null) ??
    (requestedInventoryIndex !== null && requestedInventoryIndex >= 0 && requestedInventoryIndex < state.stacks.length
      ? state.stacks[requestedInventoryIndex]
      : null);

  if (!stack) {
    throw new EquipmentValidationError("The selected inventory item could not be found.", "inventory_item_missing");
  }

  const inventoryItemId = stack.inventoryItemId;

  const meta = resolveEquipMeta(stack, input);
  const target = resolveTargetSlot(state.equipment, settings, input, meta);
  const nextEquipment = cloneEquipment(state.equipment);
  const changes: EquipmentChangeRecord[] = [];

  changes.push(...clearInventoryRefFromEquipment(nextEquipment, inventoryItemId));

  if (target.slot === "offHand" && isTwoHandedEquipped(nextEquipment)) {
    if (!input.autoUnequipConflicts) {
      throw new EquipmentConflictError(
        "Main hand currently uses a two-handed weapon. Unequip or replace it before equipping off-hand.",
        "main_hand_two_handed_conflict"
      );
    }

    const mainRef = nextEquipment.mainHand;
    if (mainRef) {
      changes.push(...clearInventoryRefFromEquipment(nextEquipment, mainRef.inventoryItemId));
    }
  }

  if (meta.weaponHandedness === "two-handed" && target.slot !== "ring") {
    const mainOccupant = nextEquipment.mainHand;
    const offOccupant = nextEquipment.offHand;
    const replacingMain = !mainOccupant || mainOccupant.inventoryItemId === inventoryItemId;
    const replacingOff = !offOccupant || offOccupant.inventoryItemId === inventoryItemId;

    if (!replacingMain && !input.forceReplace) {
      throw new EquipmentConflictError("Main hand slot is occupied. Replace it to equip this item.", "slot_occupied", {
        slot: "mainHand"
      });
    }

    if (!replacingOff && !input.autoUnequipConflicts && !input.forceReplace) {
      throw new EquipmentConflictError(
        "Off hand must be free for a two-handed weapon.",
        "off_hand_conflict_for_two_handed",
        {
          slot: "offHand"
        }
      );
    }

    if (mainOccupant && mainOccupant.inventoryItemId !== inventoryItemId) {
      changes.push(...clearInventoryRefFromEquipment(nextEquipment, mainOccupant.inventoryItemId));
    }

    if (offOccupant && offOccupant.inventoryItemId !== inventoryItemId) {
      changes.push(...clearInventoryRefFromEquipment(nextEquipment, offOccupant.inventoryItemId));
    }

    const ref = buildInventoryRef(stack);
    nextEquipment.mainHand = ref;
    nextEquipment.offHand = ref;
    changes.push({
      action: "equip",
      slot: "mainHand",
      inventoryItemId
    });
    changes.push({
      action: "equip",
      slot: "offHand",
      inventoryItemId
    });
  } else {
    const occupant = getSlotOccupant(nextEquipment, target);

    if (occupant && occupant.inventoryItemId !== inventoryItemId && !input.forceReplace) {
      throw new EquipmentConflictError("The target slot is occupied. Replace the existing item to continue.", "slot_occupied", {
        slot: target.slot,
        ringIndex: target.ringIndex ?? null
      });
    }

    if (occupant && occupant.inventoryItemId !== inventoryItemId) {
      changes.push(...clearInventoryRefFromEquipment(nextEquipment, occupant.inventoryItemId));
    }

    setSlotOccupant(nextEquipment, target, buildInventoryRef(stack));

    changes.push({
      action: occupant && occupant.inventoryItemId !== inventoryItemId ? "swap" : "equip",
      slot: target.slot,
      ringIndex: target.ringIndex ?? null,
      inventoryItemId
    });
  }

  ensureAttunementLimit(state.stacks, nextEquipment, settings);
  syncStackEquippedFlags(state.stacks, nextEquipment);
  await persistEquipmentState(db, campaignId, playerId, state.stacks, nextEquipment);

  return {
    campaignId,
    playerId,
    playerName: state.playerName,
    itemName: stackLabel(stack),
    equipment: nextEquipment,
    changes
  };
}

export async function unequipInventorySlot(db: Firestore, input: UnequipMutationInput): Promise<UnequipMutationResult> {
  const campaignId = trimCampaignId(input.campaignId);
  const playerId = trimPlayerId(input.playerId);
  const settings = await getOrSeedCampaignEquipSettings(db, campaignId);
  const state = await loadCampaignPlayerState(db, campaignId, playerId, settings);
  const nextEquipment = cloneEquipment(state.equipment);
  const changes: EquipmentChangeRecord[] = [];

  if (input.slot === "ring") {
    const ringIndex = parseRingIndex(input.ringIndex);

    if (ringIndex === null || ringIndex < 0 || ringIndex >= settings.slots.rings) {
      throw new EquipmentValidationError("Valid ringIndex is required for ring unequip.", "ring_index_required");
    }

    const current = nextEquipment.rings[ringIndex];
    if (!current) {
      throw new EquipmentValidationError("Selected ring slot is already empty.", "slot_already_empty");
    }

    nextEquipment.rings[ringIndex] = null;
    changes.push({
      action: "unequip",
      slot: "ring",
      ringIndex,
      inventoryItemId: current.inventoryItemId
    });
  } else {
    const current = nextEquipment[input.slot];
    if (!current) {
      throw new EquipmentValidationError("Selected slot is already empty.", "slot_already_empty");
    }

    const inventoryId = current.inventoryItemId;
    changes.push(...clearInventoryRefFromEquipment(nextEquipment, inventoryId));
  }

  syncStackEquippedFlags(state.stacks, nextEquipment);
  await persistEquipmentState(db, campaignId, playerId, state.stacks, nextEquipment);

  const firstInventoryId = changes.find((change) => change.inventoryItemId)?.inventoryItemId ?? null;
  const removedStack = firstInventoryId ? state.stacks.find((stack) => stack.inventoryItemId === firstInventoryId) : null;

  return {
    campaignId,
    playerId,
    playerName: state.playerName,
    unequippedItemName: removedStack ? stackLabel(removedStack) : null,
    equipment: nextEquipment,
    changes
  };
}

export async function swapInventoryItem(
  db: Firestore,
  input: EquipMutationInput
): Promise<EquipMutationResult> {
  return equipInventoryItem(db, {
    ...input,
    forceReplace: true,
    autoUnequipConflicts: input.autoUnequipConflicts ?? true
  });
}

export function formatEquipmentChangeSummary(changes: EquipmentChangeRecord[]): string {
  if (!changes.length) {
    return "No equipment changes were recorded.";
  }

  const segments = changes.slice(0, 3).map((change) => {
    const slotLabel =
      change.slot === "ring" && typeof change.ringIndex === "number"
        ? `ring ${change.ringIndex + 1}`
        : change.slot;

    return `${change.action} ${slotLabel}`;
  });

  if (changes.length > segments.length) {
    segments.push(`+${changes.length - segments.length} more`);
  }

  return segments.join(", ");
}

export function mapEquipmentError(error: unknown): {
  status: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
} {
  if (error instanceof EquipmentValidationError || error instanceof EquipmentConflictError) {
    return {
      status: error.status,
      code: error.code,
      message: error.message,
      details: error instanceof EquipmentConflictError ? error.details : undefined
    };
  }

  const message = error instanceof Error ? error.message : "Unable to process equipment operation.";
  return {
    status: 500,
    code: "equipment_operation_failed",
    message
  };
}
