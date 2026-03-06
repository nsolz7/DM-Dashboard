import { NextResponse } from "next/server";
import { getFirestore } from "firebase-admin/firestore";

import { initializeAdminForServer } from "@/lib/admin/firebaseAdmin";
import {
  formatEquipmentChangeSummary,
  mapEquipmentError,
  unequipInventorySlot
} from "@/lib/equipment/server";
import { getAuthSessionUid, hasAuthSession } from "@/lib/firebase/authSession";
import { safeCreateCampaignTransaction } from "@/src/lib/transactions/create";
import { getDmRecipientKey, getPlayerRecipientKey } from "@/src/lib/transactions/recipientKeys";

interface UnequipRequestBody {
  campaignId: string;
  playerId: string;
  slot: "head" | "body" | "cloak" | "hands" | "feet" | "bracers" | "neck" | "ring" | "mainHand" | "offHand";
  ringIndex?: number;
}

function unauthorized() {
  return NextResponse.json({ error: "A DM login session is required." }, { status: 401 });
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(request: Request) {
  if (!hasAuthSession(request.headers.get("cookie"))) {
    return unauthorized();
  }

  let body: UnequipRequestBody;

  try {
    body = (await request.json()) as UnequipRequestBody;
  } catch {
    return badRequest("Invalid JSON payload.");
  }

  const dmUid = getAuthSessionUid(request.headers.get("cookie"));

  try {
    const initialized = await initializeAdminForServer();
    const db = getFirestore(initialized.app);
    const result = await unequipInventorySlot(db, {
      campaignId: body.campaignId,
      playerId: body.playerId,
      slot: body.slot,
      ringIndex: body.ringIndex
    });

    const playerRecipientKey = getPlayerRecipientKey(result.playerId);
    const dmRecipientKey = dmUid ? getDmRecipientKey(dmUid) : null;
    const recipientKeys = dmRecipientKey ? [dmRecipientKey, playerRecipientKey] : [playerRecipientKey];
    const changeSummary = formatEquipmentChangeSummary(result.changes);

    await safeCreateCampaignTransaction({
      campaignId: result.campaignId,
      kind: "info",
      category: "equip",
      message: {
        title: "Equipment Updated",
        body: `DM unequipped ${result.unequippedItemName ?? "an item"} for ${result.playerName ?? result.playerId}. ${changeSummary}`,
        severity: "warning",
        icon: "equip"
      },
      sender: {
        actorType: "dm",
        uid: dmUid ?? undefined,
        displayName: "DM Dashboard"
      },
      recipientKeys,
      recipients: {
        mode: "single",
        playerIds: [result.playerId],
        includeDm: Boolean(dmRecipientKey)
      },
      recipientStateOverrides: {
        [playerRecipientKey]: {
          status: "unread"
        },
        ...(dmRecipientKey
          ? {
              [dmRecipientKey]: {
                status: "read"
              }
            }
          : {})
      },
      payload: {
        entityType: "equipment",
        entityId: result.playerId,
        amount: {
          changes: result.changes
        }
      },
      related: {
        route: `/players/${encodeURIComponent(result.playerId)}`,
        entityType: "player",
        entityId: result.playerId
      }
    });

    return NextResponse.json(result);
  } catch (error) {
    const mapped = mapEquipmentError(error);
    return NextResponse.json(
      {
        error: mapped.message,
        code: mapped.code,
        details: mapped.details
      },
      { status: mapped.status }
    );
  }
}
