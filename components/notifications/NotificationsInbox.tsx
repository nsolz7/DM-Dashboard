"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { useNotifications } from "@/components/notifications/NotificationsProvider";
import { useCampaign } from "@/components/providers/CampaignProvider";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { LoadingPanel } from "@/components/shared/LoadingPanel";
import { PixelPanel } from "@/components/ui/PixelPanel";
import { closeTransaction, markTransactionRead, respondToPrompt } from "@/src/lib/transactions/mutations";
import {
  getTransactionRecipientState,
  subscribeTransactionsForDm
} from "@/src/lib/transactions/queries";
import type {
  RespondToPromptInput,
  TransactionDoc,
  TransactionRecipientStateEntry
} from "@/src/types/transactions";

type NotificationFilter = "all" | "unread" | "pending" | "sent";

const filterOptions: Array<{ id: NotificationFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "pending", label: "Pending Response" },
  { id: "sent", label: "Sent" }
];

function formatTimestamp(value: Date | null) {
  if (!value) {
    return "Pending";
  }

  return value.toLocaleString();
}

function previewText(body: string, maxLength = 120) {
  if (body.length <= maxLength) {
    return body;
  }

  return `${body.slice(0, maxLength).trimEnd()}...`;
}

function statusLabel(status: string | null | undefined) {
  return (status ?? "unread").replace(/_/g, " ");
}

function mapReadState(current: TransactionRecipientStateEntry | null): TransactionRecipientStateEntry {
  return {
    ...(current ?? { status: "read" }),
    status: current?.status === "unread" ? "read" : current?.status ?? "read",
    readAt: new Date()
  };
}

function updateTransactionState(
  transactions: TransactionDoc[],
  txId: string,
  recipientKey: string,
  updater: (current: TransactionRecipientStateEntry | null) => TransactionRecipientStateEntry
) {
  return transactions.map((transaction) => {
    if (transaction.id !== txId) {
      return transaction;
    }

    return {
      ...transaction,
      updatedAt: new Date(),
      recipientState: {
        ...transaction.recipientState,
        [recipientKey]: updater(getTransactionRecipientState(transaction, recipientKey))
      }
    };
  });
}

export function NotificationsInbox() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { campaignId } = useCampaign();
  const { dmUid, dmRecipientKey } = useNotifications();
  const [transactions, setTransactions] = useState<TransactionDoc[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<NotificationFilter>("all");
  const [choiceId, setChoiceId] = useState<string>("");
  const [freeText, setFreeText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [testTitle, setTestTitle] = useState("Test Notification");
  const [testBody, setTestBody] = useState("This is a DM test transaction from the dashboard.");
  const [isSendingTest, setIsSendingTest] = useState(false);

  useEffect(() => {
    if (!campaignId || !dmUid) {
      setTransactions([]);
      setIsLoading(false);
      setError(!dmUid ? "Sign in again to load DM notifications." : null);
      return;
    }

    setIsLoading(true);
    setError(null);

    return subscribeTransactionsForDm(
      campaignId,
      dmUid,
      50,
      (items) => {
        setTransactions(items);
        setIsLoading(false);
      },
      (subscriptionError) => {
        setError(subscriptionError.message);
        setIsLoading(false);
      }
    );
  }, [campaignId, dmUid]);

  const filteredTransactions = useMemo(() => {
    if (!dmRecipientKey) {
      return transactions;
    }

    return transactions.filter((transaction) => {
      const state = getTransactionRecipientState(transaction, dmRecipientKey);
      const status = state?.status ?? "unread";

      if (activeFilter === "unread") {
        return status === "unread";
      }

      if (activeFilter === "pending") {
        return status === "pending_response";
      }

      if (activeFilter === "sent") {
        return transaction.sender.uid === dmUid;
      }

      return true;
    });
  }, [activeFilter, dmRecipientKey, dmUid, transactions]);

  useEffect(() => {
    const txParam = searchParams.get("tx");

    if (txParam && transactions.some((transaction) => transaction.id === txParam)) {
      setActiveId(txParam);
      return;
    }

    if (activeId && transactions.some((transaction) => transaction.id === activeId)) {
      return;
    }

    setActiveId(transactions[0]?.id ?? null);
  }, [activeId, searchParams, transactions]);

  const activeTransaction = useMemo(
    () => transactions.find((transaction) => transaction.id === activeId) ?? null,
    [activeId, transactions]
  );

  useEffect(() => {
    if (!activeTransaction?.prompt) {
      setChoiceId("");
      setFreeText("");
      return;
    }

    setChoiceId(activeTransaction.prompt.choices?.[0]?.id ?? "");
    setFreeText("");
  }, [activeTransaction?.id, activeTransaction?.prompt]);

  useEffect(() => {
    if (!activeTransaction || !dmRecipientKey) {
      return;
    }

    const state = getTransactionRecipientState(activeTransaction, dmRecipientKey);

    if (state?.status !== "unread") {
      return;
    }

    void markTransactionRead(campaignId, activeTransaction.id, dmRecipientKey)
      .then(() => {
        setTransactions((current) => updateTransactionState(current, activeTransaction.id, dmRecipientKey, mapReadState));
      })
      .catch((markError) => {
        setActionError(markError instanceof Error ? markError.message : "Unable to mark this transaction as read.");
      });
  }, [activeTransaction, campaignId, dmRecipientKey]);

  function selectTransaction(txId: string) {
    setActiveId(txId);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tx", txId);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    setActionError(null);
    setActionMessage(null);
  }

  async function handleRespond() {
    if (!activeTransaction?.prompt || !dmRecipientKey) {
      return;
    }

    const prompt = activeTransaction.prompt;
    const responseKind = prompt.responseKind ?? "single_choice";
    const response: RespondToPromptInput = {};

    if (responseKind === "single_choice") {
      const selectedChoice = prompt.choices?.find((choice) => choice.id === choiceId) ?? null;

      if (!selectedChoice) {
        setActionError("Choose an option before submitting.");
        return;
      }

      response.choiceId = selectedChoice.id;
      response.choiceLabel = selectedChoice.label;

      if (prompt.allowFreeText && freeText.trim()) {
        response.text = freeText.trim();
      }
    } else if (responseKind === "free_text") {
      response.text = freeText.trim();
    }

    setIsSubmitting(true);
    setActionError(null);
    setActionMessage(null);

    try {
      await respondToPrompt(campaignId, activeTransaction.id, dmRecipientKey, response);
      setTransactions((current) =>
        updateTransactionState(current, activeTransaction.id, dmRecipientKey, () => ({
          status: "responded",
          readAt: new Date(),
          respondedAt: new Date(),
          response
        }))
      );
      setActionMessage("Response submitted.");
    } catch (submitError) {
      setActionError(submitError instanceof Error ? submitError.message : "Unable to submit this response.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleClose() {
    if (!activeTransaction || !dmRecipientKey) {
      return;
    }

    setIsSubmitting(true);
    setActionError(null);
    setActionMessage(null);

    try {
      await closeTransaction(campaignId, activeTransaction.id, dmRecipientKey);
      setTransactions((current) =>
        updateTransactionState(current, activeTransaction.id, dmRecipientKey, (currentState) => ({
          ...(currentState ?? { status: "closed" }),
          status: "closed",
          readAt: new Date()
        }))
      );
      setActionMessage("Transaction closed.");
    } catch (closeError) {
      setActionError(closeError instanceof Error ? closeError.message : "Unable to close this transaction.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSendTest(makePrompt: boolean) {
    setIsSendingTest(true);
    setActionError(null);
    setActionMessage(null);

    try {
      const response = await fetch("/api/transactions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          campaignId,
          title: testTitle.trim() || "Test Notification",
          body: testBody.trim() || "This is a DM test transaction from the dashboard.",
          category: "message",
          kind: makePrompt ? "prompt" : "info",
          severity: makePrompt ? "warning" : "neutral",
          makePrompt
        })
      });
      const payload = (await response.json()) as { txId?: string; error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "Unable to send test notification.");
      }

      setActionMessage(makePrompt ? "Test prompt notification sent." : "Test notification sent.");
      setActiveFilter("all");

      if (payload.txId) {
        selectTransaction(payload.txId);
      }
    } catch (sendError) {
      setActionError(sendError instanceof Error ? sendError.message : "Unable to send test notification.");
    } finally {
      setIsSendingTest(false);
    }
  }

  if (isLoading) {
    return <LoadingPanel label="Loading notifications..." />;
  }

  if (error) {
    return <ErrorState body={error} />;
  }

  if (!dmRecipientKey) {
    return <ErrorState body="No DM recipient key is available. Sign in again to continue." />;
  }

  if (!transactions.length) {
    return <EmptyState body="No transactions have been recorded for this campaign yet." title="Notifications Empty" />;
  }

  const activeState = activeTransaction ? getTransactionRecipientState(activeTransaction, dmRecipientKey) : null;
  const responseKind = activeTransaction?.prompt?.responseKind ?? "single_choice";
  const canRespond =
    Boolean(activeTransaction?.prompt) && activeState?.status !== "responded" && activeState?.status !== "closed";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.35em] text-crt-accent">Transactions</p>
          <h2 className="mt-2 text-3xl font-bold uppercase tracking-[0.12em] text-crt-text">Notifications Inbox</h2>
          <p className="mt-2 text-sm text-crt-muted">Campaign-scoped DM inbox synced from Firestore transactions.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {filterOptions.map((option) => (
            <button
              className={`border-2 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em] transition ${
                activeFilter === option.id
                  ? "border-crt-accent bg-crt-accent text-crt-bg"
                  : "border-crt-border bg-crt-panel text-crt-text hover:border-crt-accent"
              }`}
              key={option.id}
              onClick={() => setActiveFilter(option.id)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <PixelPanel className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-crt-accent">Send Test Notification</p>
          <p className="text-xs text-crt-muted">Creates a transaction doc under this campaign for quick verification.</p>
        </div>
        <div className="grid gap-3 xl:grid-cols-[1fr_1fr_auto_auto]">
          <input
            className="border-2 border-crt-border bg-crt-panel-2 px-3 py-2 text-sm text-crt-text outline-none transition focus:border-crt-accent"
            onChange={(event) => setTestTitle(event.target.value)}
            placeholder="Test title"
            value={testTitle}
          />
          <input
            className="border-2 border-crt-border bg-crt-panel-2 px-3 py-2 text-sm text-crt-text outline-none transition focus:border-crt-accent"
            onChange={(event) => setTestBody(event.target.value)}
            placeholder="Test body"
            value={testBody}
          />
          <button
            className="border-2 border-crt-accent bg-crt-panel px-4 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-crt-accent transition hover:bg-crt-accent hover:text-crt-bg disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSendingTest}
            onClick={() => void handleSendTest(false)}
            type="button"
          >
            {isSendingTest ? "Sending..." : "Send Info"}
          </button>
          <button
            className="border-2 border-yellow-500 bg-crt-panel px-4 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-yellow-400 transition hover:bg-yellow-500 hover:text-crt-bg disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSendingTest}
            onClick={() => void handleSendTest(true)}
            type="button"
          >
            {isSendingTest ? "Sending..." : "Send Prompt"}
          </button>
        </div>
      </PixelPanel>

      {actionError ? (
        <div className="border-2 border-crt-danger bg-crt-panel px-4 py-3 text-xs font-bold uppercase tracking-[0.16em] text-crt-danger">
          {actionError}
        </div>
      ) : null}
      {actionMessage ? (
        <div className="border-2 border-crt-accent bg-crt-panel px-4 py-3 text-xs font-bold uppercase tracking-[0.16em] text-crt-accent">
          {actionMessage}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <PixelPanel className="min-h-[420px] overflow-hidden p-0">
          <div className="border-b border-crt-border px-4 py-3 text-[10px] font-bold uppercase tracking-[0.22em] text-crt-muted">
            {filteredTransactions.length} visible
          </div>
          <div className="max-h-[70vh] overflow-y-auto">
            {filteredTransactions.length ? (
              <div className="grid gap-px bg-crt-border">
                {filteredTransactions.map((transaction) => {
                  const state = getTransactionRecipientState(transaction, dmRecipientKey);
                  const isActive = transaction.id === activeTransaction?.id;

                  return (
                    <button
                      className={`border-l-2 px-4 py-4 text-left transition ${
                        isActive
                          ? "border-crt-accent bg-crt-panel-2"
                          : "border-transparent bg-crt-panel hover:bg-crt-panel-2"
                      }`}
                      key={transaction.id}
                      onClick={() => selectTransaction(transaction.id)}
                      type="button"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="min-w-0 text-sm font-bold uppercase tracking-[0.08em] text-crt-text">
                          {transaction.message.title}
                        </p>
                        <span className="shrink-0 text-[10px] uppercase tracking-[0.16em] text-crt-muted">
                          {statusLabel(state?.status)}
                        </span>
                      </div>
                      <p className="mt-2 text-[10px] uppercase tracking-[0.18em] text-crt-accent">
                        {transaction.category.replace(/_/g, " ")}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-crt-muted">{previewText(transaction.message.body)}</p>
                      <p className="mt-2 text-[10px] uppercase tracking-[0.16em] text-crt-muted">
                        {formatTimestamp(transaction.createdAt)}
                      </p>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="px-4 py-5 text-sm text-crt-muted">No transactions match the selected filter.</div>
            )}
          </div>
        </PixelPanel>

        <PixelPanel className="min-h-[420px] space-y-5">
          {activeTransaction ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-crt-accent">
                    {activeTransaction.category.replace(/_/g, " ")}
                  </p>
                  <h3 className="mt-2 text-2xl font-bold uppercase tracking-[0.1em] text-crt-text">
                    {activeTransaction.message.title}
                  </h3>
                </div>
                <div className="text-right text-[10px] uppercase tracking-[0.16em] text-crt-muted">
                  <div>{statusLabel(activeState?.status)}</div>
                  <div className="mt-1">{formatTimestamp(activeTransaction.createdAt)}</div>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
                <div className="space-y-4">
                  <div className="border-2 border-crt-border bg-crt-panel-2 px-4 py-4">
                    <p className="text-sm leading-7 text-crt-muted">{activeTransaction.message.body}</p>
                  </div>

                  {activeTransaction.prompt ? (
                    <div className="space-y-4 border-2 border-crt-border bg-crt-panel-2 px-4 py-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-crt-accent">Prompt</p>
                        <span className="text-[10px] uppercase tracking-[0.16em] text-crt-muted">
                          {activeTransaction.prompt.promptType.replace(/_/g, " ")}
                        </span>
                      </div>
                      <p className="text-sm leading-7 text-crt-text">{activeTransaction.prompt.question}</p>

                      {responseKind === "single_choice" && activeTransaction.prompt.choices?.length ? (
                        <div className="grid gap-2">
                          {activeTransaction.prompt.choices.map((choice) => (
                            <label
                              className="flex items-center gap-3 border border-crt-border px-3 py-3 text-sm text-crt-muted"
                              key={choice.id}
                            >
                              <input
                                checked={choiceId === choice.id}
                                className="pixel-choice"
                                disabled={!canRespond || isSubmitting}
                                name={`tx-${activeTransaction.id}-choice`}
                                onChange={() => setChoiceId(choice.id)}
                                type="radio"
                              />
                              <span>{choice.label}</span>
                            </label>
                          ))}
                        </div>
                      ) : null}

                      {(responseKind === "free_text" || activeTransaction.prompt.allowFreeText) ? (
                        <textarea
                          className="min-h-[120px] w-full border-2 border-crt-border bg-crt-panel px-3 py-3 text-sm text-crt-text outline-none transition focus:border-crt-accent"
                          disabled={!canRespond || isSubmitting}
                          onChange={(event) => setFreeText(event.target.value)}
                          placeholder="Type your response..."
                          value={freeText}
                        />
                      ) : null}

                      {activeState?.response ? (
                        <div className="border border-crt-border bg-crt-panel px-3 py-3 text-sm text-crt-muted">
                          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-crt-accent">Recorded Response</p>
                          {activeState.response.choiceLabel ? <p className="mt-2">{activeState.response.choiceLabel}</p> : null}
                          {activeState.response.text ? <p className="mt-2 whitespace-pre-wrap">{activeState.response.text}</p> : null}
                        </div>
                      ) : null}

                      <div className="flex flex-wrap gap-2">
                        {canRespond ? (
                          <button
                            className="border-2 border-crt-accent bg-crt-panel px-4 py-3 text-[10px] font-bold uppercase tracking-[0.18em] text-crt-accent transition hover:bg-crt-accent hover:text-crt-bg disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={isSubmitting}
                            onClick={() => void handleRespond()}
                            type="button"
                          >
                            {responseKind === "ack" ? "Acknowledge" : isSubmitting ? "Submitting..." : "Submit Response"}
                          </button>
                        ) : null}
                        <button
                          className="border-2 border-crt-border bg-crt-panel px-4 py-3 text-[10px] font-bold uppercase tracking-[0.18em] text-crt-text transition hover:border-crt-accent disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={isSubmitting || activeState?.status === "closed"}
                          onClick={() => void handleClose()}
                          type="button"
                        >
                          Close
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <button
                        className="border-2 border-crt-border bg-crt-panel px-4 py-3 text-[10px] font-bold uppercase tracking-[0.18em] text-crt-text transition hover:border-crt-accent disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={isSubmitting || activeState?.status === "closed"}
                        onClick={() => void handleClose()}
                        type="button"
                      >
                        Close
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-4 text-sm text-crt-muted">
                  <div className="border border-crt-border px-4 py-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-crt-accent">Sender</p>
                    <p className="mt-2">{activeTransaction.sender.displayName ?? activeTransaction.sender.actorType}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.14em] text-crt-muted">
                      {activeTransaction.sender.actorType}
                      {activeTransaction.sender.playerId ? ` / ${activeTransaction.sender.playerId}` : ""}
                    </p>
                  </div>

                  <div className="border border-crt-border px-4 py-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-crt-accent">Recipients</p>
                    <p className="mt-2">
                      {activeTransaction.recipientKeys.length ? activeTransaction.recipientKeys.join(", ") : "—"}
                    </p>
                    <p className="mt-2 text-xs uppercase tracking-[0.14em] text-crt-muted">
                      {activeTransaction.recipients.mode}
                    </p>
                  </div>

                  {activeTransaction.related?.route ? (
                    <div className="border border-crt-border px-4 py-4">
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-crt-accent">Related</p>
                      <Link className="mt-2 inline-block text-sm text-crt-accent underline" href={activeTransaction.related.route}>
                        {activeTransaction.related.route}
                      </Link>
                    </div>
                  ) : null}

                  {(activeTransaction.payload?.entityType || activeTransaction.payload?.entityId) ? (
                    <div className="border border-crt-border px-4 py-4">
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-crt-accent">Payload</p>
                      <p className="mt-2">
                        {activeTransaction.payload?.entityType ?? "entity"} / {activeTransaction.payload?.entityId ?? "—"}
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>
            </>
          ) : (
            <EmptyState body="Choose a transaction from the inbox to inspect its details." title="No Transaction Selected" />
          )}
        </PixelPanel>
      </div>
    </div>
  );
}
