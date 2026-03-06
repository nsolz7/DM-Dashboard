import type { EquipmentHandedness, EquipmentItemClassification, EquipmentSlotHint } from "@/types";
import { isRecord, toStringValue } from "@/lib/utils";

interface InferenceSource {
  itemId?: string | null;
  containerTag?: string | null;
  itemName?: string | null;
  compendiumRaw?: Record<string, unknown> | null;
}

function normalizeToken(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.toLowerCase().replace(/[_-]+/g, " ").trim();
}

function collectSignalText(source: InferenceSource): string {
  const raw = source.compendiumRaw;
  const taxonomy = isRecord(raw?.taxonomy) ? raw.taxonomy : null;
  const weapon = isRecord(raw?.weapon) ? raw.weapon : null;
  const stats = isRecord(raw?.stats) ? raw.stats : null;
  const classification = isRecord(raw?.classification) ? raw.classification : null;

  const signals = [
    source.itemId,
    source.itemName,
    source.containerTag,
    toStringValue(raw?.type),
    toStringValue(raw?.category),
    toStringValue(taxonomy?.type),
    toStringValue(taxonomy?.category),
    toStringValue(taxonomy?.rarity),
    toStringValue(classification?.type),
    toStringValue(classification?.category),
    toStringValue(weapon?.handedness),
    toStringValue(stats?.weaponHandedness)
  ];

  return signals.map((entry) => normalizeToken(entry)).filter((entry) => entry.length > 0).join(" ");
}

function inferHandedness(signalText: string, compendiumRaw?: Record<string, unknown> | null): EquipmentHandedness {
  const taxonomy = isRecord(compendiumRaw?.taxonomy) ? compendiumRaw.taxonomy : null;
  const weapon = isRecord(compendiumRaw?.weapon) ? compendiumRaw.weapon : null;
  const stats = isRecord(compendiumRaw?.stats) ? compendiumRaw.stats : null;

  const explicit =
    normalizeToken(weapon?.handedness) ||
    normalizeToken(stats?.weaponHandedness) ||
    normalizeToken(taxonomy?.weaponHandedness);

  if (explicit.includes("two")) {
    return "two-handed";
  }

  if (explicit.includes("versatile")) {
    return "versatile";
  }

  if (explicit.includes("one")) {
    return "one-handed";
  }

  if (
    /\b(two handed|2 handed|greatsword|maul|halberd|glaive|greataxe|pike|longbow|heavy crossbow|shortbow|greatclub)\b/.test(
      signalText
    )
  ) {
    return "two-handed";
  }

  if (/\b(versatile)\b/.test(signalText)) {
    return "versatile";
  }

  if (/\b(weapon|sword|bow|axe|mace|dagger|staff|club|hammer|spear)\b/.test(signalText)) {
    return "one-handed";
  }

  return "unknown";
}

function inferSlotHint(signalText: string, fallbackWeaponSlot: EquipmentSlotHint): EquipmentSlotHint | null {
  if (/\b(shield|buckler)\b/.test(signalText)) {
    return "offHand";
  }

  if (/\b(ring)\b/.test(signalText)) {
    return "ring";
  }

  if (/\b(helmet|helm|headband|hood|hat|circlet|crown|head)\b/.test(signalText)) {
    return "head";
  }

  if (/\b(cloak|cape|mantle)\b/.test(signalText)) {
    return "cloak";
  }

  if (/\b(glove|gauntlet|mitt|handwrap|wraps)\b/.test(signalText)) {
    return "hands";
  }

  if (/\b(boot|shoe|sandals|feet|footwear)\b/.test(signalText)) {
    return "feet";
  }

  if (/\b(bracer|vambrace|wrist)\b/.test(signalText)) {
    return "bracers";
  }

  if (/\b(amulet|necklace|pendant|neck)\b/.test(signalText)) {
    return "neck";
  }

  if (/\b(armor|plate|mail|leather|robe|garb|body)\b/.test(signalText)) {
    return "body";
  }

  if (/\b(weapon|sword|bow|axe|mace|dagger|staff|club|hammer|spear)\b/.test(signalText)) {
    return fallbackWeaponSlot;
  }

  return null;
}

export function classifyInventoryItem(source: InferenceSource): EquipmentItemClassification {
  const signalText = collectSignalText(source);
  const rarity =
    toStringValue(source.compendiumRaw?.rarity) ??
    (isRecord(source.compendiumRaw?.taxonomy) ? toStringValue(source.compendiumRaw.taxonomy.rarity) : null);
  const typeLabel =
    toStringValue(source.compendiumRaw?.type) ??
    (isRecord(source.compendiumRaw?.taxonomy) ? toStringValue(source.compendiumRaw.taxonomy.type) : null);
  const isShield = /\b(shield|buckler)\b/.test(signalText);
  const category: EquipmentItemClassification["category"] = /\b(weapon|sword|bow|axe|mace|dagger|staff|club|hammer|spear)\b/.test(
    signalText
  )
    ? "weapons"
    : /\b(armor|shield|plate|mail|robe|body)\b/.test(signalText)
      ? "armor"
      : /\b(ring|amulet|necklace|cloak|cape|boot|shoe|glove|gauntlet|bracer|helm|hat|head)\b/.test(signalText)
        ? "wearables"
        : /\b(potion|scroll|food|rations|consumable)\b/.test(signalText)
          ? "consumables"
          : "misc";

  const weaponHandedness = inferHandedness(signalText, source.compendiumRaw);
  const defaultWeaponSlot: EquipmentSlotHint = isShield ? "offHand" : "mainHand";
  const equipSlotHint = inferSlotHint(signalText, defaultWeaponSlot);
  const equippable = Boolean(equipSlotHint) || category === "weapons" || category === "armor" || category === "wearables";

  return {
    category,
    equippable,
    equipSlotHint,
    weaponHandedness,
    isShield,
    rarity,
    typeLabel
  };
}
