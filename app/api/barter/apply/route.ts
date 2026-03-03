import { NextResponse } from "next/server";

import { applyBarterRequest, type ApplyBarterRequest } from "@/lib/barter/server";

export async function POST(request: Request) {
  let body: ApplyBarterRequest;

  try {
    body = (await request.json()) as ApplyBarterRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  try {
    const result = await applyBarterRequest(request.headers.get("cookie"), body);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to apply barter transaction.";
    const status =
      message === "A DM login session is required."
        ? 401
        : message.includes("required") || message.includes("Select") || message.includes("non-zero")
          ? 400
          : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
