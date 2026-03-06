import type { CreateCustomItemRequest, CustomItemDoc } from "@/types";

interface CustomItemsResponse {
  items?: CustomItemDoc[];
  item?: CustomItemDoc;
  error?: string;
}

function toSearchParams(values: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();

  Object.entries(values).forEach(([key, value]) => {
    if (value === undefined) {
      return;
    }

    params.set(key, String(value));
  });

  return params.toString();
}

export async function createCustomItem(request: CreateCustomItemRequest): Promise<CustomItemDoc> {
  const response = await fetch("/api/custom-items", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(request)
  });
  const payload = (await response.json()) as CustomItemsResponse;

  if (!response.ok || !payload.item) {
    throw new Error(payload.error || "Unable to create custom item.");
  }

  return payload.item;
}

export async function listCustomItems(campaignId: string, limit = 40): Promise<CustomItemDoc[]> {
  const query = toSearchParams({
    campaignId,
    limit
  });
  const response = await fetch(`/api/custom-items?${query}`, {
    cache: "no-store"
  });
  const payload = (await response.json()) as CustomItemsResponse;

  if (!response.ok) {
    throw new Error(payload.error || "Unable to load custom items.");
  }

  return payload.items ?? [];
}

export async function searchCustomItems(
  campaignId: string,
  query: string,
  limit = 40
): Promise<CustomItemDoc[]> {
  const params = toSearchParams({
    campaignId,
    q: query,
    limit
  });
  const response = await fetch(`/api/custom-items?${params}`, {
    cache: "no-store"
  });
  const payload = (await response.json()) as CustomItemsResponse;

  if (!response.ok) {
    throw new Error(payload.error || "Unable to search custom items.");
  }

  return payload.items ?? [];
}

export const create = createCustomItem;
export const list = listCustomItems;
export const search = searchCustomItems;
