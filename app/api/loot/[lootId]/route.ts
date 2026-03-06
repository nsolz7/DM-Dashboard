import { NextResponse } from "next/server";

import { readLootDrop } from "@/lib/loot/server";
import { toStringValue } from "@/lib/utils";

interface RouteContext {
  params: {
    lootId: string;
  };
}

export async function GET(request: Request, { params }: RouteContext) {
  const campaignId = toStringValue(new URL(request.url).searchParams.get("campaignId"));
  const lootId = toStringValue(params.lootId);

  if (!campaignId || !lootId) {
    return NextResponse.json({ error: "campaignId and lootId are required." }, { status: 400 });
  }

  try {
    const drop = await readLootDrop(request.headers.get("cookie"), {
      campaignId,
      lootId
    });
    return NextResponse.json({ drop });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load this loot drop.";
    const status =
      message === "A DM login session is required."
        ? 401
        : message === "The selected loot drop could not be found."
          ? 404
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
