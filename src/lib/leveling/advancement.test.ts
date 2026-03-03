import test from "node:test";
import assert from "node:assert/strict";

import { planNextLevelUp } from "@/src/lib/leveling/advancement";
import { readPlayerCore } from "@/src/lib/leveling/playerSchemaAdapter";

test("readPlayerCore maps the current Septagon player + sheet schema", () => {
  const core = readPlayerCore({
    campaignId: "camp_test_001",
    playerId: "p5",
    playerData: {
      classId: "class.paladin-b2ecc2be",
      level: 1,
      classLevels: {
        "class.paladin-b2ecc2be": 1
      },
      grants: {
        features: []
      },
      pendingChoicePrompts: []
    },
    sheetData: {
      stats: {
        str: 16,
        dex: 10,
        con: 14,
        int: 8,
        wis: 12,
        cha: 15
      },
      vitals: {
        hpCurrent: 12,
        hpMax: 12
      },
      resources: {
        hitDice: {
          dieType: "d10",
          total: 1,
          used: 1
        }
      }
    }
  });

  assert.equal(core.resolvedPaths.totalLevelPath, "level");
  assert.equal(core.resolvedPaths.classLevelPath, "classLevels");
  assert.equal(core.resolvedPaths.classIdPath, "classId");
  assert.equal(core.resolvedPaths.abilitiesPath, "stats");
  assert.equal(core.resolvedPaths.hpMaxPath, "vitals.hpMax");
  assert.equal(core.resolvedPaths.hpCurrentPath, "vitals.hpCurrent");
  assert.equal(core.resolvedPaths.hitDicePath, "resources.hitDice");
  assert.deepEqual(core.missingRequiredMappings, []);
});

test("planNextLevelUp applies average hp gain and increments class level + hit dice", () => {
  const core = readPlayerCore({
    campaignId: "camp_test_001",
    playerId: "p5",
    playerData: {
      classId: "class.paladin-b2ecc2be",
      level: 1,
      classLevels: {
        "class.paladin-b2ecc2be": 1
      },
      pendingChoicePrompts: []
    },
    sheetData: {
      stats: {
        str: 16,
        dex: 10,
        con: 14,
        int: 8,
        wis: 12,
        cha: 15
      },
      vitals: {
        hpCurrent: 12,
        hpMax: 12
      },
      resources: {
        hitDice: {
          dieType: "d10",
          total: 1,
          used: 1
        }
      }
    }
  });

  const computation = planNextLevelUp(core);

  assert.equal(computation.gatingIssues.length, 0);
  assert.equal(computation.nextLevel, 2);
  assert.equal(computation.hitDieLabel, "d10");
  assert.equal(computation.hpGain, 8);
  assert.equal(computation.nextHpMax, 20);
  assert.equal(computation.nextHpCurrent, 20);
  assert.equal(computation.nextClassLevels["class.paladin-b2ecc2be"], 2);
  assert.equal(computation.nextHitDice.total, 2);
  assert.equal(computation.nextHitDice.used, 1);
});

test("planNextLevelUp blocks when required mappings are missing", () => {
  const core = readPlayerCore({
    campaignId: "camp_test_001",
    playerId: "p1",
    playerData: {
      pendingChoicePrompts: []
    },
    sheetData: {
      stats: {
        str: 10,
        dex: 11,
        con: 12
      }
    }
  });

  const computation = planNextLevelUp(core);

  assert.ok(computation.gatingIssues.includes("classId (expected classId)"));
  assert.ok(computation.gatingIssues.includes("totalLevel (expected level)"));
  assert.ok(computation.gatingIssues.includes("abilities.int (expected stats.int)"));
  assert.ok(computation.gatingIssues.includes("hpMax (expected vitals.hpMax)"));
});
