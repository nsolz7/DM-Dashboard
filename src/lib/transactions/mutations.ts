"use client";

import type { RespondToPromptInput, TransactionStatus } from "@/src/types/transactions";

interface MutationResponse {
  status?: TransactionStatus;
  error?: string;
}

interface MutationBody {
  campaignId: string;
  recipientKey: string;
  action: "mark_read" | "respond" | "close";
  response?: RespondToPromptInput;
}

async function patchTransaction(txId: string, body: MutationBody): Promise<MutationResponse> {
  const response = await fetch(`/api/transactions/${encodeURIComponent(txId)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const payload = (await response.json()) as MutationResponse;

  if (!response.ok) {
    throw new Error(payload.error || "Transaction update failed.");
  }

  return payload;
}

export async function markTransactionRead(campaignId: string, txId: string, recipientKey: string): Promise<MutationResponse> {
  return patchTransaction(txId, {
    campaignId,
    recipientKey,
    action: "mark_read"
  });
}

export async function respondToPrompt(
  campaignId: string,
  txId: string,
  recipientKey: string,
  response: RespondToPromptInput
): Promise<MutationResponse> {
  return patchTransaction(txId, {
    campaignId,
    recipientKey,
    action: "respond",
    response
  });
}

export async function closeTransaction(campaignId: string, txId: string, recipientKey: string): Promise<MutationResponse> {
  return patchTransaction(txId, {
    campaignId,
    recipientKey,
    action: "close"
  });
}
