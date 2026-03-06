import { NextResponse } from "next/server";

import { getAuthSessionUid, hasAuthSession } from "@/lib/firebase/authSession";
import { toStringValue } from "@/lib/utils";
import { createCampaignTransaction } from "@/src/lib/transactions/create";
import { getDmRecipientKey } from "@/src/lib/transactions/recipientKeys";
import type { TransactionCategory, TransactionKind, TransactionPrompt } from "@/src/types/transactions";

interface CreateTransactionRequestBody {
  campaignId: string;
  title: string;
  body: string;
  kind?: TransactionKind;
  category?: TransactionCategory;
  severity?: "neutral" | "success" | "warning" | "danger";
  makePrompt?: boolean;
}

function unauthorized() {
  return NextResponse.json({ error: "A DM login session is required." }, { status: 401 });
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(request: Request) {
  if (!hasAuthSession(request.headers.get("cookie"))) {
    return unauthorized();
  }

  const dmUid = getAuthSessionUid(request.headers.get("cookie"));

  if (!dmUid) {
    return unauthorized();
  }

  let body: CreateTransactionRequestBody;

  try {
    body = (await request.json()) as CreateTransactionRequestBody;
  } catch {
    return badRequest("Invalid JSON payload.");
  }

  const campaignId = toStringValue(body.campaignId);
  const title = toStringValue(body.title);
  const messageBody = toStringValue(body.body);

  if (!campaignId || !title || !messageBody) {
    return badRequest("campaignId, title, and body are required.");
  }

  try {
    const dmKey = getDmRecipientKey(dmUid);
    const prompt: TransactionPrompt | null = body.makePrompt
      ? {
          promptType: "generic_question",
          question: "Acknowledge this test prompt?",
          responseKind: "ack",
          required: true
        }
      : null;

    const txId = await createCampaignTransaction({
      campaignId,
      kind: body.kind ?? (prompt ? "prompt" : "info"),
      category: body.category ?? "message",
      message: {
        title,
        body: messageBody,
        severity: body.severity
      },
      sender: {
        actorType: "system",
        uid: "dm-dashboard-test",
        displayName: "DM Dashboard Test"
      },
      recipientKeys: [dmKey],
      recipients: {
        mode: "single",
        includeDm: true
      },
      recipientStateOverrides: {
        [dmKey]: {
          status: prompt ? "pending_response" : "unread"
        }
      },
      prompt
    });

    return NextResponse.json({ txId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create a test transaction.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
