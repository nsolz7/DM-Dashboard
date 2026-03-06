import { NextResponse } from "next/server";

import { listRecentLootDrops } from "@/lib/loot/server";
import { toStringValue } from "@/lib/utils";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const campaignId = toStringValue(url.searchParams.get("campaignId"));
  const limitRaw = Number.parseInt(url.searchParams.get("limit") ?? "20", 10);
  const limit = Number.isFinite(limitRaw) ? limitRaw : 20;

  if (!campaignId) {
    return NextResponse.json({ error: "campaignId is required." }, { status: 400 });
  }

  try {
    const drops = await listRecentLootDrops(request.headers.get("cookie"), {
      campaignId,
      limit
    });
    return NextResponse.json({ drops });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load loot drops.";
    const status = message === "A DM login session is required." ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
