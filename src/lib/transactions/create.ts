import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";

import { initializeAdminForServer } from "@/lib/admin/firebaseAdmin";
import type {
  TransactionCategory,
  TransactionDoc,
  TransactionKind,
  TransactionMessage,
  TransactionPrompt,
  TransactionRecipientStateEntry,
  TransactionRecipients,
  TransactionSender,
  TransactionStatus
} from "@/src/types/transactions";

export interface CreateCampaignTransactionInput {
  campaignId: string;
  kind: TransactionKind;
  category: TransactionCategory;
  message: TransactionMessage;
  sender: TransactionSender;
  recipientKeys: string[];
  recipients: TransactionRecipients;
  recipientStateOverrides?: Partial<Record<string, Partial<TransactionRecipientStateEntry>>>;
  prompt?: TransactionPrompt | null;
  payload?: TransactionDoc["payload"];
  related?: TransactionDoc["related"];
  expiresAt?: Date | Timestamp | null;
}

function dedupeRecipientKeys(keys: string[]): string[] {
  const unique = new Set(
    keys
      .map((key) => key.trim())
      .filter((key) => key.length > 0)
  );

  return Array.from(unique);
}

function defaultRecipientStatus(
  prompt: TransactionPrompt | null | undefined,
  sender: TransactionSender,
  recipientKey: string
): TransactionStatus {
  if (sender.actorType === "dm" && recipientKey.startsWith("dm_")) {
    return "read";
  }

  if (prompt) {
    return "pending_response";
  }

  return "unread";
}

function buildRecipientState(
  input: CreateCampaignTransactionInput
): Record<string, Record<string, unknown>> {
  const state = input.recipientKeys.reduce<Record<string, Record<string, unknown>>>((accumulator, recipientKey) => {
    const override = input.recipientStateOverrides?.[recipientKey] ?? {};
    const status = override.status ?? defaultRecipientStatus(input.prompt, input.sender, recipientKey);
    const nextEntry: Record<string, unknown> = {
      status,
      deliveredAt: FieldValue.serverTimestamp()
    };

    if (status === "read") {
      nextEntry.readAt = FieldValue.serverTimestamp();
    }

    if (status === "responded") {
      nextEntry.readAt = FieldValue.serverTimestamp();
      nextEntry.respondedAt = FieldValue.serverTimestamp();
    }

    if (override.readAt) {
      nextEntry.readAt = override.readAt;
    }

    if (override.respondedAt) {
      nextEntry.respondedAt = override.respondedAt;
    }

    if (override.response) {
      nextEntry.response = override.response;
    }

    accumulator[recipientKey] = nextEntry;
    return accumulator;
  }, {});

  return state;
}

export async function createCampaignTransaction(input: CreateCampaignTransactionInput): Promise<string> {
  const campaignId = input.campaignId.trim();

  if (!campaignId) {
    throw new Error("campaignId is required for transaction creation.");
  }

  const recipientKeys = dedupeRecipientKeys(input.recipientKeys);

  if (!recipientKeys.length) {
    throw new Error("At least one recipientKey is required for transaction creation.");
  }

  const initialized = await initializeAdminForServer();
  const db = getFirestore(initialized.app);
  const ref = db.collection("campaigns").doc(campaignId).collection("transactions").doc();

  const baseDoc: Record<string, unknown> = {
    schemaVersion: 1,
    kind: input.kind,
    category: input.category,
    message: input.message,
    sender: input.sender,
    recipientKeys,
    recipients: input.recipients,
    recipientState: buildRecipientState({
      ...input,
      recipientKeys
    }),
    prompt: input.prompt ?? null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  };

  if (input.payload) {
    baseDoc.payload = input.payload;
  }

  if (input.related) {
    baseDoc.related = input.related;
  }

  if (input.expiresAt) {
    baseDoc.expiresAt = input.expiresAt;
  }

  await ref.set(baseDoc);

  return ref.id;
}

export async function safeCreateCampaignTransaction(input: CreateCampaignTransactionInput): Promise<string | null> {
  try {
    return await createCampaignTransaction(input);
  } catch (error) {
    console.error("Unable to create campaign transaction.", error);
    return null;
  }
}
