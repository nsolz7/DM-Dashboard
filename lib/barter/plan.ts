import type { BarterSplitMode, BarterTargetDelta, BarterTargetMode, BarterTxType, CurrencyAmount } from "@/types";
import {
  currencyToCopperValue,
  formatCurrencyAmount,
  isZeroCurrencyAmount,
  negateCurrencyAmount,
  sanitizeCurrencyAmount,
  splitAmount
} from "@/lib/currency";

export interface BarterPlanInput {
  type: BarterTxType;
  targetMode: BarterTargetMode;
  amount: CurrencyAmount;
  targetPlayerIds: string[];
  fromPlayerId?: string | null;
  toPlayerId?: string | null;
  splitMode?: BarterSplitMode;
}

export function buildBarterTargetDeltas(input: BarterPlanInput): BarterTargetDelta[] {
  const amount = sanitizeCurrencyAmount(input.amount);

  if (isZeroCurrencyAmount(amount)) {
    throw new Error("Enter a non-zero currency amount.");
  }

  if (currencyToCopperValue(amount) < 0) {
    throw new Error("Currency inputs must be zero or positive.");
  }

  if (input.type === "transfer") {
    if (!input.fromPlayerId || !input.toPlayerId) {
      throw new Error("Transfer requires both a source and destination player.");
    }

    if (input.fromPlayerId === input.toPlayerId) {
      throw new Error("Transfer source and destination must be different players.");
    }

    return [
      {
        playerId: input.fromPlayerId,
        delta: negateCurrencyAmount(amount)
      },
      {
        playerId: input.toPlayerId,
        delta: amount
      }
    ];
  }

  if (input.targetMode === "individual") {
    const playerId = input.targetPlayerIds[0];

    if (!playerId) {
      throw new Error("Select a player for this transaction.");
    }

    return [
      {
        playerId,
        delta: input.type === "charge" ? negateCurrencyAmount(amount) : amount
      }
    ];
  }

  if (!input.targetPlayerIds.length) {
    throw new Error("Select at least one player.");
  }

  const distributable = input.type === "charge" ? negateCurrencyAmount(amount) : amount;

  return splitAmount(distributable, input.targetPlayerIds, input.splitMode ?? "equal");
}

export function summarizeTargetDeltas(targets: BarterTargetDelta[]): string {
  if (!targets.length) {
    return "No players impacted";
  }

  return targets.map((target) => `${target.playerId}: ${formatCurrencyAmount(target.delta)}`).join(" | ");
}
