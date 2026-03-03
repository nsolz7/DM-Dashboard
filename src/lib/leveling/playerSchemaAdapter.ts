import type {
  LevelHistoryEntry,
  LevelUpComputation,
  LevelingResolvedPaths,
  NormalizedPlayerCore
} from "@/types/leveling";
import type { AbilityScores } from "@/types/player";
import { emptyAbilityScores, isRecord, toNumber, toStringValue } from "@/lib/utils";

interface ReadPlayerCoreInput {
  campaignId: string;
  playerId: string;
  playerData: Record<string, unknown> | null;
  sheetData: Record<string, unknown> | null;
}

interface BuildPlayerUpdatePatchInput {
  core: NormalizedPlayerCore;
  computation: LevelUpComputation;
  historyId: string;
  createdByUid: string | null;
  timestampValue: unknown;
}

interface BuildLevelHistoryRecordInput {
  core: NormalizedPlayerCore;
  computation: LevelUpComputation;
  createdByUid: string | null;
  note: string;
  timestampValue: unknown;
}

interface BuildLevelHistoryRecordOutput extends Omit<LevelHistoryEntry, "id" | "createdAt"> {
  createdAt: unknown;
}

type PathSegments = string[];

function pathLabel(path: PathSegments | null): string | null {
  return path ? path.join(".") : null;
}

function getNestedValue(source: Record<string, unknown> | null, path: PathSegments): unknown {
  if (!source) {
    return null;
  }

  const exactKey = path.join(".");

  if (exactKey in source) {
    return source[exactKey];
  }

  let current: unknown = source;

  for (const segment of path) {
    if (!isRecord(current) || !(segment in current)) {
      return null;
    }

    current = current[segment];
  }

  return current;
}

function hasNestedPath(source: Record<string, unknown> | null, path: PathSegments): boolean {
  if (!source) {
    return false;
  }

  const exactKey = path.join(".");

  if (exactKey in source) {
    return true;
  }

  let current: unknown = source;

  for (const segment of path) {
    if (!isRecord(current) || !(segment in current)) {
      return false;
    }

    current = current[segment];
  }

  return true;
}

function detectPath(source: Record<string, unknown> | null, candidates: PathSegments[]): PathSegments | null {
  return candidates.find((candidate) => hasNestedPath(source, candidate)) ?? null;
}

function setNestedValue(target: Record<string, unknown>, path: PathSegments | null, value: unknown): void {
  if (!path?.length) {
    return;
  }

  let cursor = target;

  for (let index = 0; index < path.length - 1; index += 1) {
    const segment = path[index];
    const nextValue = cursor[segment];

    if (!isRecord(nextValue)) {
      cursor[segment] = {};
    }

    cursor = cursor[segment] as Record<string, unknown>;
  }

  cursor[path[path.length - 1]] = value;
}

function mapAbilityScores(source: Record<string, unknown> | null, basePath: PathSegments | null): {
  values: AbilityScores;
  keyPaths: Record<keyof AbilityScores, string | null>;
} {
  const empty = emptyAbilityScores();

  if (!source || !basePath) {
    return {
      values: empty,
      keyPaths: {
        str: null,
        dex: null,
        con: null,
        int: null,
        wis: null,
        cha: null
      }
    };
  }

  const values = {
    str: toNumber(source.str),
    dex: toNumber(source.dex),
    con: toNumber(source.con),
    int: toNumber(source.int),
    wis: toNumber(source.wis),
    cha: toNumber(source.cha)
  };

  return {
    values,
    keyPaths: {
      str: `${basePath.join(".")}.str`,
      dex: `${basePath.join(".")}.dex`,
      con: `${basePath.join(".")}.con`,
      int: `${basePath.join(".")}.int`,
      wis: `${basePath.join(".")}.wis`,
      cha: `${basePath.join(".")}.cha`
    }
  };
}

function mapClassLevels(source: unknown): Record<string, number> {
  if (!isRecord(source)) {
    return {};
  }

  return Object.entries(source).reduce<Record<string, number>>((accumulator, [key, value]) => {
    const numeric = toNumber(value);

    if (numeric !== null) {
      accumulator[key] = numeric;
    }

    return accumulator;
  }, {});
}

function mapRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is Record<string, unknown> => isRecord(entry));
}

function cloneUnknownArray(value: unknown[]): unknown[] {
  return value.map((entry) => {
    if (Array.isArray(entry)) {
      return cloneUnknownArray(entry);
    }

    if (isRecord(entry)) {
      return clonePlainRecord(entry);
    }

    return entry;
  });
}

function clonePlainRecord(source: Record<string, unknown>): Record<string, unknown> {
  return Object.entries(source).reduce<Record<string, unknown>>((accumulator, [key, value]) => {
    if (Array.isArray(value)) {
      accumulator[key] = cloneUnknownArray(value);
      return accumulator;
    }

    if (isRecord(value)) {
      accumulator[key] = clonePlainRecord(value);
      return accumulator;
    }

    accumulator[key] = value;
    return accumulator;
  }, {});
}

function buildMissingRequiredMappings(
  classIdPath: PathSegments | null,
  classId: string | null,
  totalLevelPath: PathSegments | null,
  totalLevel: number | null,
  abilityBasePath: PathSegments | null,
  abilityScores: AbilityScores,
  hpMaxPath: PathSegments | null,
  hpMax: number | null,
  hpCurrentPath: PathSegments | null,
  hpCurrent: number | null
): string[] {
  const missing: string[] = [];

  if (!classIdPath || !classId) {
    missing.push(`classId (expected ${pathLabel(classIdPath) ?? "classId"})`);
  }

  if (!totalLevelPath || totalLevel === null) {
    missing.push(`totalLevel (expected ${pathLabel(totalLevelPath) ?? "level"})`);
  }

  if (!abilityBasePath) {
    missing.push("abilities (expected stats)");
  }

  (Object.entries(abilityScores) as Array<[keyof AbilityScores, number | null]>).forEach(([key, value]) => {
    if (value === null) {
      missing.push(`abilities.${key} (expected ${abilityBasePath ? `${abilityBasePath.join(".")}.${key}` : `stats.${key}`})`);
    }
  });

  if (!hpMaxPath || hpMax === null) {
    missing.push(`hpMax (expected ${pathLabel(hpMaxPath) ?? "vitals.hpMax"})`);
  }

  if (!hpCurrentPath || hpCurrent === null) {
    missing.push(`hpCurrent (expected ${pathLabel(hpCurrentPath) ?? "vitals.hpCurrent"})`);
  }

  return missing;
}

export function readPlayerCore({ campaignId, playerId, playerData, sheetData }: ReadPlayerCoreInput): NormalizedPlayerCore {
  const totalLevelPath = detectPath(playerData, [["level"], ["level", "total"], ["stats", "level"], ["character", "level"]]);
  const classLevelPath = detectPath(playerData, [["classLevels"], ["level", "byClass"], ["class", "levels"]]);
  const classIdPath = detectPath(playerData, [["classId"], ["class", "id"], ["build", "classId"]]);
  const subclassPath = detectPath(playerData, [["subclassId"], ["subclass", "id"], ["build", "subclassId"]]);
  const abilityBasePath = detectPath(sheetData, [["stats"], ["abilityScores"], ["abilities"]]);
  const abilityModsPath = detectPath(sheetData, [["stats", "mods"], ["abilityModifiers"]]);
  const hpMaxPath = detectPath(sheetData, [["vitals", "hpMax"], ["hitPoints", "max"], ["hp", "max"]]);
  const hpCurrentPath = detectPath(sheetData, [["vitals", "hpCurrent"], ["hitPoints", "current"], ["hp", "current"]]);
  const hitDicePath = detectPath(sheetData, [["resources", "hitDice"], ["hitDice"]]);
  const featuresPath = detectPath(playerData, [["grants", "features"], ["features"]]);
  const featsPath = detectPath(playerData, [["grants", "feats"], ["feats"]]);
  const epicBoonsPath = detectPath(playerData, [["grants", "epicBoons"], ["epicBoons"]]);
  const spellsPath = detectPath(playerData, [["grants", "spells"], ["spells"]]);
  const invocationsPath = detectPath(playerData, [["grants", "invocations"], ["invocations"]]);
  const pendingSelectionsPath = detectPath(playerData, [["pendingChoicePrompts"], ["pendingSelections"]]);

  const abilitySource = abilityBasePath ? (getNestedValue(sheetData, abilityBasePath) as Record<string, unknown> | null) : null;
  const abilities = mapAbilityScores(abilitySource, abilityBasePath);
  const hitDiceSource = hitDicePath ? getNestedValue(sheetData, hitDicePath) : null;

  const resolvedPaths: LevelingResolvedPaths = {
    playerDocPath: `campaigns/${campaignId}/players/${playerId}`,
    sheetDocPath: `campaigns/${campaignId}/sheets/${playerId}`,
    totalLevelPath: pathLabel(totalLevelPath),
    classLevelPath: pathLabel(classLevelPath),
    classIdPath: pathLabel(classIdPath),
    subclassPath: pathLabel(subclassPath),
    abilitiesPath: pathLabel(abilityBasePath),
    abilityKeyPaths: abilities.keyPaths,
    abilityModsPath: pathLabel(abilityModsPath),
    hpMaxPath: pathLabel(hpMaxPath),
    hpCurrentPath: pathLabel(hpCurrentPath),
    hitDicePath: pathLabel(hitDicePath),
    featuresPath: pathLabel(featuresPath),
    featsPath: pathLabel(featsPath),
    epicBoonsPath: pathLabel(epicBoonsPath),
    spellsPath: pathLabel(spellsPath),
    invocationsPath: pathLabel(invocationsPath),
    pendingSelectionsPath: pathLabel(pendingSelectionsPath),
    historyCollectionPath: `campaigns/${campaignId}/players/${playerId}/level_history`,
    lockPath: "levelUpLock"
  };

  const classId = classIdPath ? toStringValue(getNestedValue(playerData, classIdPath)) : null;
  const subclassId = subclassPath ? toStringValue(getNestedValue(playerData, subclassPath)) : null;
  const totalLevel = totalLevelPath ? toNumber(getNestedValue(playerData, totalLevelPath)) : null;
  const hpMax = hpMaxPath ? toNumber(getNestedValue(sheetData, hpMaxPath)) : null;
  const hpCurrent = hpCurrentPath ? toNumber(getNestedValue(sheetData, hpCurrentPath)) : null;
  const pendingSelectionsValue = pendingSelectionsPath ? getNestedValue(playerData, pendingSelectionsPath) : null;

  const missingRequiredMappings = buildMissingRequiredMappings(
    classIdPath,
    classId,
    totalLevelPath,
    totalLevel,
    abilityBasePath,
    abilities.values,
    hpMaxPath,
    hpMax,
    hpCurrentPath,
    hpCurrent
  );

  const optionalUnmapped = [
    !subclassPath ? "subclassId" : null,
    !featuresPath ? "grants.features" : null,
    !featsPath ? "grants.feats" : null,
    !epicBoonsPath ? "grants.epicBoons" : null,
    !spellsPath ? "grants.spells" : null,
    !invocationsPath ? "grants.invocations" : null,
    !pendingSelectionsPath ? "pendingChoicePrompts" : null,
    !hitDicePath ? "resources.hitDice" : null
  ].filter((value): value is string => Boolean(value));

  return {
    campaignId,
    playerId,
    classId,
    subclassId,
    totalLevel,
    classLevels: mapClassLevels(classLevelPath ? getNestedValue(playerData, classLevelPath) : null),
    abilities: abilities.values,
    hpMax,
    hpCurrent,
    hitDice: {
      dieType: isRecord(hitDiceSource) ? toStringValue(hitDiceSource.dieType) : null,
      total: isRecord(hitDiceSource) ? toNumber(hitDiceSource.total) : null,
      used: isRecord(hitDiceSource) ? toNumber(hitDiceSource.used) : null
    },
    features: mapRecordArray(featuresPath ? getNestedValue(playerData, featuresPath) : null),
    feats: mapRecordArray(featsPath ? getNestedValue(playerData, featsPath) : null),
    epicBoons: mapRecordArray(epicBoonsPath ? getNestedValue(playerData, epicBoonsPath) : null),
    spells: mapRecordArray(spellsPath ? getNestedValue(playerData, spellsPath) : null),
    invocations: mapRecordArray(invocationsPath ? getNestedValue(playerData, invocationsPath) : null),
    pendingSelections: Array.isArray(pendingSelectionsValue)
      ? cloneUnknownArray(pendingSelectionsValue)
      : [],
    missingRequiredMappings,
    unmappedPaths: optionalUnmapped,
    resolvedPaths
  };
}

export function buildPlayerUpdatePatch({
  core,
  computation,
  historyId,
  createdByUid,
  timestampValue
}: BuildPlayerUpdatePatchInput): {
  playerPatch: Record<string, unknown>;
  sheetPatch: Record<string, unknown>;
} {
  const playerPatch: Record<string, unknown> = {};
  const sheetPatch: Record<string, unknown> = {};

  setNestedValue(playerPatch, core.resolvedPaths.totalLevelPath?.split(".") ?? null, computation.nextLevel);
  setNestedValue(playerPatch, core.resolvedPaths.classLevelPath?.split(".") ?? null, computation.nextClassLevels);
  setNestedValue(sheetPatch, core.resolvedPaths.hpMaxPath?.split(".") ?? null, computation.nextHpMax);
  setNestedValue(sheetPatch, core.resolvedPaths.hpCurrentPath?.split(".") ?? null, computation.nextHpCurrent);
  setNestedValue(sheetPatch, core.resolvedPaths.hitDicePath?.split(".") ?? null, {
    dieType: computation.nextHitDice.dieType,
    total: computation.nextHitDice.total,
    used: computation.nextHitDice.used
  });

  if (core.resolvedPaths.pendingSelectionsPath) {
    setNestedValue(playerPatch, core.resolvedPaths.pendingSelectionsPath.split("."), computation.pendingSelections);
  }

  setNestedValue(playerPatch, core.resolvedPaths.lockPath.split("."), {
    inProgress: false,
    lastRunAt: timestampValue,
    lastRunByUid: createdByUid ?? "dm-web",
    lastHistoryId: historyId,
    targetLevel: computation.nextLevel
  });

  return {
    playerPatch,
    sheetPatch
  };
}

export function buildLevelHistoryRecord({
  core,
  computation,
  createdByUid,
  note,
  timestampValue
}: BuildLevelHistoryRecordInput): BuildLevelHistoryRecordOutput {
  return {
    createdAt: timestampValue,
    createdByUid: createdByUid ?? "dm-web",
    playerId: core.playerId,
    classId: computation.classId,
    fromLevel: computation.previousLevel,
    toLevel: computation.nextLevel,
    hpGain: computation.hpGain,
    hitDie: computation.hitDieLabel,
    note,
    mapping: {
      totalLevelPath: core.resolvedPaths.totalLevelPath,
      classLevelPath: core.resolvedPaths.classLevelPath,
      hpMaxPath: core.resolvedPaths.hpMaxPath,
      hpCurrentPath: core.resolvedPaths.hpCurrentPath,
      hitDicePath: core.resolvedPaths.hitDicePath,
      pendingSelectionsPath: core.resolvedPaths.pendingSelectionsPath,
      lockPath: core.resolvedPaths.lockPath
    }
  };
}
