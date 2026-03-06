"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { useRouter } from "next/navigation";

import { useCampaign } from "@/components/providers/CampaignProvider";
import { getAuthSessionUidFromBrowser } from "@/lib/firebase/authSession";
import { getDmRecipientKey } from "@/src/lib/transactions/recipientKeys";
import {
  getTransactionRecipientState,
  sortTransactionsForDropdown,
  subscribeRecentTransactionsForDm
} from "@/src/lib/transactions/queries";
import type { TransactionDoc } from "@/src/types/transactions";

interface NotificationToast {
  id: string;
  transaction: TransactionDoc;
}

interface NotificationsContextValue {
  dmUid: string | null;
  dmRecipientKey: string | null;
  recentTransactions: TransactionDoc[];
  dropdownTransactions: TransactionDoc[];
  unreadCount: number;
  error: string | null;
  openTransaction: (txId: string) => void;
}

interface NotificationsProviderProps {
  children: ReactNode;
}

const RECENT_TOAST_WINDOW_MS = 1000 * 60 * 10;
const TOAST_DURATION_MS = 8000;

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

function severityClasses(severity: TransactionDoc["message"]["severity"]) {
  if (severity === "danger") {
    return "border-crt-danger";
  }

  if (severity === "warning") {
    return "border-yellow-500";
  }

  if (severity === "success") {
    return "border-crt-accent";
  }

  return "border-crt-border";
}

function isUnreadForRecipient(transaction: TransactionDoc, recipientKey: string) {
  return getTransactionRecipientState(transaction, recipientKey)?.status === "unread";
}

function shouldToast(transaction: TransactionDoc, recipientKey: string, now: number) {
  if (!isUnreadForRecipient(transaction, recipientKey)) {
    return false;
  }

  const createdAtMs = transaction.createdAt?.getTime() ?? 0;

  if (!createdAtMs) {
    return false;
  }

  return now - createdAtMs <= RECENT_TOAST_WINDOW_MS;
}

function NotificationToasts({
  toasts,
  onDismiss,
  onOpen
}: {
  toasts: NotificationToast[];
  onDismiss: (toastId: string) => void;
  onOpen: (txId: string) => void;
}) {
  if (!toasts.length) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed bottom-20 right-4 z-50 flex w-full max-w-[300px] flex-col gap-3 sm:right-6">
      {toasts.map((toast) => (
        <div
          className={`pointer-events-auto relative overflow-hidden border-2 ${severityClasses(
            toast.transaction.message.severity
          )} bg-crt-panel shadow-[6px_6px_0_0_rgba(6,12,24,0.45)]`}
          key={toast.id}
        >
          <button
            aria-label="Dismiss notification"
            className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center border border-crt-border bg-crt-panel-2 text-xs text-crt-muted transition hover:text-crt-text"
            onClick={() => onDismiss(toast.id)}
            type="button"
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
          <button
            className="block w-full px-4 pb-4 pt-3 text-left"
            onClick={() => onOpen(toast.transaction.id)}
            type="button"
          >
            <p className="pr-8 text-[10px] font-bold uppercase tracking-[0.22em] text-crt-accent">
              {toast.transaction.category.replace(/_/g, " ")}
            </p>
            <p className="mt-2 pr-8 text-sm font-bold uppercase tracking-[0.1em] text-crt-text">
              {toast.transaction.message.title}
            </p>
            <p className="mt-2 max-h-[4.5rem] overflow-hidden text-sm leading-6 text-crt-muted">
              {toast.transaction.message.body}
            </p>
          </button>
        </div>
      ))}
    </div>
  );
}

export function NotificationsProvider({ children }: NotificationsProviderProps) {
  const router = useRouter();
  const { campaignId } = useCampaign();
  const [dmUid, setDmUid] = useState<string | null>(null);
  const [recentTransactions, setRecentTransactions] = useState<TransactionDoc[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<NotificationToast[]>([]);
  const isFirstSnapshotRef = useRef(true);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const timeoutRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    setDmUid(getAuthSessionUidFromBrowser());
  }, []);

  const dmRecipientKey = useMemo(() => (dmUid ? getDmRecipientKey(dmUid) : null), [dmUid]);

  const dismissToast = useCallback((toastId: string) => {
    const timeoutId = timeoutRef.current.get(toastId);

    if (timeoutId) {
      window.clearTimeout(timeoutId);
      timeoutRef.current.delete(toastId);
    }

    setToasts((current) => current.filter((toast) => toast.id !== toastId));
  }, []);

  const openTransaction = useCallback(
    (txId: string) => {
      dismissToast(txId);
      router.push(`/notifications?tx=${encodeURIComponent(txId)}`);
    },
    [dismissToast, router]
  );

  useEffect(() => {
    if (!campaignId || !dmUid || !dmRecipientKey) {
      setRecentTransactions([]);
      setError(null);
      return;
    }

    timeoutRef.current.forEach((timeoutId) => {
      window.clearTimeout(timeoutId);
    });
    timeoutRef.current.clear();
    isFirstSnapshotRef.current = true;
    seenIdsRef.current = new Set();
    setToasts([]);
    return subscribeRecentTransactionsForDm(
      campaignId,
      dmUid,
      10,
      (transactions) => {
        setError(null);
        setRecentTransactions(transactions);

        const nextIds = new Set(transactions.map((transaction) => transaction.id));
        const now = Date.now();

        if (isFirstSnapshotRef.current) {
          isFirstSnapshotRef.current = false;
          seenIdsRef.current = nextIds;
          return;
        }

        transactions.forEach((transaction) => {
          if (seenIdsRef.current.has(transaction.id)) {
            return;
          }

          if (!shouldToast(transaction, dmRecipientKey, now)) {
            return;
          }

          setToasts((current) => {
            if (current.some((toast) => toast.id === transaction.id)) {
              return current;
            }

            const nextToast = {
              id: transaction.id,
              transaction
            };

            const timeoutId = window.setTimeout(() => {
              dismissToast(transaction.id);
            }, TOAST_DURATION_MS);

            timeoutRef.current.set(transaction.id, timeoutId);

            return [nextToast, ...current].slice(0, 4);
          });
        });

        seenIdsRef.current = nextIds;
      },
      (subscriptionError) => {
        setError(subscriptionError.message);
      }
    );
  }, [campaignId, dismissToast, dmRecipientKey, dmUid]);

  useEffect(() => {
    const timeouts = timeoutRef.current;

    return () => {
      timeouts.forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
      timeouts.clear();
    };
  }, []);

  const value = useMemo<NotificationsContextValue>(
    () => ({
      dmUid,
      dmRecipientKey,
      recentTransactions,
      dropdownTransactions: dmRecipientKey ? sortTransactionsForDropdown(recentTransactions, dmRecipientKey) : recentTransactions,
      unreadCount: dmRecipientKey
        ? recentTransactions.filter((transaction) => isUnreadForRecipient(transaction, dmRecipientKey)).length
        : 0,
      error,
      openTransaction
    }),
    [dmRecipientKey, dmUid, error, openTransaction, recentTransactions]
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
      <NotificationToasts onDismiss={dismissToast} onOpen={openTransaction} toasts={toasts} />
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationsContext);

  if (!context) {
    throw new Error("useNotifications must be used inside NotificationsProvider.");
  }

  return context;
}
