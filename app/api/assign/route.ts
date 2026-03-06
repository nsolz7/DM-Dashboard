import { NextResponse } from "next/server";
import { getFirestore } from "firebase-admin/firestore";

import { initializeAdminForServer } from "@/lib/admin/firebaseAdmin";
import { getAuthSessionUid, hasAuthSession } from "@/lib/firebase/authSession";
import { isRecord, toNumber, toStringValue } from "@/lib/utils";
import { safeCreateCampaignTransaction } from "@/src/lib/transactions/create";
import { getDmRecipientKey, getPlayerRecipientKey } from "@/src/lib/transactions/recipientKeys";

const ASSIGNABLE_TYPES = new Set(["items", "spells", "traits"]);
const REMOVABLE_GRANT_TYPES = new Set(["items", "spells", "traits", "features"]);
const MANUAL_ASSIGN_SOURCE_TYPE = "dm";
const MANUAL_ASSIGN_SOURCE_ID = "compendium.assign";

interface AssignRequestBody {
  campaignId: string;
  playerId: string;
  type: "items" | "spells" | "traits";
  entryId: string;
  entryName?: string;
  isCantrip?: boolean;
  itemContainerTag?: string;
}

interface RemoveRequestBody {
  campaignId: string;
  playerId: string;
  target: "inventory" | "grant";
  grantType?: "items" | "spells" | "traits" | "features";
  index: number;
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function unauthorized() {
  return NextResponse.json({ error: "A DM login session is required." }, { status: 401 });
}

function isAssignableType(value: string): value is AssignRequestBody["type"] {
  return ASSIGNABLE_TYPES.has(value);
}

function isRemovableGrantType(value: string): value is NonNullable<RemoveRequestBody["grantType"]> {
  return REMOVABLE_GRANT_TYPES.has(value);
}

function sanitizeContainerTag(value: string | undefined): string {
  const normalized = value?.trim().toLowerCase();
  return normalized || "misc";
}

function mapArrayEntries(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is Record<string, unknown> => isRecord(entry));
}

export async function POST(request: Request) {
  if (!hasAuthSession(request.headers.get("cookie"))) {
    return unauthorized();
  }

  let body: AssignRequestBody;

  try {
    body = (await request.json()) as AssignRequestBody;
  } catch {
    return badRequest("Invalid JSON payload.");
  }

  const campaignId = toStringValue(body.campaignId);
  const playerId = toStringValue(body.playerId);
  const entryId = toStringValue(body.entryId);
  const entryName = toStringValue(body.entryName) ?? toStringValue(body.entryId) ?? "Assigned Entry";

  if (!campaignId || !playerId || !entryId) {
    return badRequest("campaignId, playerId, and entryId are required.");
  }

  if (!isAssignableType(body.type)) {
    return badRequest("Only items, spells, and traits can be assigned.");
  }

  try {
    const dmUid = getAuthSessionUid(request.headers.get("cookie"));
    const initialized = await initializeAdminForServer();
    const db = getFirestore(initialized.app);
    const playerRef = db.collection("campaigns").doc(campaignId).collection("players").doc(playerId);

    const result = await db.runTransaction(async (transaction) => {
      const playerSnapshot = await transaction.get(playerRef);

      if (!playerSnapshot.exists) {
        throw new Error("The selected player could not be found.");
      }

      const playerData = playerSnapshot.data() ?? {};
      const grants = isRecord(playerData.grants) ? playerData.grants : {};
      const inventory = isRecord(playerData.inventory) ? playerData.inventory : {};
      const currentLevel = toNumber(playerData.level) ?? 1;

      if (body.type === "items") {
        const currentStacks = mapArrayEntries(inventory.stacks);
        const manualStackIndex = currentStacks.findIndex(
          (stack) =>
            toStringValue(stack.itemId) === entryId && toStringValue(stack.sourceType) === MANUAL_ASSIGN_SOURCE_TYPE
        );

        const nextStacks =
          manualStackIndex >= 0
            ? currentStacks.map((stack, index) => {
                if (index !== manualStackIndex) {
                  return stack;
                }

                const currentQty = toNumber(stack.qty) ?? 0;

                return {
                  ...stack,
                  qty: currentQty + 1
                };
              })
            : [
                ...currentStacks,
                {
                  itemId: entryId,
                  qty: 1,
                  equipped: false,
                  attuned: false,
                  sourceType: MANUAL_ASSIGN_SOURCE_TYPE,
                  sourceId: MANUAL_ASSIGN_SOURCE_ID,
                  grantedAtLevel: currentLevel,
                  containerTag: sanitizeContainerTag(body.itemContainerTag)
                }
              ];

        transaction.update(playerRef, {
          "inventory.stacks": nextStacks
        });

        return {
          status: manualStackIndex >= 0 ? "incremented" : "assigned"
        };
      }

      const grantKey = body.type === "spells" ? "spells" : "traits";
      const currentEntries = mapArrayEntries(grants[grantKey]);
      const existingEntry = currentEntries.find((entry) => toStringValue(entry.refId) === entryId);

      if (existingEntry) {
        return {
          status: "already_assigned"
        };
      }

      const nextEntry =
        body.type === "spells"
          ? {
              refId: entryId,
              name: entryName,
              isCantrip: body.isCantrip === true,
              prepared: true,
              sourceType: MANUAL_ASSIGN_SOURCE_TYPE,
              sourceId: MANUAL_ASSIGN_SOURCE_ID,
              grantedAtLevel: currentLevel
            }
          : {
              refId: entryId,
              name: entryName,
              sourceType: MANUAL_ASSIGN_SOURCE_TYPE,
              sourceId: MANUAL_ASSIGN_SOURCE_ID,
              grantedAtLevel: currentLevel,
              choiceGroupId: null
            };

      transaction.update(playerRef, {
        [`grants.${grantKey}`]: [...currentEntries, nextEntry]
      });

      return {
        status: "assigned"
      };
    });

    const dmRecipientKey = dmUid ? getDmRecipientKey(dmUid) : null;
    const playerRecipientKey = getPlayerRecipientKey(playerId);
    const recipientKeys = dmRecipientKey ? [dmRecipientKey, playerRecipientKey] : [playerRecipientKey];
    const humanType = body.type === "items" ? "Item" : body.type === "spells" ? "Spell" : "Trait";

    if (result.status !== "already_assigned") {
      await safeCreateCampaignTransaction({
        campaignId,
        kind: "transaction",
        category: "compendium_assign",
        message: {
          title: `${humanType} Assigned`,
          body: `${entryName} was ${result.status === "incremented" ? "incremented in" : "added to"} ${playerId}.`,
          severity: "success",
          icon: "compendium_assign"
        },
        sender: {
          actorType: "dm",
          uid: dmUid ?? undefined,
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
          entityType: body.type.slice(0, -1),
          entityId: entryId
        },
        related: {
          route: `/players/${encodeURIComponent(playerId)}`,
          entityType: "compendium_assign",
          entityId: entryId
        }
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to assign this compendium entry.";
    const status = message === "The selected player could not be found." ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: Request) {
  if (!hasAuthSession(request.headers.get("cookie"))) {
    return unauthorized();
  }

  let body: RemoveRequestBody;

  try {
    body = (await request.json()) as RemoveRequestBody;
  } catch {
    return badRequest("Invalid JSON payload.");
  }

  const campaignId = toStringValue(body.campaignId);
  const playerId = toStringValue(body.playerId);
  const index = Number.isInteger(body.index) ? body.index : -1;

  if (!campaignId || !playerId || index < 0) {
    return badRequest("campaignId, playerId, and a valid index are required.");
  }

  if (body.target !== "inventory" && body.target !== "grant") {
    return badRequest("target must be either inventory or grant.");
  }

  if (body.target === "grant" && (!body.grantType || !isRemovableGrantType(body.grantType))) {
    return badRequest("grantType must be items, spells, traits, or features.");
  }

  try {
    const initialized = await initializeAdminForServer();
    const db = getFirestore(initialized.app);
    const playerRef = db.collection("campaigns").doc(campaignId).collection("players").doc(playerId);

    const result = await db.runTransaction(async (transaction) => {
      const playerSnapshot = await transaction.get(playerRef);

      if (!playerSnapshot.exists) {
        throw new Error("The selected player could not be found.");
      }

      const playerData = playerSnapshot.data() ?? {};

      if (body.target === "inventory") {
        const inventory = isRecord(playerData.inventory) ? playerData.inventory : {};
        const currentStacks = mapArrayEntries(inventory.stacks);

        if (!currentStacks[index]) {
          throw new Error("The selected inventory entry could not be found.");
        }

        const nextStacks = [...currentStacks];
        const targetEntry = nextStacks[index];
        const currentQty = toNumber(targetEntry.qty) ?? 1;

        if (currentQty > 1) {
          nextStacks[index] = {
            ...targetEntry,
            qty: currentQty - 1
          };
        } else {
          nextStacks.splice(index, 1);
        }

        transaction.update(playerRef, {
          "inventory.stacks": nextStacks
        });

        return {
          status: currentQty > 1 ? "decremented" : "removed"
        };
      }

      const grants = isRecord(playerData.grants) ? playerData.grants : {};
      const grantKey = body.grantType as NonNullable<RemoveRequestBody["grantType"]>;
      const currentEntries = mapArrayEntries(grants[grantKey]);

      if (!currentEntries[index]) {
        throw new Error("The selected grant entry could not be found.");
      }

      const nextEntries = currentEntries.filter((_, entryIndex) => entryIndex !== index);

      transaction.update(playerRef, {
        [`grants.${grantKey}`]: nextEntries
      });

      return {
        status: "removed"
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to remove this player entry.";
    const status =
      message === "The selected player could not be found." ||
      message === "The selected inventory entry could not be found." ||
      message === "The selected grant entry could not be found."
        ? 404
        : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
