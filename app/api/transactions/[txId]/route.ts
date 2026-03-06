import { NextResponse } from "next/server";

import { getAuthSessionUid, hasAuthSession } from "@/lib/firebase/authSession";
import { toStringValue } from "@/lib/utils";
import { getDmRecipientKey } from "@/src/lib/transactions/recipientKeys";
import {
  closeTransactionForDm,
  markTransactionReadForDm,
  respondToTransactionPromptForDm
} from "@/src/lib/transactions/server";
import type { RespondToPromptInput } from "@/src/types/transactions";

interface RouteContext {
  params: {
    txId: string;
  };
}

interface TransactionMutationBody {
  campaignId: string;
  recipientKey: string;
  action: "mark_read" | "respond" | "close";
  response?: RespondToPromptInput;
}

function unauthorized() {
  return NextResponse.json({ error: "A DM login session is required." }, { status: 401 });
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function PATCH(request: Request, { params }: RouteContext) {
  if (!hasAuthSession(request.headers.get("cookie"))) {
    return unauthorized();
  }

  const dmUid = getAuthSessionUid(request.headers.get("cookie"));

  if (!dmUid) {
    return unauthorized();
  }

  const txId = toStringValue(params.txId);

  if (!txId) {
    return badRequest("txId is required.");
  }

  let body: TransactionMutationBody;

  try {
    body = (await request.json()) as TransactionMutationBody;
  } catch {
    return badRequest("Invalid JSON payload.");
  }

  const campaignId = toStringValue(body.campaignId);
  const recipientKey = toStringValue(body.recipientKey);
  const expectedDmKey = getDmRecipientKey(dmUid);

  if (!campaignId || !recipientKey) {
    return badRequest("campaignId and recipientKey are required.");
  }

  if (recipientKey !== expectedDmKey) {
    return NextResponse.json({ error: "recipientKey must match the authenticated DM." }, { status: 403 });
  }

  try {
    if (body.action === "mark_read") {
      const result = await markTransactionReadForDm(campaignId, txId, dmUid);
      return NextResponse.json(result);
    }

    if (body.action === "respond") {
      const result = await respondToTransactionPromptForDm(campaignId, txId, dmUid, body.response ?? {});
      return NextResponse.json(result);
    }

    if (body.action === "close") {
      const result = await closeTransactionForDm(campaignId, txId, dmUid);
      return NextResponse.json(result);
    }

    return badRequest("Unsupported transaction action.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update this transaction.";
    const status =
      message === "The selected transaction could not be found."
        ? 404
        : message === "This DM does not have access to the selected transaction."
          ? 403
          : 400;

    return NextResponse.json({ error: message }, { status });
  }
}
