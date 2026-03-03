import type { AbilityScores } from "@/types/player";

export interface LevelingHitDiceState {
  dieType: string | null;
  total: number | null;
  used: number | null;
}

export interface LevelingResolvedPaths {
  playerDocPath: string;
  sheetDocPath: string;
  totalLevelPath: string | null;
  classLevelPath: string | null;
  classIdPath: string | null;
  subclassPath: string | null;
  abilitiesPath: string | null;
  abilityKeyPaths: Record<keyof AbilityScores, string | null>;
  abilityModsPath: string | null;
  hpMaxPath: string | null;
  hpCurrentPath: string | null;
  hitDicePath: string | null;
  featuresPath: string | null;
  featsPath: string | null;
  epicBoonsPath: string | null;
  spellsPath: string | null;
  invocationsPath: string | null;
  pendingSelectionsPath: string | null;
  historyCollectionPath: string;
  lockPath: string;
}

export interface NormalizedPlayerCore {
  campaignId: string;
  playerId: string;
  classId: string | null;
  subclassId: string | null;
  totalLevel: number | null;
  classLevels: Record<string, number>;
  abilities: AbilityScores;
  hpMax: number | null;
  hpCurrent: number | null;
  hitDice: LevelingHitDiceState;
  features: Record<string, unknown>[];
  feats: Record<string, unknown>[];
  epicBoons: Record<string, unknown>[];
  spells: Record<string, unknown>[];
  invocations: Record<string, unknown>[];
  pendingSelections: unknown[];
  missingRequiredMappings: string[];
  unmappedPaths: string[];
  resolvedPaths: LevelingResolvedPaths;
}

export interface LevelUpComputation {
  previousLevel: number;
  nextLevel: number;
  classId: string;
  conModifier: number;
  hitDieFaces: number;
  hitDieLabel: string;
  hpGain: number;
  nextHpMax: number;
  nextHpCurrent: number;
  nextClassLevels: Record<string, number>;
  nextHitDice: LevelingHitDiceState;
  pendingSelections: unknown[];
  gatingIssues: string[];
  maxLevelCap: number;
}

export interface LevelingPreview {
  canLevel: boolean;
  missingRequiredMappings: string[];
  unmappedPaths: string[];
  maxLevelCap: number;
  currentLevel: number | null;
  nextLevel: number | null;
  classId: string | null;
  subclassId: string | null;
  hitDie: string | null;
  hpGain: number | null;
  conModifier: number | null;
  resolvedPaths: LevelingResolvedPaths;
}

export interface LevelHistoryEntry {
  id: string;
  createdAt: string | null;
  createdByUid: string | null;
  playerId: string;
  classId: string;
  fromLevel: number;
  toLevel: number;
  hpGain: number;
  hitDie: string;
  note: string;
  mapping: {
    totalLevelPath: string | null;
    classLevelPath: string | null;
    hpMaxPath: string | null;
    hpCurrentPath: string | null;
    hitDicePath: string | null;
    pendingSelectionsPath: string | null;
    lockPath: string;
  };
}

export interface LevelUpResult {
  txId: string;
  previousLevel: number;
  nextLevel: number;
  hpGain: number;
  hitDie: string;
  currentHp: number;
  maxHp: number;
  pendingSelectionsAdded: number;
}
