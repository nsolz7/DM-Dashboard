import { NextResponse } from "next/server";

import { listRecentCurrencyTransactions } from "@/lib/barter/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const campaignId = url.searchParams.get("campaignId") ?? "";
  const playerId = url.searchParams.get("playerId");
  const limitValue = Number.parseInt(url.searchParams.get("limit") ?? "20", 10);

  try {
    const rows = await listRecentCurrencyTransactions(request.headers.get("cookie"), {
      campaignId,
      playerId,
      limit: Number.isFinite(limitValue) ? limitValue : 20
    });

    return NextResponse.json({ items: rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load barter transactions.";
    const status = message === "A DM login session is required." ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
