import { NextResponse } from "next/server";

import { reverseBarterRequest, type ReverseBarterRequest } from "@/lib/barter/server";

export async function POST(request: Request) {
  let body: ReverseBarterRequest;

  try {
    body = (await request.json()) as ReverseBarterRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  try {
    const result = await reverseBarterRequest(request.headers.get("cookie"), body);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to reverse barter transaction.";
    const status =
      message === "A DM login session is required."
        ? 401
        : message.includes("required") || message.includes("already been reversed") || message.includes("could not be found")
          ? 400
          : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
