import type { LevelUpComputation, LevelingPreview, NormalizedPlayerCore } from "@/types/leveling";

const CLASS_HIT_DICE: Record<string, number> = {
  artificer: 8,
  barbarian: 12,
  bard: 8,
  cleric: 8,
  druid: 8,
  fighter: 10,
  monk: 8,
  paladin: 10,
  ranger: 10,
  rogue: 8,
  sorcerer: 6,
  warlock: 8,
  wizard: 6
};

const ABILITY_SCORE_IMPROVEMENT_LEVELS = new Set([4, 8, 12, 16, 19]);
export const DEFAULT_MAX_LEVEL_CAP = 20;

function parseDieFaces(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const match = value.trim().toLowerCase().match(/^d(\d+)$/);
  return match ? Number.parseInt(match[1] ?? "", 10) : null;
}

function normalizeClassSlug(classId: string): string {
  const withoutPrefix = classId.startsWith("class.") ? classId.slice("class.".length) : classId;
  return withoutPrefix.replace(/-[a-f0-9]{8}$/i, "").trim().toLowerCase();
}

function resolveHitDieFaces(core: NormalizedPlayerCore): number | null {
  const existingFaces = parseDieFaces(core.hitDice.dieType);

  if (existingFaces) {
    return existingFaces;
  }

  if (!core.classId) {
    return null;
  }

  return CLASS_HIT_DICE[normalizeClassSlug(core.classId)] ?? null;
}

function getConModifier(core: NormalizedPlayerCore): number | null {
  if (typeof core.abilities.con !== "number") {
    return null;
  }

  return Math.floor((core.abilities.con - 10) / 2);
}

function buildPendingSelections(core: NormalizedPlayerCore, nextLevel: number): unknown[] {
  const nextSelections = [...core.pendingSelections];

  if (!core.resolvedPaths.pendingSelectionsPath) {
    return nextSelections;
  }

  const existingPrompt = nextSelections.find((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return false;
    }

    const record = entry as Record<string, unknown>;
    return record.kind === "levelUpReview" && record.level === nextLevel && record.classId === core.classId;
  });

  if (existingPrompt || !core.classId) {
    return nextSelections;
  }

  const isAsiLevel = ABILITY_SCORE_IMPROVEMENT_LEVELS.has(nextLevel);

  nextSelections.push({
    kind: "levelUpReview",
    classId: core.classId,
    level: nextLevel,
    status: "pending",
    requiresManualResolution: true,
    tags: isAsiLevel ? ["level-up", "asi-or-feat"] : ["level-up", "class-features"],
    note: isAsiLevel
      ? "Review ability score improvement / feat selection, new class features, and any spell updates."
      : "Review new class features, subclass progression if applicable, and any spell updates.",
    createdAt: new Date().toISOString()
  });

  return nextSelections;
}

export function getLevelingPreview(
  core: NormalizedPlayerCore,
  maxLevelCap = DEFAULT_MAX_LEVEL_CAP
): LevelingPreview {
  const computation = planNextLevelUp(core, maxLevelCap);

  return {
    canLevel: computation.gatingIssues.length === 0,
    missingRequiredMappings: core.missingRequiredMappings,
    unmappedPaths: core.unmappedPaths,
    maxLevelCap,
    currentLevel: core.totalLevel,
    nextLevel: computation.gatingIssues.length === 0 ? computation.nextLevel : null,
    classId: core.classId,
    subclassId: core.subclassId,
    hitDie: computation.hitDieLabel,
    hpGain: computation.gatingIssues.length === 0 ? computation.hpGain : null,
    conModifier: computation.conModifier,
    resolvedPaths: core.resolvedPaths
  };
}

export function planNextLevelUp(
  core: NormalizedPlayerCore,
  maxLevelCap = DEFAULT_MAX_LEVEL_CAP
): LevelUpComputation {
  const gatingIssues = [...core.missingRequiredMappings];
  const previousLevel = core.totalLevel ?? 0;

  if (previousLevel >= maxLevelCap) {
    gatingIssues.push(`levelCap (${previousLevel}/${maxLevelCap})`);
  }

  if (!core.classId) {
    gatingIssues.push("classId");
  }

  const conModifier = getConModifier(core);

  if (conModifier === null) {
    gatingIssues.push("conModifier");
  }

  const hitDieFaces = resolveHitDieFaces(core);

  if (!hitDieFaces) {
    gatingIssues.push("hitDie");
  }

  const nextLevel = previousLevel + 1;
  const hpGainBase = hitDieFaces ? Math.floor(hitDieFaces / 2) + 1 : 0;
  const hpGain = Math.max(1, hpGainBase + (conModifier ?? 0));
  const nextHpMax = (core.hpMax ?? 0) + hpGain;
  const nextHpCurrent = (core.hpCurrent ?? 0) + hpGain;
  const nextClassLevels = { ...core.classLevels };

  if (core.classId) {
    nextClassLevels[core.classId] = (nextClassLevels[core.classId] ?? previousLevel) + 1;
  }

  const nextHitDice = {
    dieType: hitDieFaces ? `d${hitDieFaces}` : core.hitDice.dieType,
    total: (core.hitDice.total ?? previousLevel) + 1,
    used: core.hitDice.used ?? 0
  };

  return {
    previousLevel,
    nextLevel,
    classId: core.classId ?? "unknown",
    conModifier: conModifier ?? 0,
    hitDieFaces: hitDieFaces ?? 0,
    hitDieLabel: hitDieFaces ? `d${hitDieFaces}` : core.hitDice.dieType ?? "—",
    hpGain,
    nextHpMax,
    nextHpCurrent,
    nextClassLevels,
    nextHitDice,
    pendingSelections: buildPendingSelections(core, nextLevel),
    gatingIssues: Array.from(new Set(gatingIssues)),
    maxLevelCap
  };
}
