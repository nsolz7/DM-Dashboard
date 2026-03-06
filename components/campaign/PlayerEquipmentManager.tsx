"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { EmptyState } from "@/components/shared/EmptyState";
import { PixelPanel } from "@/components/ui/PixelPanel";
import { classifyInventoryItem } from "@/lib/equipment/inference";
import {
  DEFAULT_EQUIP_SETTINGS,
  EQUIPMENT_SLOT_LABELS,
  createEmptyEquipmentSlots,
  normalizePlayerEquipment
} from "@/lib/equipment/schema";
import { isRecord, readableId, toStringValue } from "@/lib/utils";
import type {
  CompendiumLinkedRecord,
  EquipSettingsDoc,
  EquipmentItemClassification,
  EquipmentSlotKey,
  Player,
  PlayerInventoryStack,
  PlayerEquipmentSlots
} from "@/types";

interface PlayerEquipmentManagerProps {
  campaignId: string;
  player: Player;
  linkedLookup: Record<string, CompendiumLinkedRecord>;
  onRefresh: () => void;
}

type InventoryCategoryTab = "weapons" | "armor" | "wearables" | "consumables" | "misc";

type EquipmentSlotRef = {
  slot: EquipmentSlotKey | "ring";
  ringIndex?: number;
};

interface InventoryRow {
  stack: PlayerInventoryStack;
  index: number;
  inventoryItemId: string;
  record: CompendiumLinkedRecord | null;
  classification: EquipmentItemClassification;
  name: string;
  summary: string | null;
}

interface PendingEquipState {
  row: InventoryRow;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

const categoryTabs: Array<{ key: InventoryCategoryTab; label: string }> = [
  { key: "weapons", label: "Weapons" },
  { key: "armor", label: "Armor" },
  { key: "wearables", label: "Wearables" },
  { key: "consumables", label: "Consumables" },
  { key: "misc", label: "Misc" }
];

const compendiumRouteByDataset: Record<string, string> = {
  species: "species",
  class: "classes",
  background: "backgrounds",
  item: "items",
  spell: "spells",
  trait: "traits"
};

function getCompendiumHref(record: CompendiumLinkedRecord | null | undefined): string | null {
  if (!record) {
    return null;
  }

  const route = compendiumRouteByDataset[record.dataset];
  return route ? `/compendium/${route}/${encodeURIComponent(record.id)}` : null;
}

function getReferenceSummary(record: CompendiumLinkedRecord | null | undefined): string | null {
  if (!record?.summary) {
    return null;
  }

  const normalized = record.summary.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return null;
  }

  return normalized.length > 220 ? `${normalized.slice(0, 220).trimEnd()}...` : normalized;
}

function listEquippedRefs(equipment: PlayerEquipmentSlots): Array<{ key: string; ref: NonNullable<PlayerEquipmentSlots["head"]> }> {
  const refs: Array<{ key: string; ref: NonNullable<PlayerEquipmentSlots["head"]> }> = [];

  for (const slot of ["head", "body", "cloak", "hands", "feet", "bracers", "neck", "mainHand", "offHand"] as EquipmentSlotKey[]) {
    const ref = equipment[slot];

    if (ref) {
      refs.push({ key: `${slot}:${ref.inventoryItemId}`, ref });
    }
  }

  equipment.rings.forEach((entry, index) => {
    if (entry) {
      refs.push({ key: `ring-${index}:${entry.inventoryItemId}`, ref: entry });
    }
  });

  return refs;
}

function findSlotsForInventoryItem(equipment: PlayerEquipmentSlots, inventoryItemId: string): EquipmentSlotRef[] {
  const slots: EquipmentSlotRef[] = [];

  for (const slot of ["head", "body", "cloak", "hands", "feet", "bracers", "neck", "mainHand", "offHand"] as EquipmentSlotKey[]) {
    if (equipment[slot]?.inventoryItemId === inventoryItemId) {
      slots.push({ slot });
    }
  }

  equipment.rings.forEach((entry, index) => {
    if (entry?.inventoryItemId === inventoryItemId) {
      slots.push({
        slot: "ring",
        ringIndex: index
      });
    }
  });

  return slots;
}

function getSlotCompatibility(classification: EquipmentItemClassification, slot: EquipmentSlotRef): boolean {
  if (!classification.equippable) {
    return false;
  }

  if (slot.slot === "ring") {
    return classification.equipSlotHint === "ring";
  }

  if (slot.slot === "mainHand") {
    return classification.equipSlotHint === "mainHand" || classification.equipSlotHint === "offHand" || classification.category === "weapons";
  }

  if (slot.slot === "offHand") {
    return classification.equipSlotHint === "offHand" || classification.equipSlotHint === "mainHand" || classification.isShield;
  }

  return classification.equipSlotHint === slot.slot;
}

function normalizeLegacyEquipment(
  player: Player,
  settings: EquipSettingsDoc,
  rowsById: Map<string, InventoryRow>
): PlayerEquipmentSlots {
  const normalized = normalizePlayerEquipment(player.equipment, settings);
  const hasExplicitSlots = listEquippedRefs(normalized).length > 0;

  if (hasExplicitSlots) {
    return normalized;
  }

  const fallback = createEmptyEquipmentSlots(settings.slots.rings);
  const equippedRows = player.inventory.stacks
    .map((stack, index) => ({
      stack,
      row: rowsById.get(stack.inventoryItemId ?? `legacy-${index}-${stack.itemId ?? "item"}`) ?? null
    }))
    .filter((entry) => entry.stack.equipped && entry.row)
    .map((entry) => entry.row as InventoryRow);

  for (const row of equippedRows) {
    const ref = {
      inventoryItemId: row.inventoryItemId,
      source: "inventory" as const,
      ...(row.stack.itemId
        ? {
            compendium: {
              type: "items",
              id: row.stack.itemId
            }
          }
        : {})
    };

    const slotHint = row.classification.equipSlotHint;

    if (slotHint === "ring") {
      const openRing = fallback.rings.findIndex((entry) => !entry);
      if (openRing >= 0) {
        fallback.rings[openRing] = ref;
      }
      continue;
    }

    if (!slotHint) {
      continue;
    }

    if (slotHint === "mainHand" && row.classification.weaponHandedness === "two-handed") {
      fallback.mainHand = ref;
      fallback.offHand = ref;
      continue;
    }

    if (!fallback[slotHint]) {
      fallback[slotHint] = ref;
    }
  }

  return fallback;
}

function rowLabel(row: InventoryRow): string {
  const suffix = row.stack.itemId ? readableId(row.stack.itemId) : row.inventoryItemId;
  return row.name || suffix;
}

export function PlayerEquipmentManager({
  campaignId,
  player,
  linkedLookup,
  onRefresh
}: PlayerEquipmentManagerProps) {
  const [settings, setSettings] = useState<EquipSettingsDoc | null>(null);
  const [isSettingsLoading, setIsSettingsLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<InventoryCategoryTab>("weapons");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [activeActionKey, setActiveActionKey] = useState<string | null>(null);
  const [slotPicker, setSlotPicker] = useState<EquipmentSlotRef | null>(null);
  const [pendingEquip, setPendingEquip] = useState<PendingEquipState | null>(null);
  const [pendingOffHandRow, setPendingOffHandRow] = useState<InventoryRow | null>(null);
  const [ringReplaceIndex, setRingReplaceIndex] = useState<number>(0);

  useEffect(() => {
    let active = true;

    setIsSettingsLoading(true);
    setActionError(null);
    setActionMessage(null);

    void fetch(`/api/equipment/settings?campaignId=${encodeURIComponent(campaignId)}`, {
      cache: "no-store"
    })
      .then(async (response) => {
        const payload = (await response.json()) as { settings?: EquipSettingsDoc; error?: string };

        if (!response.ok || !payload.settings) {
          throw new Error(payload.error || "Unable to load equip settings.");
        }

        if (active) {
          setSettings(payload.settings);
        }
      })
      .catch((error) => {
        if (active) {
          setSettings(DEFAULT_EQUIP_SETTINGS);
          setActionError(error instanceof Error ? error.message : "Unable to load equip settings.");
        }
      })
      .finally(() => {
        if (active) {
          setIsSettingsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [campaignId]);

  const inventoryRows = useMemo<InventoryRow[]>(() => {
    return player.inventory.stacks.map((stack, index) => {
      const inventoryItemId = stack.inventoryItemId ?? `legacy-${index}-${stack.itemId ?? "item"}`;
      const record = stack.itemId ? linkedLookup[stack.itemId] ?? null : null;
      const classification = classifyInventoryItem({
        itemId: stack.itemId,
        containerTag: stack.containerTag,
        itemName: record?.name ?? null,
        compendiumRaw: isRecord(record?.raw) ? (record.raw as Record<string, unknown>) : null
      });
      const name = record?.name ?? readableId(stack.itemId) ?? inventoryItemId;

      return {
        stack,
        index,
        inventoryItemId,
        record,
        classification,
        name,
        summary: getReferenceSummary(record)
      };
    });
  }, [linkedLookup, player.inventory.stacks]);

  const rowsByInventoryId = useMemo(() => {
    return inventoryRows.reduce<Map<string, InventoryRow>>((accumulator, row) => {
      accumulator.set(row.inventoryItemId, row);
      return accumulator;
    }, new Map());
  }, [inventoryRows]);

  const equipSettings = settings ?? DEFAULT_EQUIP_SETTINGS;
  const equipment = useMemo(
    () => normalizeLegacyEquipment(player, equipSettings, rowsByInventoryId),
    [equipSettings, player, rowsByInventoryId]
  );

  const equippedInventoryIds = useMemo(
    () => new Set(listEquippedRefs(equipment).map((entry) => entry.ref.inventoryItemId)),
    [equipment]
  );

  const categorizedRows = useMemo(() => {
    return inventoryRows.reduce<Record<InventoryCategoryTab, InventoryRow[]>>(
      (accumulator, row) => {
        const category = row.classification.category;
        accumulator[category].push(row);
        return accumulator;
      },
      {
        weapons: [],
        armor: [],
        wearables: [],
        consumables: [],
        misc: []
      }
    );
  }, [inventoryRows]);

  const oneHandedWeaponCandidates = useMemo(
    () =>
      inventoryRows.filter(
        (row) =>
          row.classification.category === "weapons" &&
          row.classification.weaponHandedness !== "two-handed" &&
          row.classification.equippable
      ),
    [inventoryRows]
  );

  async function postEquipment<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const response = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        campaignId,
        playerId: player.id,
        ...body
      })
    });

    const payload = (await response.json()) as {
      error?: string;
      code?: string;
      details?: Record<string, unknown>;
    } & T;

    if (!response.ok) {
      const error = new Error(payload.error || "Equipment action failed.");
      (error as Error & { code?: string }).code = payload.code;
      (error as Error & { details?: Record<string, unknown> }).details = payload.details;
      throw error;
    }

    return payload;
  }

  function resetTransientState() {
    setPendingEquip(null);
    setPendingOffHandRow(null);
    setSlotPicker(null);
  }

  function showSuccess(message: string) {
    setActionError(null);
    setActionMessage(message);
  }

  function showError(error: unknown, fallback: string) {
    setActionMessage(null);
    setActionError(error instanceof Error ? error.message : fallback);
  }

  async function reloadAfterSuccess(message: string) {
    showSuccess(message);
    resetTransientState();
    onRefresh();
  }

  async function handleEquipRow(row: InventoryRow) {
    const actionKey = `equip-${row.inventoryItemId}`;
    setActiveActionKey(actionKey);
    setActionError(null);
    setActionMessage(null);

    try {
      await postEquipment("/api/equipment/equip", {
        inventoryItemId: row.stack.inventoryItemId ?? undefined,
        inventoryIndex: row.index,
        slotHint: row.classification.equipSlotHint ?? undefined,
        weaponHandedness: row.classification.weaponHandedness,
        isShield: row.classification.isShield
      });

      await reloadAfterSuccess(`${rowLabel(row)} equipped.`);
    } catch (equipError) {
      const errorWithCode = equipError as Error & { code?: string; details?: Record<string, unknown> };

      if (
        errorWithCode.code === "slot_occupied" ||
        errorWithCode.code === "ring_slots_occupied" ||
        errorWithCode.code === "off_hand_conflict_for_two_handed"
      ) {
        setPendingEquip({
          row,
          code: errorWithCode.code,
          message: errorWithCode.message,
          details: errorWithCode.details
        });
      } else if (errorWithCode.code === "main_hand_two_handed_conflict") {
        setPendingOffHandRow(row);
      } else {
        showError(equipError, "Unable to equip this item.");
      }
    } finally {
      setActiveActionKey(null);
    }
  }

  async function handleSwapToSlot(row: InventoryRow, slot: EquipmentSlotRef) {
    const actionKey = `swap-${row.inventoryItemId}-${slot.slot}-${slot.ringIndex ?? "base"}`;
    setActiveActionKey(actionKey);
    setActionError(null);
    setActionMessage(null);

    try {
      await postEquipment("/api/equipment/swap", {
        inventoryItemId: row.stack.inventoryItemId ?? undefined,
        inventoryIndex: row.index,
        slotHint: slot.slot,
        ringIndex: slot.ringIndex,
        weaponHandedness: row.classification.weaponHandedness,
        isShield: row.classification.isShield,
        autoUnequipConflicts: true
      });

      await reloadAfterSuccess(`${rowLabel(row)} equipped to ${slot.slot === "ring" ? `ring ${Number(slot.ringIndex) + 1}` : slot.slot}.`);
    } catch (swapError) {
      showError(swapError, "Unable to swap this equipment slot.");
    } finally {
      setActiveActionKey(null);
    }
  }

  async function handleUnequipSlot(slot: EquipmentSlotRef) {
    const actionKey = `unequip-${slot.slot}-${slot.ringIndex ?? "base"}`;
    setActiveActionKey(actionKey);
    setActionError(null);
    setActionMessage(null);

    try {
      await postEquipment("/api/equipment/unequip", {
        slot: slot.slot,
        ringIndex: slot.ringIndex
      });

      await reloadAfterSuccess(`${slot.slot === "ring" ? `Ring ${Number(slot.ringIndex) + 1}` : EQUIPMENT_SLOT_LABELS[slot.slot]} unequipped.`);
    } catch (unequipError) {
      showError(unequipError, "Unable to unequip this slot.");
    } finally {
      setActiveActionKey(null);
    }
  }

  async function handleUnequipItem(row: InventoryRow) {
    const slots = findSlotsForInventoryItem(equipment, row.inventoryItemId);

    if (!slots.length) {
      setActionError("No equipped slot could be resolved for this inventory item.");
      return;
    }

    await handleUnequipSlot(slots[0]);
  }

  async function handleRemoveInventory(index: number) {
    const actionKey = `remove-${index}`;
    setActiveActionKey(actionKey);
    setActionError(null);
    setActionMessage(null);

    try {
      const response = await fetch("/api/assign", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          campaignId,
          playerId: player.id,
          target: "inventory",
          index
        })
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "Unable to remove this inventory entry.");
      }

      await reloadAfterSuccess("Inventory entry removed.");
    } catch (removeError) {
      showError(removeError, "Unable to remove this inventory entry.");
    } finally {
      setActiveActionKey(null);
    }
  }

  async function handleConfirmPendingSwap() {
    if (!pendingEquip) {
      return;
    }

    const slotFromDetails = toStringValue(pendingEquip.details?.slot) as EquipmentSlotRef["slot"] | null;
    const defaultSlot = pendingEquip.row.classification.equipSlotHint;
    const targetSlot: EquipmentSlotRef["slot"] = slotFromDetails ?? defaultSlot ?? "mainHand";
    const ringIndexValue =
      targetSlot === "ring"
        ? Number.isInteger(ringReplaceIndex)
          ? ringReplaceIndex
          : 0
        : undefined;

    await handleSwapToSlot(pendingEquip.row, {
      slot: targetSlot,
      ringIndex: ringIndexValue
    });
  }

  async function handleOffHandConflictChoice(mode: "switch_one_handed" | "unequip_main") {
    if (!pendingOffHandRow) {
      return;
    }

    if (mode === "unequip_main") {
      const actionKey = `offhand-unequip-main-${pendingOffHandRow.inventoryItemId}`;
      setActiveActionKey(actionKey);

      try {
        await postEquipment("/api/equipment/unequip", {
          slot: "mainHand"
        });
        await postEquipment("/api/equipment/equip", {
          inventoryItemId: pendingOffHandRow.stack.inventoryItemId ?? undefined,
          inventoryIndex: pendingOffHandRow.index,
          slotHint: "offHand",
          weaponHandedness: pendingOffHandRow.classification.weaponHandedness,
          isShield: pendingOffHandRow.classification.isShield,
          autoUnequipConflicts: true
        });
        await reloadAfterSuccess(`${rowLabel(pendingOffHandRow)} equipped in off-hand.`);
      } catch (conflictError) {
        showError(conflictError, "Unable to resolve two-handed conflict.");
      } finally {
        setActiveActionKey(null);
      }
      return;
    }

    setSlotPicker({
      slot: "mainHand"
    });
  }

  async function handleSwitchOneHandedThenEquipOffHand(row: InventoryRow) {
    if (!pendingOffHandRow) {
      return;
    }

    const actionKey = `switch-main-${row.inventoryItemId}`;
    setActiveActionKey(actionKey);
    setActionError(null);

    try {
      await postEquipment("/api/equipment/swap", {
        inventoryItemId: row.stack.inventoryItemId ?? undefined,
        inventoryIndex: row.index,
        slotHint: "mainHand",
        weaponHandedness: row.classification.weaponHandedness,
        isShield: row.classification.isShield,
        autoUnequipConflicts: true
      });
      await postEquipment("/api/equipment/equip", {
        inventoryItemId: pendingOffHandRow.stack.inventoryItemId ?? undefined,
        inventoryIndex: pendingOffHandRow.index,
        slotHint: "offHand",
        weaponHandedness: pendingOffHandRow.classification.weaponHandedness,
        isShield: pendingOffHandRow.classification.isShield
      });
      await reloadAfterSuccess(`${rowLabel(pendingOffHandRow)} equipped in off-hand after switching main hand.`);
    } catch (error) {
      showError(error, "Unable to switch main hand and equip off-hand.");
    } finally {
      setActiveActionKey(null);
    }
  }

  const visibleRows = categorizedRows[activeCategory];

  if (isSettingsLoading) {
    return <PixelPanel className="text-sm text-crt-muted">Loading equipment manager...</PixelPanel>;
  }

  return (
    <PixelPanel className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-crt-muted">Inventory & Equipment</p>
        <p className="text-[10px] uppercase tracking-[0.15em] text-crt-muted">
          Attunement {equipSettings.enforceAttunementLimit ? `ON (${equipSettings.attunementLimit})` : "OFF"}
        </p>
      </div>

      {actionError ? (
        <div className="border-2 border-crt-danger bg-crt-panel px-3 py-3 text-xs uppercase tracking-[0.16em] text-crt-danger">
          {actionError}
        </div>
      ) : null}
      {actionMessage ? (
        <div className="border-2 border-crt-accent bg-crt-panel px-3 py-3 text-xs uppercase tracking-[0.16em] text-crt-accent">
          {actionMessage}
        </div>
      ) : null}

      <div className="grid gap-3 xl:grid-cols-2">
        {(["head", "body", "cloak", "hands", "feet", "bracers", "neck", "mainHand", "offHand"] as EquipmentSlotKey[]).map((slot) => {
          const entry = equipment[slot];
          const row = entry ? rowsByInventoryId.get(entry.inventoryItemId) ?? null : null;
          const slotRef: EquipmentSlotRef = { slot };

          return (
            <div className="border border-crt-border bg-crt-panel-2 px-3 py-3" key={slot}>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-crt-accent">{EQUIPMENT_SLOT_LABELS[slot]}</p>
              <p className="mt-2 text-sm font-bold uppercase tracking-[0.1em] text-crt-text">{row ? rowLabel(row) : "—"}</p>
              <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-crt-muted">
                {row?.classification.typeLabel ?? row?.classification.category ?? "empty"}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  className="border border-crt-border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-crt-text transition hover:border-crt-accent"
                  onClick={() => setSlotPicker(slotRef)}
                  type="button"
                >
                  Swap / Equip
                </button>
                <button
                  className="border border-crt-danger px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-crt-danger transition hover:bg-crt-danger hover:text-crt-bg disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={!entry || activeActionKey === `unequip-${slot}-base`}
                  onClick={() => void handleUnequipSlot(slotRef)}
                  type="button"
                >
                  Unequip
                </button>
              </div>
            </div>
          );
        })}
        {Array.from({ length: equipSettings.slots.rings }).map((_, index) => {
          const entry = equipment.rings[index] ?? null;
          const row = entry ? rowsByInventoryId.get(entry.inventoryItemId) ?? null : null;
          const slotRef: EquipmentSlotRef = {
            slot: "ring",
            ringIndex: index
          };

          return (
            <div className="border border-crt-border bg-crt-panel-2 px-3 py-3" key={`ring-${index}`}>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-crt-accent">{`Ring ${index + 1}`}</p>
              <p className="mt-2 text-sm font-bold uppercase tracking-[0.1em] text-crt-text">{row ? rowLabel(row) : "—"}</p>
              <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-crt-muted">
                {row?.classification.typeLabel ?? row?.classification.category ?? "empty"}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  className="border border-crt-border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-crt-text transition hover:border-crt-accent"
                  onClick={() => setSlotPicker(slotRef)}
                  type="button"
                >
                  Swap / Equip
                </button>
                <button
                  className="border border-crt-danger px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-crt-danger transition hover:bg-crt-danger hover:text-crt-bg disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={!entry || activeActionKey === `unequip-ring-${index}`}
                  onClick={() => void handleUnequipSlot(slotRef)}
                  type="button"
                >
                  Unequip
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-crt-border pt-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-crt-accent">Equipped Inventory</p>
        <p className="mt-2 text-sm text-crt-muted">
          {equippedInventoryIds.size
            ? Array.from(equippedInventoryIds)
                .map((id) => rowsByInventoryId.get(id))
                .filter((row): row is InventoryRow => Boolean(row))
                .map((row) => rowLabel(row))
                .join(", ")
            : "No equipped inventory entries are mapped."}
        </p>
      </div>

      <div className="border-t border-crt-border pt-4">
        <div className="flex flex-wrap gap-2">
          {categoryTabs.map((tab) => (
            <button
              className={`border px-3 py-2 text-[10px] font-bold uppercase tracking-[0.16em] transition ${
                activeCategory === tab.key
                  ? "border-crt-accent bg-crt-panel text-crt-accent"
                  : "border-crt-border bg-crt-panel-2 text-crt-text hover:border-crt-accent"
              }`}
              key={tab.key}
              onClick={() => setActiveCategory(tab.key)}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-3">
          {visibleRows.length ? (
            visibleRows.map((row) => {
              const itemHref = getCompendiumHref(row.record);
              const isEquipped = equippedInventoryIds.has(row.inventoryItemId);
              const actionKey = `equip-${row.inventoryItemId}`;

              return (
                <div className="border-2 border-crt-border bg-crt-panel-2 p-3" key={`${row.inventoryItemId}-${row.index}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold uppercase tracking-[0.12em] text-crt-text">
                        {itemHref ? (
                          <Link className="transition hover:text-crt-accent" href={itemHref}>
                            {rowLabel(row)}
                          </Link>
                        ) : (
                          rowLabel(row)
                        )}
                      </p>
                      <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-crt-muted">
                        {row.classification.typeLabel ?? row.classification.category} / qty {row.stack.qty ?? 1}
                        {row.stack.sourceType ? ` / from ${row.stack.sourceType}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {isEquipped ? <span className="border border-crt-accent px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-crt-accent">Equipped</span> : null}
                      {row.stack.attuned ? <span className="border border-crt-border px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-crt-text">Attuned</span> : null}
                      {row.classification.equippable ? (
                        isEquipped ? (
                          <button
                            className="border border-crt-danger px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-crt-danger transition hover:bg-crt-danger hover:text-crt-bg disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={activeActionKey === `unequip-item-${row.inventoryItemId}`}
                            onClick={() => void handleUnequipItem(row)}
                            type="button"
                          >
                            Unequip
                          </button>
                        ) : (
                          <button
                            className="border border-crt-accent px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-crt-accent transition hover:bg-crt-accent hover:text-crt-bg disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={activeActionKey === actionKey}
                            onClick={() => void handleEquipRow(row)}
                            type="button"
                          >
                            Equip
                          </button>
                        )
                      ) : null}
                      <button
                        className="border border-crt-danger px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-crt-danger transition hover:bg-crt-danger hover:text-crt-bg disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={activeActionKey === `remove-${row.index}`}
                        onClick={() => void handleRemoveInventory(row.index)}
                        type="button"
                      >
                        [-]
                      </button>
                    </div>
                  </div>
                  {row.summary ? <p className="mt-3 text-sm leading-6 text-crt-muted">{row.summary}</p> : null}
                </div>
              );
            })
          ) : (
            <EmptyState body={`No ${activeCategory} entries were found on this player.`} title="No Inventory Entries" />
          )}
        </div>
      </div>

      {slotPicker && !pendingOffHandRow ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-2xl border-2 border-crt-border bg-crt-panel p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold uppercase tracking-[0.16em] text-crt-text">
                {`Equip ${slotPicker.slot === "ring" ? `Ring ${Number(slotPicker.ringIndex) + 1}` : EQUIPMENT_SLOT_LABELS[slotPicker.slot]}`}
              </h3>
              <button
                className="border border-crt-border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-crt-text"
                onClick={() => setSlotPicker(null)}
                type="button"
              >
                Close
              </button>
            </div>
            <div className="mt-4 max-h-[55vh] space-y-2 overflow-y-auto pr-1">
              {inventoryRows
                .filter((row) => getSlotCompatibility(row.classification, slotPicker))
                .map((row) => (
                  <button
                    className="w-full border border-crt-border bg-crt-panel-2 px-3 py-2 text-left text-sm text-crt-text transition hover:border-crt-accent"
                    key={`slot-picker-${row.inventoryItemId}-${row.index}`}
                    onClick={() => void handleSwapToSlot(row, slotPicker)}
                    type="button"
                  >
                    <span className="block font-bold uppercase tracking-[0.1em]">{rowLabel(row)}</span>
                    <span className="mt-1 block text-[10px] uppercase tracking-[0.14em] text-crt-muted">
                      {row.classification.typeLabel ?? row.classification.category}
                    </span>
                  </button>
                ))}
            </div>
          </div>
        </div>
      ) : null}

      {pendingEquip ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-lg border-2 border-crt-border bg-crt-panel p-4">
            <h3 className="text-sm font-bold uppercase tracking-[0.16em] text-crt-text">Replace Equipped Item?</h3>
            <p className="mt-3 text-sm leading-6 text-crt-muted">{pendingEquip.message}</p>
            {pendingEquip.code === "ring_slots_occupied" ? (
              <div className="mt-3">
                <p className="text-[10px] uppercase tracking-[0.14em] text-crt-accent">Choose Ring Slot</p>
                <select
                  className="mt-2 border border-crt-border bg-crt-panel-2 px-2 py-2 text-sm text-crt-text"
                  onChange={(event) => setRingReplaceIndex(Number(event.target.value) || 0)}
                  value={ringReplaceIndex}
                >
                  {Array.from({ length: Math.max(equipSettings.slots.rings, 1) }).map((_, index) => (
                    <option key={`replace-ring-${index}`} value={index}>
                      Ring {index + 1}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                className="border border-crt-border px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-crt-text"
                onClick={() => setPendingEquip(null)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="border border-crt-accent px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-crt-accent transition hover:bg-crt-accent hover:text-crt-bg"
                onClick={() => void handleConfirmPendingSwap()}
                type="button"
              >
                Replace
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pendingOffHandRow ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-xl border-2 border-crt-border bg-crt-panel p-4">
            <h3 className="text-sm font-bold uppercase tracking-[0.16em] text-crt-text">Off-Hand Conflict</h3>
            <p className="mt-3 text-sm leading-6 text-crt-muted">
              Main hand currently uses a two-handed weapon. Choose how to equip {rowLabel(pendingOffHandRow)}.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                className="border border-crt-border px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-crt-text"
                onClick={() => setPendingOffHandRow(null)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="border border-crt-accent px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-crt-accent transition hover:bg-crt-accent hover:text-crt-bg"
                onClick={() => void handleOffHandConflictChoice("switch_one_handed")}
                type="button"
              >
                Switch Main-Hand to One-Handed
              </button>
              <button
                className="border border-crt-accent px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-crt-accent transition hover:bg-crt-accent hover:text-crt-bg"
                onClick={() => void handleOffHandConflictChoice("unequip_main")}
                type="button"
              >
                Unequip Main-Hand Then Equip Off-Hand
              </button>
            </div>

            {slotPicker?.slot === "mainHand" ? (
              <div className="mt-4 max-h-[38vh] space-y-2 overflow-y-auto border-t border-crt-border pt-3">
                <p className="text-[10px] uppercase tracking-[0.14em] text-crt-accent">Select replacement one-handed weapon</p>
                {oneHandedWeaponCandidates.map((row) => (
                  <button
                    className="w-full border border-crt-border bg-crt-panel-2 px-3 py-2 text-left text-sm text-crt-text transition hover:border-crt-accent"
                    key={`one-handed-${row.inventoryItemId}-${row.index}`}
                    onClick={() => void handleSwitchOneHandedThenEquipOffHand(row)}
                    type="button"
                  >
                    <span className="block font-bold uppercase tracking-[0.1em]">{rowLabel(row)}</span>
                    <span className="mt-1 block text-[10px] uppercase tracking-[0.14em] text-crt-muted">
                      {row.classification.typeLabel ?? row.classification.category}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </PixelPanel>
  );
}
