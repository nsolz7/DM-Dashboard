import { FieldValue, getFirestore } from "firebase-admin/firestore";

import { initializeAdminForServer } from "@/lib/admin/firebaseAdmin";
import { isRecord, toStringValue } from "@/lib/utils";
import { getDmRecipientKey } from "@/src/lib/transactions/recipientKeys";
import type {
  RespondToPromptInput,
  TransactionPrompt,
  TransactionRecipientStateEntry,
  TransactionStatus
} from "@/src/types/transactions";

function normalizePrompt(prompt: unknown): TransactionPrompt | null {
  if (!isRecord(prompt)) {
    return null;
  }

  const promptType = toStringValue(prompt.promptType);
  const question = toStringValue(prompt.question);
  const responseKind = toStringValue(prompt.responseKind);

  if (!promptType || !question) {
    return null;
  }

  return {
    promptType: promptType as TransactionPrompt["promptType"],
    question,
    choices: Array.isArray(prompt.choices)
      ? prompt.choices
          .filter((entry): entry is Record<string, unknown> => isRecord(entry))
          .map((entry) => ({
            id: toStringValue(entry.id) ?? "",
            label: toStringValue(entry.label) ?? ""
          }))
          .filter((entry) => entry.id && entry.label)
      : undefined,
    allowFreeText: prompt.allowFreeText === true,
    required: prompt.required === true,
    responseKind:
      responseKind === "single_choice" || responseKind === "free_text" || responseKind === "ack"
        ? responseKind
        : undefined
  };
}

function normalizeRecipientStateEntry(value: unknown): TransactionRecipientStateEntry | null {
  if (!isRecord(value)) {
    return null;
  }

  const status = toStringValue(value.status);

  if (
    status !== "unread" &&
    status !== "read" &&
    status !== "pending_response" &&
    status !== "responded" &&
    status !== "closed"
  ) {
    return null;
  }

  const entry: TransactionRecipientStateEntry = {
    status
  };

  if (isRecord(value.response)) {
    const choiceId = toStringValue(value.response.choiceId) ?? undefined;
    const choiceLabel = toStringValue(value.response.choiceLabel) ?? undefined;
    const text = toStringValue(value.response.text) ?? undefined;
    const response = {
      ...(choiceId ? { choiceId } : {}),
      ...(choiceLabel ? { choiceLabel } : {}),
      ...(text ? { text } : {})
    };

    if (Object.keys(response).length) {
      entry.response = response;
    }
  }

  return entry;
}

async function loadTransactionContext(campaignId: string, txId: string, dmUid: string) {
  const initialized = await initializeAdminForServer();
  const db = getFirestore(initialized.app);
  const dmRecipientKey = getDmRecipientKey(dmUid);
  const ref = db.collection("campaigns").doc(campaignId).collection("transactions").doc(txId);
  const snapshot = await ref.get();

  if (!snapshot.exists) {
    throw new Error("The selected transaction could not be found.");
  }

  const data = snapshot.data() ?? {};
  const recipientKeys = Array.isArray(data.recipientKeys)
    ? data.recipientKeys
        .map((entry) => toStringValue(entry))
        .filter((entry): entry is string => Boolean(entry))
    : [];

  if (!recipientKeys.includes(dmRecipientKey)) {
    throw new Error("This DM does not have access to the selected transaction.");
  }

  const recipientState = isRecord(data.recipientState) ? data.recipientState : {};

  return {
    db,
    ref,
    dmRecipientKey,
    prompt: data.prompt === null ? null : normalizePrompt(data.prompt),
    currentState: normalizeRecipientStateEntry(recipientState[dmRecipientKey]),
    rawData: data
  };
}

function statusForRead(currentStatus: TransactionStatus | null): TransactionStatus {
  if (currentStatus === "pending_response" || currentStatus === "responded" || currentStatus === "closed") {
    return currentStatus;
  }

  return "read";
}

function validatePromptResponse(prompt: TransactionPrompt, response: RespondToPromptInput): RespondToPromptInput {
  const responseKind = prompt.responseKind ?? "single_choice";

  if (responseKind === "ack") {
    return {};
  }

  if (responseKind === "free_text") {
    const text = response.text?.trim() ?? "";

    if (!text && prompt.required) {
      throw new Error("A response is required.");
    }

    return text ? { text } : {};
  }

  const choiceId = response.choiceId?.trim() ?? "";

  if (!choiceId) {
    throw new Error("Choose an option before submitting.");
  }

  const matchingChoice = prompt.choices?.find((choice) => choice.id === choiceId) ?? null;

  if (!matchingChoice) {
    throw new Error("The selected choice is no longer valid.");
  }

  const text = response.text?.trim() ?? "";

  if (text && !prompt.allowFreeText) {
    return {
      choiceId: matchingChoice.id,
      choiceLabel: matchingChoice.label
    };
  }

  return {
    choiceId: matchingChoice.id,
    choiceLabel: matchingChoice.label,
    ...(text ? { text } : {})
  };
}

export async function markTransactionReadForDm(campaignId: string, txId: string, dmUid: string) {
  if (!campaignId.trim() || !txId.trim() || !dmUid.trim()) {
    throw new Error("campaignId, txId, and dmUid are required.");
  }

  const context = await loadTransactionContext(campaignId, txId, dmUid);
  const status = statusForRead(context.currentState?.status ?? "unread");

  await context.ref.set(
    {
      recipientState: {
        [context.dmRecipientKey]: {
          ...(context.currentState ?? {}),
          status,
          readAt: FieldValue.serverTimestamp()
        }
      },
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  return { status };
}

export async function respondToTransactionPromptForDm(
  campaignId: string,
  txId: string,
  dmUid: string,
  response: RespondToPromptInput
) {
  if (!campaignId.trim() || !txId.trim() || !dmUid.trim()) {
    throw new Error("campaignId, txId, and dmUid are required.");
  }

  const context = await loadTransactionContext(campaignId, txId, dmUid);

  if (!context.prompt) {
    throw new Error("This transaction does not include a prompt.");
  }

  if (context.currentState?.status === "closed") {
    throw new Error("Closed transactions can no longer be updated.");
  }

  const normalizedResponse = validatePromptResponse(context.prompt, response);

  await context.ref.set(
    {
      recipientState: {
        [context.dmRecipientKey]: {
          ...(context.currentState ?? {}),
          status: "responded",
          readAt: FieldValue.serverTimestamp(),
          respondedAt: FieldValue.serverTimestamp(),
          response: normalizedResponse
        }
      },
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  return { status: "responded" as const };
}

export async function closeTransactionForDm(campaignId: string, txId: string, dmUid: string) {
  if (!campaignId.trim() || !txId.trim() || !dmUid.trim()) {
    throw new Error("campaignId, txId, and dmUid are required.");
  }

  const context = await loadTransactionContext(campaignId, txId, dmUid);

  await context.ref.set(
    {
      recipientState: {
        [context.dmRecipientKey]: {
          ...(context.currentState ?? {}),
          status: "closed",
          readAt: FieldValue.serverTimestamp()
        }
      },
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  return { status: "closed" as const };
}
