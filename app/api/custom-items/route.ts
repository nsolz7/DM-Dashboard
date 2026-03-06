import { NextResponse } from "next/server";

import type { CreateCustomItemRequest } from "@/types";
import { createCustomItemOnServer, listCustomItemsFromServer, searchCustomItemsFromServer } from "@/lib/customItems/server";
import { getAuthSessionUid, hasAuthSession } from "@/lib/firebase/authSession";
import { toStringValue } from "@/lib/utils";

function unauthorized() {
  return NextResponse.json({ error: "A DM login session is required." }, { status: 401 });
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function GET(request: Request) {
  if (!hasAuthSession(request.headers.get("cookie"))) {
    return unauthorized();
  }

  const url = new URL(request.url);
  const campaignId = toStringValue(url.searchParams.get("campaignId"));
  const query = toStringValue(url.searchParams.get("q"));
  const limitRaw = Number.parseInt(url.searchParams.get("limit") ?? "40", 10);
  const limit = Number.isFinite(limitRaw) ? limitRaw : 40;

  if (!campaignId) {
    return badRequest("campaignId is required.");
  }

  try {
    const items = query
      ? await searchCustomItemsFromServer(campaignId, query, limit)
      : await listCustomItemsFromServer(campaignId, { limit });
    return NextResponse.json({ items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load custom items.";
    const status = message.includes("required") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  if (!hasAuthSession(request.headers.get("cookie"))) {
    return unauthorized();
  }

  const dmUid = getAuthSessionUid(request.headers.get("cookie"));

  if (!dmUid) {
    return unauthorized();
  }

  let body: CreateCustomItemRequest;

  try {
    body = (await request.json()) as CreateCustomItemRequest;
  } catch {
    return badRequest("Invalid JSON payload.");
  }

  try {
    const item = await createCustomItemOnServer(dmUid, body);
    return NextResponse.json({ item });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create custom item.";
    const status = message.includes("required") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
