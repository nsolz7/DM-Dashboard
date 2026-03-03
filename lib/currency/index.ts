import type { BarterSplitMode, BarterTargetDelta, CurrencyAmount } from "@/types";
import { isRecord, toNumber } from "@/lib/utils";

export const currencyKeys = ["cp", "sp", "ep", "gp", "pp"] as const;

type CurrencyKey = (typeof currencyKeys)[number];

const currencyValueInCopper: Record<CurrencyKey, number> = {
  cp: 1,
  sp: 10,
  ep: 50,
  gp: 100,
  pp: 1000
};

interface CurrencySourceResolution {
  balance: CurrencyAmount;
  fieldPath: string;
}

export interface CurrencyConversionRecord {
  kind: "make_change";
  before: CurrencyAmount;
  after: CurrencyAmount;
  debitValueCp: number;
}

export interface ApplyDeltaOptions {
  autoMakeChange?: boolean;
  allowNegative?: boolean;
}

export interface ApplyDeltaResult {
  newBalance: CurrencyAmount;
  actualDeltaApplied: CurrencyAmount;
  conversionsPerformed: CurrencyConversionRecord[];
}

function emptyCurrency(): CurrencyAmount {
  return {
    cp: 0,
    sp: 0,
    ep: 0,
    gp: 0,
    pp: 0
  };
}

export function emptyCurrencyAmount(): CurrencyAmount {
  return emptyCurrency();
}

export function sanitizeCurrencyAmount(value: Partial<Record<CurrencyKey, unknown>> | CurrencyAmount | null | undefined): CurrencyAmount {
  return {
    cp: toNumber(value?.cp) ?? 0,
    sp: toNumber(value?.sp) ?? 0,
    ep: toNumber(value?.ep) ?? 0,
    gp: toNumber(value?.gp) ?? 0,
    pp: toNumber(value?.pp) ?? 0
  };
}

export function normalizeCurrencyFields(source: Record<string, unknown> | null | undefined): CurrencyAmount {
  return resolveCurrencySource(source).balance;
}

export function resolveCurrencyFieldPath(source: Record<string, unknown> | null | undefined): string {
  return resolveCurrencySource(source).fieldPath;
}

function resolveCurrencySource(source: Record<string, unknown> | null | undefined): CurrencySourceResolution {
  if (!source) {
    return {
      balance: emptyCurrency(),
      fieldPath: "resources.currency"
    };
  }

  if (isRecord(source.resources) && isRecord(source.resources.currency)) {
    return {
      balance: sanitizeCurrencyAmount(source.resources.currency),
      fieldPath: "resources.currency"
    };
  }

  if (isRecord(source.currency)) {
    return {
      balance: sanitizeCurrencyAmount(source.currency),
      fieldPath: "currency"
    };
  }

  if (isRecord(source.coinPouch) && isRecord(source.coinPouch.coins)) {
    return {
      balance: sanitizeCurrencyAmount(source.coinPouch.coins),
      fieldPath: "coinPouch.coins"
    };
  }

  if (isRecord(source.coinPouch)) {
    return {
      balance: sanitizeCurrencyAmount(source.coinPouch),
      fieldPath: "coinPouch"
    };
  }

  return {
    balance: emptyCurrency(),
    fieldPath: "resources.currency"
  };
}

export function currencyToCopperValue(amount: CurrencyAmount): number {
  return currencyKeys.reduce((total, key) => total + amount[key] * currencyValueInCopper[key], 0);
}

export function canonicalizeCurrencyFromCopper(totalCopper: number): CurrencyAmount {
  const sign = totalCopper < 0 ? -1 : 1;
  let remaining = Math.abs(totalCopper);
  const out = emptyCurrency();

  for (const key of ["pp", "gp", "ep", "sp", "cp"] as const) {
    const value = currencyValueInCopper[key];
    const count = Math.floor(remaining / value);
    out[key] = count ? count * sign : 0;
    remaining -= count * value;
  }

  return out;
}

export function addCurrencyAmounts(left: CurrencyAmount, right: CurrencyAmount): CurrencyAmount {
  return {
    cp: left.cp + right.cp,
    sp: left.sp + right.sp,
    ep: left.ep + right.ep,
    gp: left.gp + right.gp,
    pp: left.pp + right.pp
  };
}

export function negateCurrencyAmount(amount: CurrencyAmount): CurrencyAmount {
  return {
    cp: -amount.cp,
    sp: -amount.sp,
    ep: -amount.ep,
    gp: -amount.gp,
    pp: -amount.pp
  };
}

export function subtractCurrencyAmounts(left: CurrencyAmount, right: CurrencyAmount): CurrencyAmount {
  return addCurrencyAmounts(left, negateCurrencyAmount(right));
}

export function isZeroCurrencyAmount(amount: CurrencyAmount): boolean {
  return currencyKeys.every((key) => amount[key] === 0);
}

export function clampToDebit(amount: CurrencyAmount): CurrencyAmount {
  return {
    cp: Math.max(0, -Math.min(amount.cp, 0)),
    sp: Math.max(0, -Math.min(amount.sp, 0)),
    ep: Math.max(0, -Math.min(amount.ep, 0)),
    gp: Math.max(0, -Math.min(amount.gp, 0)),
    pp: Math.max(0, -Math.min(amount.pp, 0))
  };
}

export function clampToCredit(amount: CurrencyAmount): CurrencyAmount {
  return {
    cp: Math.max(0, amount.cp),
    sp: Math.max(0, amount.sp),
    ep: Math.max(0, amount.ep),
    gp: Math.max(0, amount.gp),
    pp: Math.max(0, amount.pp)
  };
}

export function applyDeltaWithMakeChange(
  balance: CurrencyAmount,
  delta: CurrencyAmount,
  options: ApplyDeltaOptions = {}
): ApplyDeltaResult {
  const currentBalance = sanitizeCurrencyAmount(balance);
  const normalizedDelta = sanitizeCurrencyAmount(delta);
  const autoMakeChange = options.autoMakeChange !== false;
  const allowNegative = options.allowNegative === true;

  if (!autoMakeChange) {
    const newBalance = addCurrencyAmounts(currentBalance, normalizedDelta);

    if (!allowNegative && currencyKeys.some((key) => newBalance[key] < 0)) {
      throw new Error("Insufficient funds in the requested denominations.");
    }

    return {
      newBalance,
      actualDeltaApplied: subtractCurrencyAmounts(newBalance, currentBalance),
      conversionsPerformed: []
    };
  }

  const credit = clampToCredit(normalizedDelta);
  const requestedDebit = clampToDebit(normalizedDelta);
  const afterDirect = { ...currentBalance };
  const unmetDebit = emptyCurrency();

  for (const key of currencyKeys) {
    const subtractable = Math.min(afterDirect[key], requestedDebit[key]);
    afterDirect[key] -= subtractable;
    unmetDebit[key] = requestedDebit[key] - subtractable;
  }

  const remainingDebitValueCp = currencyToCopperValue(unmetDebit);
  const directBalanceValueCp = currencyToCopperValue(afterDirect);

  if (remainingDebitValueCp > 0 && directBalanceValueCp < remainingDebitValueCp && !allowNegative) {
    throw new Error("Insufficient total funds to cover this transaction.");
  }

  let balanceAfterDebit = afterDirect;
  const conversionsPerformed: CurrencyConversionRecord[] = [];

  if (remainingDebitValueCp > 0) {
    const convertedValueCp = directBalanceValueCp - remainingDebitValueCp;
    const convertedBalance = canonicalizeCurrencyFromCopper(convertedValueCp);

    conversionsPerformed.push({
      kind: "make_change",
      before: afterDirect,
      after: convertedBalance,
      debitValueCp: remainingDebitValueCp
    });

    balanceAfterDebit = convertedBalance;
  }

  let finalBalance = addCurrencyAmounts(balanceAfterDebit, credit);

  if (currencyToCopperValue(finalBalance) < 0 && !allowNegative) {
    throw new Error("This transaction would create a negative currency balance.");
  }

  if (currencyKeys.some((key) => finalBalance[key] < 0) && allowNegative) {
    finalBalance = canonicalizeCurrencyFromCopper(currencyToCopperValue(finalBalance));
  }

  return {
    newBalance: finalBalance,
    actualDeltaApplied: subtractCurrencyAmounts(finalBalance, currentBalance),
    conversionsPerformed
  };
}

export function splitAmount(
  amount: CurrencyAmount,
  playerIds: string[],
  mode: BarterSplitMode = "equal"
): BarterTargetDelta[] {
  if (!playerIds.length) {
    return [];
  }

  if (mode !== "equal") {
    throw new Error("Custom split is not implemented yet.");
  }

  const totalCopper = currencyToCopperValue(sanitizeCurrencyAmount(amount));
  const sign = totalCopper < 0 ? -1 : 1;
  const absoluteTotal = Math.abs(totalCopper);
  const baseShare = Math.floor(absoluteTotal / playerIds.length);
  const remainder = absoluteTotal % playerIds.length;

  return playerIds.map((playerId, index) => {
    const shareCopper = (baseShare + (index < remainder ? 1 : 0)) * sign;

    return {
      playerId,
      delta: canonicalizeCurrencyFromCopper(shareCopper)
    };
  });
}

export function formatCurrencyAmount(amount: CurrencyAmount): string {
  const normalized = sanitizeCurrencyAmount(amount);
  const parts = currencyKeys
    .map((key) => (normalized[key] ? `${normalized[key]} ${key}` : null))
    .filter((value): value is string => Boolean(value));

  return parts.length ? parts.join(", ") : "0";
}
