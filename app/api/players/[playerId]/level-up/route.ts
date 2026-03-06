import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

import { initializeAdminForServer } from "@/lib/admin/firebaseAdmin";
import { getAuthSessionUid, hasAuthSession } from "@/lib/firebase/authSession";
import { toIsoString, toStringValue } from "@/lib/utils";
import { getLevelingPreview, planNextLevelUp } from "@/src/lib/leveling/advancement";
import { safeCreateCampaignTransaction } from "@/src/lib/transactions/create";
import { getDmRecipientKey, getPlayerRecipientKey } from "@/src/lib/transactions/recipientKeys";
import {
  buildLevelHistoryRecord,
  buildPlayerUpdatePatch,
  readPlayerCore
} from "@/src/lib/leveling/playerSchemaAdapter";
import type { LevelHistoryEntry, LevelUpResult, LevelingPreview } from "@/types/leveling";

interface RouteContext {
  params: {
    playerId: string;
  };
}

interface LevelUpRequestBody {
  campaignId: string;
  note?: string;
}

function unauthorized() {
  return NextResponse.json({ error: "A DM login session is required." }, { status: 401 });
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function conflict(message: string, preview?: LevelingPreview) {
  return NextResponse.json({ error: message, preview }, { status: 409 });
}

function mapHistoryEntry(snapshot: FirebaseFirestore.QueryDocumentSnapshot): LevelHistoryEntry {
  const data = snapshot.data();

  return {
    id: snapshot.id,
    createdAt: toIsoString(data.createdAt),
    createdByUid: toStringValue(data.createdByUid),
    playerId: toStringValue(data.playerId) ?? snapshot.ref.parent.parent?.id ?? "unknown",
    classId: toStringValue(data.classId) ?? "unknown",
    fromLevel: typeof data.fromLevel === "number" ? data.fromLevel : 0,
    toLevel: typeof data.toLevel === "number" ? data.toLevel : 0,
    hpGain: typeof data.hpGain === "number" ? data.hpGain : 0,
    hitDie: toStringValue(data.hitDie) ?? "—",
    note: toStringValue(data.note) ?? "Manual level up",
    mapping: {
      totalLevelPath: toStringValue(data.mapping?.totalLevelPath),
      classLevelPath: toStringValue(data.mapping?.classLevelPath),
      hpMaxPath: toStringValue(data.mapping?.hpMaxPath),
      hpCurrentPath: toStringValue(data.mapping?.hpCurrentPath),
      hitDicePath: toStringValue(data.mapping?.hitDicePath),
      pendingSelectionsPath: toStringValue(data.mapping?.pendingSelectionsPath),
      lockPath: toStringValue(data.mapping?.lockPath) ?? "levelUpLock"
    }
  };
}

export async function GET(request: Request, { params }: RouteContext) {
  if (!hasAuthSession(request.headers.get("cookie"))) {
    return unauthorized();
  }

  const campaignId = toStringValue(new URL(request.url).searchParams.get("campaignId"));
  const playerId = toStringValue(params.playerId);

  if (!campaignId || !playerId) {
    return badRequest("campaignId and playerId are required.");
  }

  try {
    const initialized = await initializeAdminForServer();
    const db = getFirestore(initialized.app);
    const playerRef = db.collection("campaigns").doc(campaignId).collection("players").doc(playerId);
    const sheetRef = db.collection("campaigns").doc(campaignId).collection("sheets").doc(playerId);
    const historyRef = playerRef.collection("level_history");

    const [playerSnapshot, sheetSnapshot, historySnapshot] = await Promise.all([
      playerRef.get(),
      sheetRef.get(),
      historyRef.orderBy("createdAt", "desc").limit(10).get()
    ]);

    if (!playerSnapshot.exists && !sheetSnapshot.exists) {
      return NextResponse.json({ error: "The selected player could not be found." }, { status: 404 });
    }

    const core = readPlayerCore({
      campaignId,
      playerId,
      playerData: playerSnapshot.exists ? playerSnapshot.data() ?? {} : null,
      sheetData: sheetSnapshot.exists ? sheetSnapshot.data() ?? {} : null
    });

    return NextResponse.json({
      preview: getLevelingPreview(core),
      recentHistory: historySnapshot.docs.map(mapHistoryEntry)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load leveling data.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  if (!hasAuthSession(request.headers.get("cookie"))) {
    return unauthorized();
  }

  let body: LevelUpRequestBody;

  try {
    body = (await request.json()) as LevelUpRequestBody;
  } catch {
    return badRequest("Invalid JSON payload.");
  }

  const campaignId = toStringValue(body.campaignId);
  const playerId = toStringValue(params.playerId);
  const note = (toStringValue(body.note) ?? "Manual level up").slice(0, 240);

  if (!campaignId || !playerId) {
    return badRequest("campaignId and playerId are required.");
  }

  try {
    const initialized = await initializeAdminForServer();
    const db = getFirestore(initialized.app);
    const playerRef = db.collection("campaigns").doc(campaignId).collection("players").doc(playerId);
    const sheetRef = db.collection("campaigns").doc(campaignId).collection("sheets").doc(playerId);
    const historyRef = playerRef.collection("level_history");
    const createdByUid = getAuthSessionUid(request.headers.get("cookie"));
    const historyId = randomUUID();

    const result = await db.runTransaction(async (transaction) => {
      const [playerSnapshot, sheetSnapshot] = await Promise.all([transaction.get(playerRef), transaction.get(sheetRef)]);

      if (!playerSnapshot.exists && !sheetSnapshot.exists) {
        throw new Error("The selected player could not be found.");
      }

      const core = readPlayerCore({
        campaignId,
        playerId,
        playerData: playerSnapshot.exists ? playerSnapshot.data() ?? {} : null,
        sheetData: sheetSnapshot.exists ? sheetSnapshot.data() ?? {} : null
      });
      const preview = getLevelingPreview(core);
      const computation = planNextLevelUp(core);

      if (!preview.canLevel || computation.gatingIssues.length) {
        const reason = computation.gatingIssues.join(", ");
        const blockedError = new Error(`Level up is blocked until the required mappings resolve: ${reason}`);
        (blockedError as Error & { preview?: LevelingPreview }).preview = preview;
        throw blockedError;
      }

      const timestamp = FieldValue.serverTimestamp();
      const patches = buildPlayerUpdatePatch({
        core,
        computation,
        historyId,
        createdByUid,
        timestampValue: timestamp
      });
      const historyRecord = buildLevelHistoryRecord({
        core,
        computation,
        createdByUid,
        note,
        timestampValue: timestamp
      });

      transaction.set(playerRef, patches.playerPatch, { merge: true });
      transaction.set(sheetRef, patches.sheetPatch, { merge: true });
      transaction.set(historyRef.doc(historyId), historyRecord);

      const pendingSelectionsBefore = core.pendingSelections.length;
      const pendingSelectionsAfter = computation.pendingSelections.length;

      const payload: LevelUpResult = {
        txId: historyId,
        previousLevel: computation.previousLevel,
        nextLevel: computation.nextLevel,
        hpGain: computation.hpGain,
        hitDie: computation.hitDieLabel,
        currentHp: computation.nextHpCurrent,
        maxHp: computation.nextHpMax,
        pendingSelectionsAdded: Math.max(0, pendingSelectionsAfter - pendingSelectionsBefore)
      };

      return payload;
    });

    const dmRecipientKey = createdByUid ? getDmRecipientKey(createdByUid) : null;
    const playerRecipientKey = getPlayerRecipientKey(playerId);
    const hasPendingPrompt = result.pendingSelectionsAdded > 0;
    const recipientKeys = dmRecipientKey ? [dmRecipientKey, playerRecipientKey] : [playerRecipientKey];

    await safeCreateCampaignTransaction({
      campaignId,
      kind: hasPendingPrompt ? "prompt" : "transaction",
      category: "level_up",
      message: {
        title: `Level Up: ${playerId} reached level ${result.nextLevel}`,
        body: hasPendingPrompt
          ? `Level up applied (+${result.hpGain} HP). ${result.pendingSelectionsAdded} follow-up selection prompt(s) need attention.`
          : `Level up applied successfully (+${result.hpGain} HP, now ${result.currentHp}/${result.maxHp}).`,
        severity: "success",
        icon: "level_up"
      },
      sender: {
        actorType: "dm",
        uid: createdByUid ?? undefined,
        displayName: "DM Dashboard"
      },
      recipientKeys,
      recipients: {
        mode: "single",
        playerIds: [playerId],
        includeDm: Boolean(dmRecipientKey)
      },
      recipientStateOverrides: {
        [playerRecipientKey]: {
          status: hasPendingPrompt ? "pending_response" : "unread"
        },
        ...(dmRecipientKey
          ? {
              [dmRecipientKey]: {
                status: "read"
              }
            }
          : {})
      },
      prompt: hasPendingPrompt
        ? {
            promptType: "level_up_choice",
            question: `Review and confirm level ${result.nextLevel} choices for ${playerId}.`,
            responseKind: "ack",
            required: true
          }
        : null,
      payload: {
        entityType: "level_up",
        entityId: result.txId,
        amount: {
          hpGain: result.hpGain
        }
      },
      related: {
        route: `/players/${encodeURIComponent(playerId)}`,
        entityType: "level_up",
        entityId: result.txId
      }
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to level up this player.";
    const preview = error instanceof Error && "preview" in error ? ((error as Error & { preview?: LevelingPreview }).preview ?? null) : null;

    if (message === "The selected player could not be found.") {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    if (message.startsWith("Level up is blocked")) {
      return conflict(message, preview ?? undefined);
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
