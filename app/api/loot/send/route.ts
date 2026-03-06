import { NextResponse } from "next/server";

import type { SendLootRequest } from "@/types";
import { sendLootDropRequest } from "@/lib/loot/server";

export async function POST(request: Request) {
  let body: SendLootRequest;

  try {
    body = (await request.json()) as SendLootRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  try {
    const result = await sendLootDropRequest(request.headers.get("cookie"), body);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to send loot drop.";
    const status =
      message === "A DM login session is required."
        ? 401
        : message.includes("required") || message.includes("Unknown") || message.includes("Add at least")
          ? 400
          : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
