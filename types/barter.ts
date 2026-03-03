export interface CurrencyAmount {
  cp: number;
  sp: number;
  ep: number;
  gp: number;
  pp: number;
}

export type BarterTxType = "award" | "charge" | "transfer";
export type BarterTargetMode = "party" | "individual" | "multi";
export type BarterSplitMode = "equal" | "custom";

export interface BarterTargetDelta {
  playerId: string;
  delta: CurrencyAmount;
}

export interface CurrencyTransactionDoc {
  id: string;
  createdAt: string | null;
  createdByUid: string;
  type: BarterTxType;
  reason: string;
  targets: BarterTargetDelta[];
  metadata: {
    autoMakeChange: boolean;
    allowNegative: boolean;
    splitMode: BarterSplitMode;
    reversalOfTxId: string | null;
    reversedByTxId: string | null;
  };
}
