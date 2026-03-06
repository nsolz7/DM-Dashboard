"use client";

import { getFirebaseClientApp } from "@/lib/firebase/client";
import { isRecord, toStringValue } from "@/lib/utils";
import { getDmRecipientKey } from "@/src/lib/transactions/recipientKeys";
import type {
  TransactionCategory,
  TransactionDoc,
  TransactionKind,
  TransactionPrompt,
  TransactionPromptChoice,
  TransactionRecipientStateEntry,
  TransactionRecipients,
  TransactionResponseKind,
  TransactionSender,
  TransactionSeverity,
  TransactionStatus
} from "@/src/types/transactions";

type Unsubscribe = () => void;

interface SnapshotLike {
  id: string;
  data(): Record<string, unknown>;
}

async function loadFirestoreModule() {
  return import("firebase/firestore");
}

function toDate(value: unknown): Date | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  if (isRecord(value) && typeof value.toDate === "function") {
    const date = value.toDate() as Date;
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

function isTransactionKind(value: string | null): value is TransactionKind {
  return value === "info" || value === "prompt" || value === "transaction";
}

function isTransactionCategory(value: string | null): value is TransactionCategory {
  return (
    value === "system" ||
    value === "barter" ||
    value === "level_up" ||
    value === "compendium_assign" ||
    value === "loot" ||
    value === "equip" ||
    value === "message"
  );
}

function isTransactionSeverity(value: string | null): value is TransactionSeverity {
  return value === "neutral" || value === "success" || value === "warning" || value === "danger";
}

function isTransactionStatus(value: string | null): value is TransactionStatus {
  return value === "unread" || value === "read" || value === "pending_response" || value === "responded" || value === "closed";
}

function isResponseKind(value: string | null): value is TransactionResponseKind {
  return value === "single_choice" || value === "free_text" || value === "ack";
}

function mapPromptChoice(value: unknown): TransactionPromptChoice | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = toStringValue(value.id);
  const label = toStringValue(value.label);

  if (!id || !label) {
    return null;
  }

  return { id, label };
}

function mapPrompt(value: unknown): TransactionPrompt | null {
  if (!isRecord(value)) {
    return null;
  }

  const promptType = toStringValue(value.promptType);
  const question = toStringValue(value.question);
  const responseKind = toStringValue(value.responseKind);

  if (!promptType || !question) {
    return null;
  }

  return {
    promptType: promptType as TransactionPrompt["promptType"],
    question,
    choices: Array.isArray(value.choices)
      ? value.choices
          .map(mapPromptChoice)
          .filter((choice): choice is TransactionPromptChoice => Boolean(choice))
      : undefined,
    allowFreeText: value.allowFreeText === true,
    required: value.required === true,
    responseKind: isResponseKind(responseKind) ? responseKind : undefined
  };
}

function mapRecipientState(value: unknown): Record<string, TransactionRecipientStateEntry> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.entries(value).reduce<Record<string, TransactionRecipientStateEntry>>((accumulator, [key, entry]) => {
    if (!isRecord(entry)) {
      return accumulator;
    }

    const status = toStringValue(entry.status);

    if (!isTransactionStatus(status)) {
      return accumulator;
    }

    accumulator[key] = {
      status,
      deliveredAt: toDate(entry.deliveredAt),
      readAt: toDate(entry.readAt),
      respondedAt: toDate(entry.respondedAt),
      response: isRecord(entry.response)
        ? {
            choiceId: toStringValue(entry.response.choiceId) ?? undefined,
            choiceLabel: toStringValue(entry.response.choiceLabel) ?? undefined,
            text: toStringValue(entry.response.text) ?? undefined
          }
        : undefined
    };

    return accumulator;
  }, {});
}

function mapRecipients(value: unknown): TransactionRecipients {
  if (!isRecord(value)) {
    return {
      mode: "single"
    };
  }

  const mode = toStringValue(value.mode);

  return {
    mode: mode === "multi" || mode === "party" ? mode : "single",
    playerIds: Array.isArray(value.playerIds)
      ? value.playerIds
          .map((entry) => toStringValue(entry))
          .filter((entry): entry is string => Boolean(entry))
      : undefined,
    includeDm: value.includeDm === true
  };
}

function mapSender(value: unknown): TransactionSender {
  if (!isRecord(value)) {
    return {
      actorType: "system"
    };
  }

  const actorType = toStringValue(value.actorType);

  return {
    actorType: actorType === "dm" || actorType === "player" ? actorType : "system",
    uid: toStringValue(value.uid) ?? undefined,
    playerId: toStringValue(value.playerId) ?? undefined,
    displayName: toStringValue(value.displayName) ?? undefined
  };
}

function mapTransaction(snapshot: SnapshotLike, campaignId: string): TransactionDoc {
  const data = snapshot.data();
  const kind = toStringValue(data.kind);
  const category = toStringValue(data.category);
  const message = isRecord(data.message) ? data.message : {};
  const severity = toStringValue(message.severity);

  return {
    id: snapshot.id,
    campaignId,
    schemaVersion: 1,
    kind: isTransactionKind(kind) ? kind : "info",
    category: isTransactionCategory(category) ? category : "message",
    message: {
      title: toStringValue(message.title) ?? "Untitled",
      body: toStringValue(message.body) ?? "",
      severity: isTransactionSeverity(severity) ? severity : undefined,
      icon: toStringValue(message.icon) ?? undefined
    },
    sender: mapSender(data.sender),
    recipientKeys: Array.isArray(data.recipientKeys)
      ? data.recipientKeys
          .map((entry) => toStringValue(entry))
          .filter((entry): entry is string => Boolean(entry))
      : [],
    recipients: mapRecipients(data.recipients),
    recipientState: mapRecipientState(data.recipientState),
    prompt: data.prompt === null ? null : mapPrompt(data.prompt),
    payload: isRecord(data.payload) ? data.payload : undefined,
    related: isRecord(data.related) ? data.related : undefined,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
    expiresAt: toDate(data.expiresAt)
  };
}

function sortByCreatedAtDesc(items: TransactionDoc[]): TransactionDoc[] {
  return [...items].sort((left, right) => {
    const rightTime = right.createdAt?.getTime() ?? 0;
    const leftTime = left.createdAt?.getTime() ?? 0;
    return rightTime - leftTime;
  });
}

export function getTransactionRecipientState(
  transaction: TransactionDoc,
  recipientKey: string
): TransactionRecipientStateEntry | null {
  return transaction.recipientState[recipientKey] ?? null;
}

export function sortTransactionsForDropdown(
  transactions: TransactionDoc[],
  recipientKey: string
): TransactionDoc[] {
  return [...transactions].sort((left, right) => {
    const leftUnread = getTransactionRecipientState(left, recipientKey)?.status === "unread";
    const rightUnread = getTransactionRecipientState(right, recipientKey)?.status === "unread";

    if (leftUnread !== rightUnread) {
      return leftUnread ? -1 : 1;
    }

    const rightTime = right.createdAt?.getTime() ?? 0;
    const leftTime = left.createdAt?.getTime() ?? 0;
    return rightTime - leftTime;
  });
}

async function subscribeTransactions(
  campaignId: string,
  dmUid: string,
  limitCount: number,
  callback: (transactions: TransactionDoc[]) => void,
  onError?: (error: Error) => void
): Promise<Unsubscribe> {
  const { collection, getFirestore, limit, onSnapshot, orderBy, query, where } = await loadFirestoreModule();
  const db = getFirestore(getFirebaseClientApp());
  const recipientKey = getDmRecipientKey(dmUid);
  const collectionRef = collection(db, "campaigns", campaignId, "transactions");
  const orderedQuery = query(
    collectionRef,
    where("recipientKeys", "array-contains", recipientKey),
    orderBy("createdAt", "desc"),
    limit(limitCount)
  );
  const fallbackQuery = query(
    collectionRef,
    where("recipientKeys", "array-contains", recipientKey),
    limit(Math.max(limitCount * 3, 30))
  );

  const mapSnapshot = (snapshot: { docs: SnapshotLike[] }, trimLimit = limitCount) => {
    const items = snapshot.docs.map((document) => mapTransaction(document, campaignId));
    callback(sortByCreatedAtDesc(items).slice(0, trimLimit));
  };

  let unsubscribe: Unsubscribe = () => undefined;
  let fallbackAttached = false;

  const attachFallback = () => {
    fallbackAttached = true;
    unsubscribe = onSnapshot(
      fallbackQuery,
      (snapshot) => {
        mapSnapshot(snapshot);
      },
      (fallbackError) => {
        if (onError) {
          onError(fallbackError);
        } else {
          console.error("Fallback transaction subscription failed.", fallbackError);
        }
      }
    );
  };

  unsubscribe = onSnapshot(
    orderedQuery,
    (snapshot) => {
      mapSnapshot(snapshot);
    },
    (error) => {
      if (!fallbackAttached && error.code === "failed-precondition") {
        console.warn("Transactions query missing composite index; using fallback query without orderBy.");
        unsubscribe();
        attachFallback();
        return;
      }

      if (onError) {
        onError(error);
      } else {
        console.error("Transaction subscription failed.", error);
      }
    }
  );

  return () => {
    unsubscribe();
  };
}

export function subscribeTransactionsForDm(
  campaignId: string,
  dmUid: string,
  limitCount = 50,
  callback: (transactions: TransactionDoc[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  if (!campaignId || !dmUid) {
    callback([]);
    return () => undefined;
  }

  let unsubscribe: Unsubscribe = () => undefined;
  let active = true;

  void subscribeTransactions(campaignId, dmUid, limitCount, callback, onError).then((listener) => {
    if (!active) {
      listener();
      return;
    }

    unsubscribe = listener;
  });

  return () => {
    active = false;
    unsubscribe();
  };
}

export function subscribeRecentTransactionsForDm(
  campaignId: string,
  dmUid: string,
  limitCount = 10,
  callback: (transactions: TransactionDoc[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  return subscribeTransactionsForDm(campaignId, dmUid, limitCount, callback, onError);
}

export function countUnreadForDm(
  campaignId: string,
  dmUid: string,
  callback: (count: number) => void,
  limitCount = 100,
  onError?: (error: Error) => void
): Unsubscribe {
  return subscribeTransactionsForDm(
    campaignId,
    dmUid,
    limitCount,
    (transactions) => {
      const recipientKey = getDmRecipientKey(dmUid);
      callback(
        transactions.filter((transaction) => getTransactionRecipientState(transaction, recipientKey)?.status === "unread").length
      );
    },
    onError
  );
}
