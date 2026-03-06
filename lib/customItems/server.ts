import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";

import type { CreateCustomItemRequest, CustomItemDoc } from "@/types";
import { initializeAdminForServer } from "@/lib/admin/firebaseAdmin";
import { isRecord, toStringValue } from "@/lib/utils";

interface ListCustomItemsOptions {
  query?: string | null;
  limit?: number;
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

function normalizeCustomItem(
  campaignId: string,
  id: string,
  raw: Record<string, unknown>
): CustomItemDoc {
  const rarity = toStringValue(raw.rarity);

  return {
    id,
    campaignId,
    name: toStringValue(raw.name) ?? id,
    type: toStringValue(raw.type) ?? "item",
    rarity,
    description: toStringValue(raw.description) ?? "",
    value: raw.value,
    createdAt: timestampToIso(raw.createdAt),
    createdByUid: toStringValue(raw.createdByUid) ?? "dm-web"
  };
}

function normalizeSearchQuery(query: string | null | undefined): string {
  return (query ?? "").trim().toLowerCase();
}

export async function createCustomItemOnServer(
  createdByUid: string,
  request: CreateCustomItemRequest
): Promise<CustomItemDoc> {
  const campaignId = request.campaignId.trim();
  const name = request.name.trim();
  const type = request.type.trim();
  const description = request.description.trim();
  const rarity = request.rarity?.trim() || null;

  if (!campaignId || !name || !type || !description) {
    throw new Error("campaignId, name, type, and description are required.");
  }

  const initialized = await initializeAdminForServer();
  const db = getFirestore(initialized.app);
  const ref = db.collection("campaigns").doc(campaignId).collection("custom_items").doc();

  await ref.set({
    name,
    type,
    rarity,
    description,
    value: request.value ?? null,
    createdByUid,
    createdAt: FieldValue.serverTimestamp()
  });

  const snapshot = await ref.get();
  return normalizeCustomItem(campaignId, ref.id, snapshot.data() ?? {});
}

export async function listCustomItemsFromServer(
  campaignId: string,
  options: ListCustomItemsOptions = {}
): Promise<CustomItemDoc[]> {
  const normalizedCampaignId = campaignId.trim();

  if (!normalizedCampaignId) {
    throw new Error("campaignId is required.");
  }

  const limit = Math.max(1, Math.min(options.limit ?? 40, 200));
  const query = normalizeSearchQuery(options.query);

  const initialized = await initializeAdminForServer();
  const db = getFirestore(initialized.app);
  const snapshot = await db
    .collection("campaigns")
    .doc(normalizedCampaignId)
    .collection("custom_items")
    .orderBy("createdAt", "desc")
    .limit(query ? Math.max(limit * 4, 80) : limit)
    .get();

  const items = snapshot.docs.map((document) =>
    normalizeCustomItem(normalizedCampaignId, document.id, document.data() ?? {})
  );

  if (!query) {
    return items.slice(0, limit);
  }

  return items
    .filter((item) => {
      const haystack = `${item.name} ${item.type} ${item.rarity ?? ""} ${item.description}`.toLowerCase();
      return haystack.includes(query);
    })
    .slice(0, limit);
}

export async function searchCustomItemsFromServer(
  campaignId: string,
  query: string,
  limit?: number
): Promise<CustomItemDoc[]> {
  return listCustomItemsFromServer(campaignId, {
    query,
    limit
  });
}
