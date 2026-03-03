"use client";

import type {
  AssignablePlayerOption,
  Campaign,
  Player,
  PlayerAdvancementState,
  PlayerBuildMetaState,
  PlayerEquipmentState,
  PlayerFeaturesState,
  PlayerGrantEntry,
  PlayerGrantsState,
  PlayerInventoryStack,
  PlayerInventoryState,
  PlayerProficienciesState,
  PlayerResourceState,
  PlayerSpellbookState,
  PlayerVitals,
  ScenarioState
} from "@/types";
import { normalizeCurrencyFields } from "@/lib/currency";
import { getFirebaseClientApp } from "@/lib/firebase/client";
import { resolveStorageUrl } from "@/lib/firebase/storage";
import { emptyAbilityScores, isRecord, readableId, toIsoString, toNumber, toStringValue } from "@/lib/utils";

interface SnapshotLike {
  id: string;
  data(): Record<string, unknown>;
}

async function loadFirestoreModule() {
  return import("firebase/firestore");
}

function mapCampaign(snapshot: SnapshotLike): Campaign {
  const data = snapshot.data();

  return {
    id: snapshot.id,
    name: toStringValue(data.name) ?? snapshot.id,
    status: toStringValue(data.status),
    schemaVersion: toNumber(data.schemaVersion),
    createdAt: toIsoString(data.createdAt),
    updatedAt: toIsoString(data.updatedAt),
    dmNotes: toStringValue(data.dmNotes)
  };
}

function mapAbilityScores(source: Record<string, unknown> | null | undefined) {
  if (!source) {
    return emptyAbilityScores();
  }

  return {
    str: toNumber(source.str),
    dex: toNumber(source.dex),
    con: toNumber(source.con),
    int: toNumber(source.int),
    wis: toNumber(source.wis),
    cha: toNumber(source.cha)
  };
}

function mapStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => toStringValue(item))
    .filter((item): item is string => Boolean(item));
}

function mapClassLevels(source: Record<string, unknown> | null | undefined) {
  if (!source) {
    return {};
  }

  return Object.entries(source).reduce<Record<string, number | null>>((accumulator, [key, value]) => {
    accumulator[key] = toNumber(value);
    return accumulator;
  }, {});
}

function mapAdvancement(source: Record<string, unknown> | null | undefined): PlayerAdvancementState | null {
  if (!source) {
    return null;
  }

  return {
    mode: toStringValue(source.mode),
    xpEnabled: typeof source.xpEnabled === "boolean" ? source.xpEnabled : null,
    xp: toNumber(source.xp)
  };
}

function mapInventoryStacks(value: unknown): PlayerInventoryStack[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is Record<string, unknown> => isRecord(item))
    .map((item) => ({
      itemId: toStringValue(item.itemId),
      qty: toNumber(item.qty),
      equipped: item.equipped === true,
      attuned: item.attuned === true,
      sourceType: toStringValue(item.sourceType),
      sourceId: toStringValue(item.sourceId),
      grantedAtLevel: toNumber(item.grantedAtLevel),
      containerTag: toStringValue(item.containerTag)
    }));
}

function mapInventory(
  playerInventory: Record<string, unknown> | null | undefined,
  sheetInventory: Record<string, unknown> | null | undefined
): PlayerInventoryState {
  return {
    stacks: mapInventoryStacks(playerInventory?.stacks),
    sheetItemIds: mapStringArray(sheetInventory?.itemIds)
  };
}

function mapGrantEntries(value: unknown): PlayerGrantEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is Record<string, unknown> => isRecord(item))
    .map((item) => ({
      refId: toStringValue(item.refId),
      name: toStringValue(item.name),
      sourceType: toStringValue(item.sourceType),
      sourceId: toStringValue(item.sourceId),
      grantedAtLevel: toNumber(item.grantedAtLevel),
      choiceGroupId: toStringValue(item.choiceGroupId),
      isCantrip: typeof item.isCantrip === "boolean" ? item.isCantrip : undefined,
      prepared: typeof item.prepared === "boolean" ? item.prepared : undefined
    }));
}

function mapGrants(source: Record<string, unknown> | null | undefined): PlayerGrantsState {
  return {
    traits: mapGrantEntries(source?.traits),
    features: mapGrantEntries(source?.features),
    spells: mapGrantEntries(source?.spells),
    items: mapGrantEntries(source?.items)
  };
}

function mapVitals(
  source: Record<string, unknown> | null | undefined,
  partyMember: Record<string, unknown> | null
): PlayerVitals {
  return {
    hpCurrent: toNumber(source?.hpCurrent) ?? toNumber(partyMember?.hpCurrent),
    hpMax: toNumber(source?.hpMax) ?? toNumber(partyMember?.hpMax),
    tempHp: toNumber(source?.tempHp),
    ac: toNumber(source?.ac) ?? toNumber(partyMember?.ac),
    speed: toNumber(source?.speed) ?? toNumber(partyMember?.speed)
  };
}

function mapEquipment(source: Record<string, unknown> | null | undefined): PlayerEquipmentState {
  const equippedArmorId = source?.equippedArmorId;
  const equippedArmorIds = mapStringArray(equippedArmorId);

  if (!equippedArmorIds.length) {
    const singleArmorId = toStringValue(equippedArmorId);

    if (singleArmorId) {
      equippedArmorIds.push(singleArmorId);
    }
  }

  return {
    equippedWeaponIds: mapStringArray(source?.equippedWeaponIds),
    equippedArmorIds
  };
}

function mapSpellbook(source: Record<string, unknown> | null | undefined): PlayerSpellbookState {
  return {
    knownSpellIds: mapStringArray(source?.knownSpellIds),
    preparedSpellIds: mapStringArray(source?.preparedSpellIds),
    cantripIds: mapStringArray(source?.cantripIds)
  };
}

function mapFeatures(source: Record<string, unknown> | null | undefined): PlayerFeaturesState {
  return {
    featureIds: mapStringArray(source?.featureIds)
  };
}

function mapProficiencies(source: Record<string, unknown> | null | undefined): PlayerProficienciesState | null {
  if (!source) {
    return null;
  }

  const skills = isRecord(source.skills)
    ? Object.entries(source.skills).reduce<Record<string, string>>((accumulator, [key, value]) => {
        const level = toStringValue(value);

        if (level) {
          accumulator[key] = level;
        }

        return accumulator;
      }, {})
    : {};

  return {
    savingThrows: mapStringArray(source.savingThrows),
    skills
  };
}

function mapBuildMeta(source: Record<string, unknown> | null | undefined): PlayerBuildMetaState | null {
  if (!source || !isRecord(source.resolvedBy)) {
    return null;
  }

  return {
    resolvedBy: Object.entries(source.resolvedBy).reduce<Record<string, string>>((accumulator, [key, value]) => {
      const resolved = toStringValue(value);

      if (resolved) {
        accumulator[key] = resolved;
      }

      return accumulator;
    }, {})
  };
}

function mapResources(source: Record<string, unknown> | null | undefined): PlayerResourceState | null {
  if (!source) {
    return null;
  }

  const spellSlots = isRecord(source.spellSlots)
    ? Object.entries(source.spellSlots).reduce<Record<string, { total: number; used: number }>>((accumulator, [key, value]) => {
        if (!isRecord(value)) {
          return accumulator;
        }

        const total = toNumber(value.total);
        const used = toNumber(value.used) ?? 0;

        if (total === null) {
          return accumulator;
        }

        accumulator[key] = { total, used };
        return accumulator;
      }, {})
    : undefined;

  return {
    inspiration: source.inspiration === true,
    concentration: toStringValue(source.concentration),
    spellSlots,
    hitDice: isRecord(source.hitDice)
      ? {
          dieType: toStringValue(source.hitDice.dieType),
          total: toNumber(source.hitDice.total),
          used: toNumber(source.hitDice.used)
        }
      : null,
    deathSaves: isRecord(source.deathSaves)
      ? {
          successes: toNumber(source.deathSaves.successes) ?? 0,
          failures: toNumber(source.deathSaves.failures) ?? 0
        }
      : null,
    currency: isRecord(source.currency) ? normalizeCurrencyFields({ currency: source.currency }) : null
  };
}

function mapPlayerRecord(
  playerId: string,
  playerData: Record<string, unknown> | null,
  sheetData: Record<string, unknown> | null,
  partyMember: Record<string, unknown> | null
): Player {
  const statsMap = partyMember ?? (isRecord(sheetData?.stats) ? (sheetData?.stats as Record<string, unknown>) : null);
  const vitalsMap = isRecord(sheetData?.vitals) ? (sheetData?.vitals as Record<string, unknown>) : null;
  const playerInventory = isRecord(playerData?.inventory) ? (playerData?.inventory as Record<string, unknown>) : null;
  const sheetInventory = isRecord(sheetData?.inventory) ? (sheetData?.inventory as Record<string, unknown>) : null;
  const sheetSpells = isRecord(sheetData?.spells) ? (sheetData?.spells as Record<string, unknown>) : null;
  const sheetFeatures = isRecord(sheetData?.features) ? (sheetData?.features as Record<string, unknown>) : null;
  const sheetEquipment = isRecord(sheetData?.equipment) ? (sheetData?.equipment as Record<string, unknown>) : null;
  const playerGrants = isRecord(playerData?.grants) ? (playerData?.grants as Record<string, unknown>) : null;
  const playerAdvancement = isRecord(playerData?.advancement) ? (playerData?.advancement as Record<string, unknown>) : null;
  const playerBuildMeta = isRecord(playerData?.buildMeta) ? (playerData?.buildMeta as Record<string, unknown>) : null;
  const sheetProficiencies = isRecord(sheetData?.proficiencies) ? (sheetData?.proficiencies as Record<string, unknown>) : null;
  const conditions = mapStringArray(sheetData?.conditions);

  const playerOrder = toNumber(playerData?.partyOrder);
  const playerName = toStringValue(playerData?.name) ?? toStringValue(partyMember?.name);
  const classId = toStringValue(playerData?.classId) ?? toStringValue(partyMember?.classId);
  const className = toStringValue(playerData?.classKey) ?? readableId(classId);
  const raceId = toStringValue(playerData?.speciesId) ?? toStringValue(partyMember?.speciesId);
  const raceName = toStringValue(playerData?.speciesKey) ?? readableId(raceId);
  const backgroundId = toStringValue(playerData?.backgroundId);
  const backgroundName = toStringValue(playerData?.backgroundKey) ?? readableId(backgroundId);
  const portraitStoragePath = toStringValue(playerData?.portraitPath) ?? toStringValue(partyMember?.portraitPath);
  const vitals = mapVitals(vitalsMap, partyMember);

  return {
    id: playerId,
    playerId,
    partyOrder: playerOrder,
    active: playerData?.active !== false,
    name: playerName,
    raceId,
    raceName,
    classId,
    className,
    backgroundId,
    backgroundName,
    level: toNumber(playerData?.level) ?? toNumber(partyMember?.level),
    classLevels: mapClassLevels(isRecord(playerData?.classLevels) ? (playerData?.classLevels as Record<string, unknown>) : null),
    advancement: mapAdvancement(playerAdvancement),
    vitals,
    abilityScores: mapAbilityScores(statsMap),
    inventory: mapInventory(playerInventory, sheetInventory),
    grants: mapGrants(playerGrants),
    equipment: mapEquipment(sheetEquipment),
    spellbook: mapSpellbook(sheetSpells),
    features: mapFeatures(sheetFeatures),
    proficiencies: mapProficiencies(sheetProficiencies),
    portraitStoragePath,
    portraitUrl: null,
    notes: toStringValue(sheetData?.notes),
    conditions,
    resources: mapResources(isRecord(sheetData?.resources) ? (sheetData?.resources as Record<string, unknown>) : null),
    buildChoices: Array.isArray(playerData?.buildChoices) ? playerData?.buildChoices : [],
    pendingChoicePrompts: Array.isArray(playerData?.pendingChoicePrompts) ? playerData?.pendingChoicePrompts : [],
    buildMeta: mapBuildMeta(playerBuildMeta),
    schemaVersion: toNumber(sheetData?.schemaVersion),
    updatedAt: toIsoString(sheetData?.updatedAt),
    hpCurrent: vitals.hpCurrent,
    hpMax: vitals.hpMax,
    ac: vitals.ac,
    speed: vitals.speed,
    tempHp: vitals.tempHp
  };
}

function sortPlayers(players: Player[]): Player[] {
  return [...players].sort((left, right) => {
    const leftOrder = typeof left.partyOrder === "number" ? left.partyOrder : Number.MAX_SAFE_INTEGER;
    const rightOrder = typeof right.partyOrder === "number" ? right.partyOrder : Number.MAX_SAFE_INTEGER;

    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    return (left.name ?? "").localeCompare(right.name ?? "");
  });
}

async function enrichPortraits(players: Player[]): Promise<Player[]> {
  const settled = await Promise.all(
    players.map(async (player) => ({
      ...player,
      portraitUrl: await resolveStorageUrl(player.portraitStoragePath)
    }))
  );

  return sortPlayers(settled);
}

function sortPlayerOptions(players: AssignablePlayerOption[]): AssignablePlayerOption[] {
  return [...players].sort((left, right) => {
    const leftOrder = typeof left.partyOrder === "number" ? left.partyOrder : Number.MAX_SAFE_INTEGER;
    const rightOrder = typeof right.partyOrder === "number" ? right.partyOrder : Number.MAX_SAFE_INTEGER;

    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    return (left.name ?? "").localeCompare(right.name ?? "");
  });
}

export async function listCampaigns(): Promise<Campaign[]> {
  const { collection, getDocs, getFirestore } = await loadFirestoreModule();
  const db = getFirestore(getFirebaseClientApp());
  const snapshot = await getDocs(collection(db, "campaigns"));
  const campaigns = snapshot.docs.map(mapCampaign);
  return campaigns.sort((left, right) => left.name.localeCompare(right.name));
}

export async function getPartyOverview(campaignId: string): Promise<Player[]> {
  const { collection, doc, getDoc, getDocs, getFirestore } = await loadFirestoreModule();
  const db = getFirestore(getFirebaseClientApp());
  const playersRef = collection(db, "campaigns", campaignId, "players");
  const partyRef = doc(db, "campaigns", campaignId, "party", "summary");
  const sheetsRef = collection(db, "campaigns", campaignId, "sheets");

  const [playerSnapshot, partySnapshot] = await Promise.all([getDocs(playersRef), getDoc(partyRef)]);
  const partyMembers = partySnapshot.exists() && Array.isArray(partySnapshot.data().members)
    ? (partySnapshot.data().members as unknown[])
    : [];

  const partyMap = partyMembers.reduce<Map<string, Record<string, unknown>>>((accumulator, member) => {
    if (!isRecord(member)) {
      return accumulator;
    }

    const playerId = toStringValue(member.playerId);
    if (playerId) {
      accumulator.set(playerId, member);
    }

    return accumulator;
  }, new Map());

  const sheetsMap = new Map<string, Record<string, unknown>>();

  if (!partyMap.size) {
    const sheetSnapshot = await getDocs(sheetsRef);
    sheetSnapshot.forEach((sheet) => {
      sheetsMap.set(sheet.id, sheet.data());
    });
  }

  const players = playerSnapshot.docs.map((snapshot) =>
    mapPlayerRecord(
      snapshot.id,
      snapshot.data(),
      sheetsMap.get(snapshot.id) ?? null,
      partyMap.get(snapshot.id) ?? null
    )
  );

  return enrichPortraits(players);
}

export async function getPlayerDetail(campaignId: string, playerId: string): Promise<Player | null> {
  const { doc, getDoc, getFirestore } = await loadFirestoreModule();
  const db = getFirestore(getFirebaseClientApp());

  const [playerSnapshot, sheetSnapshot, partySnapshot] = await Promise.all([
    getDoc(doc(db, "campaigns", campaignId, "players", playerId)),
    getDoc(doc(db, "campaigns", campaignId, "sheets", playerId)),
    getDoc(doc(db, "campaigns", campaignId, "party", "summary"))
  ]);

  if (!playerSnapshot.exists() && !sheetSnapshot.exists()) {
    return null;
  }

  const partyMembers = partySnapshot.exists() && Array.isArray(partySnapshot.data().members)
    ? (partySnapshot.data().members as unknown[])
    : [];

  const partyMember =
    partyMembers.find(
      (member) => isRecord(member) && toStringValue(member.playerId) === playerId
    ) ?? null;

  const player = mapPlayerRecord(
    playerId,
    playerSnapshot.exists() ? playerSnapshot.data() : null,
    sheetSnapshot.exists() ? sheetSnapshot.data() : null,
    isRecord(partyMember) ? partyMember : null
  );

  const portraitUrl = await resolveStorageUrl(player.portraitStoragePath);
  return { ...player, portraitUrl };
}

export async function listAssignablePlayers(campaignId: string): Promise<AssignablePlayerOption[]> {
  const { collection, getDocs, getFirestore } = await loadFirestoreModule();
  const db = getFirestore(getFirebaseClientApp());
  const snapshot = await getDocs(collection(db, "campaigns", campaignId, "players"));

  const players = snapshot.docs.map((document) => {
    const data = document.data();

    return {
      id: document.id,
      name: toStringValue(data.name),
      partyOrder: toNumber(data.partyOrder),
      active: data.active !== false
    };
  });

  return sortPlayerOptions(players);
}

export async function getScenarioState(campaignId: string): Promise<ScenarioState | null> {
  const { doc, getDoc, getFirestore } = await loadFirestoreModule();
  const db = getFirestore(getFirebaseClientApp());
  const snapshot = await getDoc(doc(db, "campaigns", campaignId, "scenario", "current"));

  if (!snapshot.exists()) {
    return null;
  }

  const data = snapshot.data();
  const listItems = isRecord(data.list) && Array.isArray(data.list.items)
    ? data.list.items
        .filter((item): item is Record<string, unknown> => isRecord(item))
        .map((item) => ({
          label: toStringValue(item.label) ?? "Untitled",
          subtext: toStringValue(item.subtext)
        }))
    : [];

  return {
    mode: toStringValue(data.mode),
    title: toStringValue(data.title),
    text: toStringValue(data.text),
    imagePath: toStringValue(data.imagePath),
    listItems,
    updatedAt: toIsoString(data.updatedAt)
  };
}
