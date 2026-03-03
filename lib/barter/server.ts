import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";

import type {
  AssignablePlayerOption,
  BarterSplitMode,
  BarterTargetDelta,
  BarterTargetMode,
  BarterTxType,
  CurrencyAmount,
  CurrencyTransactionDoc
} from "@/types";
import {
  applyDeltaWithMakeChange,
  currencyKeys,
  emptyCurrencyAmount,
  normalizeCurrencyFields,
  resolveCurrencyFieldPath,
  sanitizeCurrencyAmount
} from "@/lib/currency";
import { initializeAdminForServer } from "@/lib/admin/firebaseAdmin";
import { getAuthSessionUid, hasAuthSession } from "@/lib/firebase/authSession";
import { buildBarterTargetDeltas } from "@/lib/barter/plan";
import { isRecord, toNumber, toStringValue } from "@/lib/utils";

interface AuthContext {
  uid: string;
}

export interface ApplyBarterRequest {
  campaignId: string;
  type: BarterTxType;
  targetMode: BarterTargetMode;
  amount: CurrencyAmount;
  reason: string;
  targetPlayerIds?: string[];
  fromPlayerId?: string | null;
  toPlayerId?: string | null;
  splitMode?: BarterSplitMode;
  autoMakeChange?: boolean;
  allowNegative?: boolean;
}

export interface ReverseBarterRequest {
  campaignId: string;
  txId: string;
  reason?: string | null;
}

export interface AppliedBarterResponse {
  txId: string;
  updatedBalances: Array<{
    playerId: string;
    balance: CurrencyAmount;
  }>;
}

function timestampToIso(value: unknown): string | null {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }

  if (isRecord(value) && typeof value.toDate === "function") {
    return (value.toDate() as Date).toISOString();
  }

  return null;
}

function assertAuth(cookieHeader: string | null | undefined): AuthContext {
  if (!hasAuthSession(cookieHeader)) {
    throw new Error("A DM login session is required.");
  }

  return {
    uid: getAuthSessionUid(cookieHeader) ?? "dm-web"
  };
}

function normalizePlayerOptions(rows: AssignablePlayerOption[]): AssignablePlayerOption[] {
  return [...rows].sort((left, right) => {
    const leftOrder = typeof left.partyOrder === "number" ? left.partyOrder : Number.MAX_SAFE_INTEGER;
    const rightOrder = typeof right.partyOrder === "number" ? right.partyOrder : Number.MAX_SAFE_INTEGER;

    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    return (left.name ?? "").localeCompare(right.name ?? "");
  });
}

async function loadCampaignPlayers(campaignId: string): Promise<AssignablePlayerOption[]> {
  const initialized = await initializeAdminForServer();
  const db = getFirestore(initialized.app);
  const snapshot = await db.collection("campaigns").doc(campaignId).collection("players").get();

  const rows = snapshot.docs.map((document) => {
    const data = document.data();

    return {
      id: document.id,
      name: toStringValue(data.name),
      partyOrder: toNumber(data.partyOrder),
      active: data.active !== false
    };
  });

  return normalizePlayerOptions(rows);
}

function validateReason(reason: string): string {
  const normalized = reason.trim();

  if (!normalized) {
    throw new Error("A reason is required.");
  }

  return normalized;
}

function validatePlayerIds(playerIds: string[] | undefined): string[] {
  if (!Array.isArray(playerIds)) {
    return [];
  }

  return playerIds.filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim());
}

function validateCurrencyAmountInput(value: CurrencyAmount): CurrencyAmount {
  const normalized = sanitizeCurrencyAmount(value);

  for (const key of currencyKeys) {
    if (!Number.isInteger(normalized[key])) {
      throw new Error("Currency amounts must be whole integers.");
    }

    if (normalized[key] < 0) {
      throw new Error("Currency amounts cannot be negative in the request body.");
    }
  }

  return normalized;
}

function resolveTargetPlayerIds(
  players: AssignablePlayerOption[],
  targetMode: BarterTargetMode,
  explicitPlayerIds: string[]
): string[] {
  if (targetMode === "party") {
    const activePlayers = players.filter((player) => player.active);

    if (!activePlayers.length) {
      throw new Error("No active players are available in this campaign.");
    }

    return activePlayers.map((player) => player.id);
  }

  if (!explicitPlayerIds.length) {
    return [];
  }

  const playerSet = new Set(players.map((player) => player.id));
  const validIds = explicitPlayerIds.filter((playerId) => playerSet.has(playerId));

  if (validIds.length !== explicitPlayerIds.length) {
    throw new Error("One or more selected players no longer exist.");
  }

  return validIds;
}

function ensureKnownPlayers(players: AssignablePlayerOption[], playerIds: string[]) {
  const playerSet = new Set(players.map((player) => player.id));

  for (const playerId of playerIds) {
    if (!playerSet.has(playerId)) {
      throw new Error(`Unknown player: ${playerId}`);
    }
  }
}

function deriveReverseType(type: BarterTxType): BarterTxType {
  if (type === "award") {
    return "charge";
  }

  if (type === "charge") {
    return "award";
  }

  return "transfer";
}

function docToLedger(id: string, raw: Record<string, unknown>): CurrencyTransactionDoc {
  const metadata = isRecord(raw.metadata) ? raw.metadata : {};
  const targets = Array.isArray(raw.targets)
    ? raw.targets
        .filter((target): target is Record<string, unknown> => isRecord(target))
        .map((target) => ({
          playerId: toStringValue(target.playerId) ?? "unknown",
          delta: sanitizeCurrencyAmount(isRecord(target.delta) ? target.delta : emptyCurrencyAmount())
        }))
    : [];

  return {
    id,
    createdAt: timestampToIso(raw.createdAt),
    createdByUid: toStringValue(raw.createdByUid) ?? "dm-web",
    type: (toStringValue(raw.type) as BarterTxType) ?? "award",
    reason: toStringValue(raw.reason) ?? "—",
    targets,
    metadata: {
      autoMakeChange: metadata.autoMakeChange !== false,
      allowNegative: metadata.allowNegative === true,
      splitMode: (toStringValue(metadata.splitMode) as BarterSplitMode) ?? "equal",
      reversalOfTxId: toStringValue(metadata.reversalOfTxId),
      reversedByTxId: toStringValue(metadata.reversedByTxId)
    }
  };
}

async function applyLedgerTransaction(
  auth: AuthContext,
  options: {
    campaignId: string;
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
    updateOriginalTxId?: string;
  }
): Promise<AppliedBarterResponse> {
  const initialized = await initializeAdminForServer();
  const db = getFirestore(initialized.app);
  const txCollection = db.collection("campaigns").doc(options.campaignId).collection("currency_transactions");
  const txRef = txCollection.doc();
  const sheetRefs = options.targets.map((target) =>
    db.collection("campaigns").doc(options.campaignId).collection("sheets").doc(target.playerId)
  );

  const updatedBalances = await db.runTransaction(async (transaction) => {
    const snapshots = await Promise.all(sheetRefs.map((ref) => transaction.get(ref)));
    const nextBalances: Array<{ playerId: string; balance: CurrencyAmount }> = [];

    for (let index = 0; index < options.targets.length; index += 1) {
      const target = options.targets[index];
      const snapshot = snapshots[index];
      const data = snapshot.exists ? snapshot.data() ?? {} : {};
      const balance = normalizeCurrencyFields(data);
      const fieldPath = resolveCurrencyFieldPath(data);
      const result = applyDeltaWithMakeChange(balance, target.delta, {
        autoMakeChange: options.metadata.autoMakeChange,
        allowNegative: options.metadata.allowNegative
      });

      transaction.set(
        sheetRefs[index],
        {
          playerId: target.playerId,
          [fieldPath]: result.newBalance,
          updatedAt: FieldValue.serverTimestamp()
        },
        { merge: true }
      );

      nextBalances.push({
        playerId: target.playerId,
        balance: result.newBalance
      });
    }

    transaction.set(txRef, {
      createdAt: FieldValue.serverTimestamp(),
      createdByUid: auth.uid,
      type: options.type,
      reason: options.reason,
      targets: options.targets.map((target) => ({
        playerId: target.playerId,
        delta: target.delta
      })),
      metadata: options.metadata
    });

    if (options.updateOriginalTxId) {
      transaction.update(txCollection.doc(options.updateOriginalTxId), {
        "metadata.reversedByTxId": txRef.id
      });
    }

    return nextBalances;
  });

  return {
    txId: txRef.id,
    updatedBalances
  };
}

export async function applyBarterRequest(
  cookieHeader: string | null | undefined,
  rawBody: ApplyBarterRequest
): Promise<AppliedBarterResponse> {
  const auth = assertAuth(cookieHeader);
  const campaignId = rawBody.campaignId?.trim();

  if (!campaignId) {
    throw new Error("campaignId is required.");
  }

  const reason = validateReason(rawBody.reason);
  const players = await loadCampaignPlayers(campaignId);
  const explicitPlayerIds = validatePlayerIds(rawBody.targetPlayerIds);
  const targetPlayerIds = resolveTargetPlayerIds(players, rawBody.targetMode, explicitPlayerIds);
  const fromPlayerId = rawBody.fromPlayerId?.trim() ?? null;
  const toPlayerId = rawBody.toPlayerId?.trim() ?? null;

  if (rawBody.type === "transfer") {
    if (!fromPlayerId || !toPlayerId) {
      throw new Error("Transfer requires both a source and destination player.");
    }

    ensureKnownPlayers(players, [fromPlayerId, toPlayerId]);
  }

  const targets = buildBarterTargetDeltas({
    type: rawBody.type,
    targetMode: rawBody.targetMode,
    amount: validateCurrencyAmountInput(rawBody.amount),
    targetPlayerIds,
    fromPlayerId,
    toPlayerId,
    splitMode: rawBody.splitMode ?? "equal"
  });

  if (!targets.length) {
    throw new Error("This transaction does not affect any players.");
  }

  return applyLedgerTransaction(auth, {
    campaignId,
    type: rawBody.type,
    reason,
    targets,
    metadata: {
      autoMakeChange: rawBody.type === "award" ? false : rawBody.autoMakeChange !== false,
      allowNegative: rawBody.allowNegative === true,
      splitMode: rawBody.splitMode ?? "equal",
      reversalOfTxId: null,
      reversedByTxId: null
    }
  });
}

export async function reverseBarterRequest(
  cookieHeader: string | null | undefined,
  rawBody: ReverseBarterRequest
): Promise<AppliedBarterResponse> {
  const auth = assertAuth(cookieHeader);
  const campaignId = rawBody.campaignId?.trim();
  const txId = rawBody.txId?.trim();

  if (!campaignId || !txId) {
    throw new Error("campaignId and txId are required.");
  }

  const initialized = await initializeAdminForServer();
  const db = getFirestore(initialized.app);
  const txRef = db.collection("campaigns").doc(campaignId).collection("currency_transactions").doc(txId);
  const snapshot = await txRef.get();

  if (!snapshot.exists) {
    throw new Error("The selected barter transaction could not be found.");
  }

  const original = docToLedger(snapshot.id, snapshot.data() ?? {});

  if (original.metadata.reversedByTxId) {
    throw new Error("This barter transaction has already been reversed.");
  }

  const reverseTargets = original.targets.map((target) => ({
    playerId: target.playerId,
    delta: {
      cp: -target.delta.cp,
      sp: -target.delta.sp,
      ep: -target.delta.ep,
      gp: -target.delta.gp,
      pp: -target.delta.pp
    }
  }));

  const reasonPrefix = rawBody.reason?.trim() ? `${rawBody.reason.trim()} | ` : "";

  return applyLedgerTransaction(auth, {
    campaignId,
    type: deriveReverseType(original.type),
    reason: `${reasonPrefix}Reversal: ${original.reason}`,
    targets: reverseTargets,
    metadata: {
      autoMakeChange: original.metadata.autoMakeChange,
      allowNegative: original.metadata.allowNegative,
      splitMode: original.metadata.splitMode,
      reversalOfTxId: original.id,
      reversedByTxId: null
    },
    updateOriginalTxId: original.id
  });
}

export async function listRecentCurrencyTransactions(
  cookieHeader: string | null | undefined,
  options: {
    campaignId: string;
    playerId?: string | null;
    limit?: number;
  }
): Promise<CurrencyTransactionDoc[]> {
  assertAuth(cookieHeader);

  const campaignId = options.campaignId.trim();

  if (!campaignId) {
    throw new Error("campaignId is required.");
  }

  const limit = Math.max(1, Math.min(options.limit ?? 20, 50));
  const initialized = await initializeAdminForServer();
  const db = getFirestore(initialized.app);
  const snapshot = await db
    .collection("campaigns")
    .doc(campaignId)
    .collection("currency_transactions")
    .orderBy("createdAt", "desc")
    .limit(limit * 3)
    .get();

  const playerId = options.playerId?.trim() ?? null;
  const rows = snapshot.docs
    .map((document) => docToLedger(document.id, document.data() ?? {}))
    .filter((document) => !playerId || document.targets.some((target) => target.playerId === playerId))
    .slice(0, limit);

  return rows;
}
