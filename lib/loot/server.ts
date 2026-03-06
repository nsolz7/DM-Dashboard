import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";

import type { CurrencyAmount, LootDropDoc, LootDropEntry, LootDropStatus, SendLootRequest, SendLootResponse } from "@/types";
import { initializeAdminForServer } from "@/lib/admin/firebaseAdmin";
import { currencyKeys, emptyCurrencyAmount, sanitizeCurrencyAmount } from "@/lib/currency";
import { getAuthSessionUid, hasAuthSession } from "@/lib/firebase/authSession";
import { isRecord, toNumber, toStringValue } from "@/lib/utils";
import { createCampaignTransaction } from "@/src/lib/transactions/create";
import { getDmRecipientKey, getPartyRecipientKey, getPlayerRecipientKey } from "@/src/lib/transactions/recipientKeys";

interface AuthContext {
  uid: string;
}

interface ListLootOptions {
  campaignId: string;
  limit?: number;
}

interface ReadLootOptions {
  campaignId: string;
  lootId: string;
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

function sanitizeCoinAmount(value: unknown): CurrencyAmount {
  const normalized = sanitizeCurrencyAmount(isRecord(value) ? value : emptyCurrencyAmount());

  return {
    cp: Math.max(0, Math.floor(normalized.cp)),
    sp: Math.max(0, Math.floor(normalized.sp)),
    ep: Math.max(0, Math.floor(normalized.ep)),
    gp: Math.max(0, Math.floor(normalized.gp)),
    pp: Math.max(0, Math.floor(normalized.pp))
  };
}

function hasCoins(amount: CurrencyAmount | null | undefined): boolean {
  if (!amount) {
    return false;
  }

  return currencyKeys.some((key) => amount[key] > 0);
}

function normalizeEntries(entries: LootDropEntry[]): LootDropEntry[] {
  return entries.map((entry, index) => {
    const entryId = entry.entryId?.trim() || `entry_${index + 1}`;
    const quantity = Math.max(1, Math.floor(toNumber(entry.quantity) ?? 1));
    const namePreview = entry.namePreview?.trim();
    const rarity = entry.rarity?.trim();

    if (entry.kind === "item") {
      const refId = entry.ref?.id?.trim();
      const refType = entry.ref?.type?.trim();

      if (!refId || !refType) {
        throw new Error(`Entry ${entryId} is missing a compendium reference.`);
      }

      const normalizedEntry: LootDropEntry = {
        entryId,
        kind: "item",
        ref: {
          type: refType,
          id: refId
        },
        quantity
      };

      if (namePreview) {
        normalizedEntry.namePreview = namePreview;
      }

      if (rarity) {
        normalizedEntry.rarity = rarity;
      }

      return normalizedEntry;
    }

    const customItemId = entry.customItemId?.trim();

    if (!customItemId) {
      throw new Error(`Entry ${entryId} is missing customItemId.`);
    }

    const normalizedEntry: LootDropEntry = {
      entryId,
      kind: "custom_item",
      ref: null,
      customItemId,
      quantity
    };

    if (namePreview) {
      normalizedEntry.namePreview = namePreview;
    }

    if (rarity) {
      normalizedEntry.rarity = rarity;
    }

    return normalizedEntry;
  });
}

function buildEntryRemaining(entries: LootDropEntry[]): Record<string, number> {
  return entries.reduce<Record<string, number>>((accumulator, entry) => {
    accumulator[entry.entryId] = entry.quantity;
    return accumulator;
  }, {});
}

function mapLootDrop(
  campaignId: string,
  lootId: string,
  raw: Record<string, unknown>
): LootDropDoc {
  const delivery = isRecord(raw.delivery) ? raw.delivery : {};
  const visibility = isRecord(raw.visibility) ? raw.visibility : {};
  const state = isRecord(raw.state) ? raw.state : {};
  const claimState = isRecord(raw.claimState) ? raw.claimState : {};
  const entryRemaining = isRecord(claimState.entryRemaining) ? claimState.entryRemaining : {};
  const status = toStringValue(state.status) as LootDropStatus | null;

  const entries = Array.isArray(raw.entries)
    ? raw.entries
        .filter((entry): entry is Record<string, unknown> => isRecord(entry))
        .map((entry, index) => {
          const kind: LootDropEntry["kind"] = toStringValue(entry.kind) === "custom_item" ? "custom_item" : "item";
          const ref = isRecord(entry.ref)
            ? {
                type: toStringValue(entry.ref.type) ?? "items",
                id: toStringValue(entry.ref.id) ?? ""
              }
            : null;

          const entryId = toStringValue(entry.entryId) ?? `entry_${index + 1}`;
          const namePreview = toStringValue(entry.namePreview) ?? undefined;
          const rarity = toStringValue(entry.rarity) ?? undefined;
          const quantity = Math.max(1, Math.floor(toNumber(entry.quantity) ?? 1));

          if (kind === "custom_item") {
            return {
              entryId,
              kind,
              ref: null,
              customItemId: toStringValue(entry.customItemId) ?? undefined,
              namePreview,
              rarity,
              quantity
            };
          }

          return {
            entryId,
            kind,
            ref,
            namePreview,
            rarity,
            quantity
          };
        })
    : [];

  return {
    id: lootId,
    campaignId,
    schemaVersion: 1,
    createdAt: timestampToIso(raw.createdAt),
    createdByUid: toStringValue(raw.createdByUid) ?? "dm-web",
    reason: toStringValue(raw.reason) ?? "Loot Drop",
    source: isRecord(raw.source)
      ? {
          scenarioId: toStringValue(raw.source.scenarioId) ?? undefined,
          location: toStringValue(raw.source.location) ?? undefined
        }
      : undefined,
    delivery: {
      mode: toStringValue(delivery.mode) === "assigned" ? "assigned" : "party_claim",
      recipientKeys: Array.isArray(delivery.recipientKeys)
        ? delivery.recipientKeys
            .map((value) => toStringValue(value))
            .filter((value): value is string => Boolean(value))
        : [],
      playerIds: Array.isArray(delivery.playerIds)
        ? delivery.playerIds
            .map((value) => toStringValue(value))
            .filter((value): value is string => Boolean(value))
        : undefined
    },
    visibility: {
      revealOnOpen: visibility.revealOnOpen !== false
    },
    state: {
      status:
        status === "opened" ||
        status === "partially_claimed" ||
        status === "fully_claimed" ||
        status === "closed"
          ? status
          : "sent"
    },
    coins: hasCoins(sanitizeCoinAmount(raw.coins)) ? sanitizeCoinAmount(raw.coins) : undefined,
    entries,
    claimState: {
      entryRemaining: Object.entries(entryRemaining).reduce<Record<string, number>>((accumulator, [entryId, value]) => {
        const quantity = Math.max(0, Math.floor(toNumber(value) ?? 0));
        accumulator[entryId] = quantity;
        return accumulator;
      }, {}),
      entryClaims: Array.isArray(claimState.entryClaims)
        ? claimState.entryClaims
            .filter((entry): entry is Record<string, unknown> => isRecord(entry))
            .map((entry) => ({
              entryId: toStringValue(entry.entryId) ?? "",
              playerId: toStringValue(entry.playerId) ?? "",
              qty: Math.max(1, Math.floor(toNumber(entry.qty) ?? 1)),
              claimedAt: timestampToIso(entry.claimedAt)
            }))
            .filter((entry) => entry.entryId && entry.playerId)
        : [],
      coinClaims: Array.isArray(claimState.coinClaims)
        ? claimState.coinClaims
            .filter((entry): entry is Record<string, unknown> => isRecord(entry))
            .map((entry) => ({
              playerId: toStringValue(entry.playerId) ?? "",
              amount: sanitizeCoinAmount(entry.amount),
              claimedAt: timestampToIso(entry.claimedAt)
            }))
            .filter((entry) => entry.playerId)
        : []
    }
  };
}

async function validateRecipientPlayers(
  campaignId: string,
  playerIds: string[]
): Promise<void> {
  if (!playerIds.length) {
    return;
  }

  const initialized = await initializeAdminForServer();
  const db = getFirestore(initialized.app);
  const refs = playerIds.map((playerId) => db.collection("campaigns").doc(campaignId).collection("players").doc(playerId));
  const snapshots = await Promise.all(refs.map((ref) => ref.get()));

  const missing = playerIds.filter((_, index) => !snapshots[index].exists);

  if (missing.length) {
    throw new Error(`Unknown player ids: ${missing.join(", ")}`);
  }
}

export async function sendLootDropRequest(
  cookieHeader: string | null | undefined,
  request: SendLootRequest
): Promise<SendLootResponse> {
  const auth = assertAuth(cookieHeader);
  const campaignId = request.campaignId.trim();
  const reason = request.reason.trim();

  if (!campaignId || !reason) {
    throw new Error("campaignId and reason are required.");
  }

  const deliveryMode = request.delivery.mode;

  if (deliveryMode !== "party_claim" && deliveryMode !== "assigned") {
    throw new Error("delivery.mode must be party_claim or assigned.");
  }

  const normalizedEntries = normalizeEntries(request.entries ?? []);
  const normalizedCoins = sanitizeCoinAmount(request.coins);

  if (!normalizedEntries.length && !hasCoins(normalizedCoins)) {
    throw new Error("Add at least one loot entry or one coin amount before sending.");
  }

  const playerIds = Array.from(
    new Set(
      (request.delivery.playerIds ?? [])
        .map((playerId) => playerId.trim())
        .filter((playerId) => Boolean(playerId))
    )
  );

  if (deliveryMode === "assigned" && !playerIds.length) {
    throw new Error("Assigned delivery requires at least one player.");
  }

  await validateRecipientPlayers(campaignId, playerIds);

  const initialized = await initializeAdminForServer();
  const db = getFirestore(initialized.app);
  const lootRef = db.collection("campaigns").doc(campaignId).collection("loot_drops").doc();
  const dmRecipientKey = getDmRecipientKey(auth.uid);
  const baseRecipientKeys =
    deliveryMode === "party_claim"
      ? [getPartyRecipientKey(campaignId)]
      : playerIds.map((playerId) => getPlayerRecipientKey(playerId));
  const includeDm = request.delivery.includeDm !== false;
  const recipientKeys = includeDm ? [dmRecipientKey, ...baseRecipientKeys] : baseRecipientKeys;
  const recipientStateOverrides = recipientKeys.reduce<Record<string, { status: "unread" }>>((accumulator, recipientKey) => {
    accumulator[recipientKey] = {
      status: "unread"
    };
    return accumulator;
  }, {});

  await lootRef.set({
    schemaVersion: 1,
    createdAt: FieldValue.serverTimestamp(),
    createdByUid: auth.uid,
    reason,
    source: request.source ?? null,
    delivery: {
      mode: deliveryMode,
      recipientKeys,
      ...(deliveryMode === "assigned" ? { playerIds } : {})
    },
    visibility: {
      revealOnOpen: true
    },
    state: {
      status: "sent"
    },
    ...(hasCoins(normalizedCoins) ? { coins: normalizedCoins } : {}),
    entries: normalizedEntries,
    claimState: {
      entryRemaining: buildEntryRemaining(normalizedEntries),
      entryClaims: [],
      coinClaims: []
    }
  });

  try {
    const txId = await createCampaignTransaction({
      campaignId,
      kind: "prompt",
      category: "loot",
      message: {
        title: "Loot Found",
        body: `${reason} — tap to open chest`,
        severity: "success",
        icon: "loot"
      },
      sender: {
        actorType: "dm",
        uid: auth.uid,
        displayName: "DM Dashboard"
      },
      recipientKeys,
      recipients: {
        mode:
          deliveryMode === "party_claim" ? "party" : playerIds.length > 1 ? "multi" : "single",
        ...(deliveryMode === "assigned" ? { playerIds } : {}),
        includeDm
      },
      recipientStateOverrides,
      prompt: {
        promptType: "generic_question",
        question: "Acknowledge this loot drop?",
        responseKind: "ack",
        required: true
      },
      payload: {
        entityType: "loot_drop",
        entityId: lootRef.id,
        amount: {
          lootId: lootRef.id,
          reason,
          counts: {
            items: normalizedEntries.length,
            hasCoins: hasCoins(normalizedCoins)
          }
        }
      },
      related: {
        route: "/loot",
        entityType: "loot_drop",
        entityId: lootRef.id
      }
    });

    return {
      lootId: lootRef.id,
      txId
    };
  } catch (error) {
    await lootRef.delete().catch(() => undefined);
    throw error;
  }
}

export async function listRecentLootDrops(
  cookieHeader: string | null | undefined,
  options: ListLootOptions
): Promise<LootDropDoc[]> {
  assertAuth(cookieHeader);

  const campaignId = options.campaignId.trim();

  if (!campaignId) {
    throw new Error("campaignId is required.");
  }

  const limit = Math.max(1, Math.min(options.limit ?? 20, 60));
  const initialized = await initializeAdminForServer();
  const db = getFirestore(initialized.app);
  const snapshot = await db
    .collection("campaigns")
    .doc(campaignId)
    .collection("loot_drops")
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();

  return snapshot.docs.map((document) => mapLootDrop(campaignId, document.id, document.data() ?? {}));
}

export async function readLootDrop(
  cookieHeader: string | null | undefined,
  options: ReadLootOptions
): Promise<LootDropDoc> {
  assertAuth(cookieHeader);

  const campaignId = options.campaignId.trim();
  const lootId = options.lootId.trim();

  if (!campaignId || !lootId) {
    throw new Error("campaignId and lootId are required.");
  }

  const initialized = await initializeAdminForServer();
  const db = getFirestore(initialized.app);
  const snapshot = await db
    .collection("campaigns")
    .doc(campaignId)
    .collection("loot_drops")
    .doc(lootId)
    .get();

  if (!snapshot.exists) {
    throw new Error("The selected loot drop could not be found.");
  }

  return mapLootDrop(campaignId, snapshot.id, snapshot.data() ?? {});
}
