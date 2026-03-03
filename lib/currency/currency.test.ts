import test from "node:test";
import assert from "node:assert/strict";

import {
  applyDeltaWithMakeChange,
  canonicalizeCurrencyFromCopper,
  currencyToCopperValue,
  normalizeCurrencyFields,
  splitAmount
} from "@/lib/currency";

test("normalizeCurrencyFields reads the existing sheet resources.currency shape", () => {
  const value = normalizeCurrencyFields({
    resources: {
      currency: {
        cp: 12,
        sp: 3,
        ep: 1,
        gp: 4,
        pp: 0
      }
    }
  });

  assert.deepEqual(value, {
    cp: 12,
    sp: 3,
    ep: 1,
    gp: 4,
    pp: 0
  });
});

test("applyDeltaWithMakeChange lets a 1 gp charge consume 10 sp", () => {
  const result = applyDeltaWithMakeChange(
    {
      cp: 0,
      sp: 10,
      ep: 0,
      gp: 0,
      pp: 0
    },
    {
      cp: 0,
      sp: 0,
      ep: 0,
      gp: -1,
      pp: 0
    },
    {
      autoMakeChange: true,
      allowNegative: false
    }
  );

  assert.deepEqual(result.newBalance, {
    cp: 0,
    sp: 0,
    ep: 0,
    gp: 0,
    pp: 0
  });
  assert.equal(result.conversionsPerformed.length, 1);
});

test("applyDeltaWithMakeChange makes change only as needed in common low-denomination charges", () => {
  const result = applyDeltaWithMakeChange(
    {
      cp: 0,
      sp: 5,
      ep: 0,
      gp: 1,
      pp: 0
    },
    {
      cp: -1,
      sp: 0,
      ep: 0,
      gp: 0,
      pp: 0
    },
    {
      autoMakeChange: true,
      allowNegative: false
    }
  );

  assert.deepEqual(result.newBalance, {
    cp: 9,
    sp: 4,
    ep: 0,
    gp: 1,
    pp: 0
  });
});

test("applyDeltaWithMakeChange blocks insufficient total funds when negatives are not allowed", () => {
  assert.throws(
    () =>
      applyDeltaWithMakeChange(
        {
          cp: 0,
          sp: 9,
          ep: 0,
          gp: 0,
          pp: 0
        },
        {
          cp: 0,
          sp: 0,
          ep: 0,
          gp: -1,
          pp: 0
        },
        {
          autoMakeChange: true,
          allowNegative: false
        }
      ),
    /Insufficient total funds/
  );
});

test("canonicalizeCurrencyFromCopper keeps negative totals deterministic", () => {
  assert.deepEqual(canonicalizeCurrencyFromCopper(-500), {
    cp: 0,
    sp: 0,
    ep: 0,
    gp: -5,
    pp: 0
  });
});

test("splitAmount preserves total value across an equal split", () => {
  const targets = splitAmount(
    {
      cp: 0,
      sp: 0,
      ep: 0,
      gp: 1,
      pp: 0
    },
    ["p1", "p2", "p3"],
    "equal"
  );

  assert.equal(targets.length, 3);
  assert.equal(targets[0].delta.cp, 4);
  assert.equal(targets[0].delta.sp, 3);
  assert.equal(
    targets.reduce((total, target) => total + currencyToCopperValue(target.delta), 0),
    100
  );
});
