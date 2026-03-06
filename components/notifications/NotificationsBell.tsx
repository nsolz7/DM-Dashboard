"use client";

import { useEffect, useRef, useState } from "react";
import { faBell } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { useNotifications } from "@/components/notifications/NotificationsProvider";

function statusLabel(status: string | null | undefined) {
  if (!status) {
    return "unread";
  }

  return status.replace(/_/g, " ");
}

export function NotificationsBell() {
  const { dropdownTransactions, unreadCount, error, dmUid, dmRecipientKey, openTransaction } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, []);

  return (
    <div className="relative" ref={containerRef}>
      <button
        aria-label="Open notifications"
        className="relative inline-flex h-11 w-11 items-center justify-center border-2 border-crt-border bg-crt-panel text-sm text-crt-text transition hover:border-crt-accent"
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <FontAwesomeIcon icon={faBell} />
        {unreadCount > 0 ? (
          <span className="absolute -right-1.5 -top-1.5 inline-flex min-h-[1.35rem] min-w-[1.35rem] items-center justify-center rounded-sm border border-crt-bg bg-crt-danger px-1 text-[10px] font-bold text-crt-bg">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <div className="absolute right-0 top-[calc(100%+0.75rem)] z-40 w-[320px] max-w-[calc(100vw-2rem)] border-2 border-crt-border bg-crt-panel shadow-[8px_8px_0_0_rgba(6,12,24,0.45)]">
          <div className="border-b border-crt-border px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-crt-accent">Notifications</p>
            <p className="mt-1 text-xs uppercase tracking-[0.16em] text-crt-muted">
              {dmUid ? `${unreadCount} unread` : "DM session missing"}
            </p>
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            {error ? (
              <div className="px-4 py-4 text-sm text-crt-danger">{error}</div>
            ) : !dmRecipientKey ? (
              <div className="px-4 py-4 text-sm text-crt-muted">Sign in again to sync DM notifications.</div>
            ) : dropdownTransactions.length ? (
              <div className="grid gap-px bg-crt-border">
                {dropdownTransactions.map((transaction) => {
                  const recipientState = transaction.recipientState[dmRecipientKey];
                  const unread = recipientState?.status === "unread";

                  return (
                    <button
                      className={`grid gap-2 bg-crt-panel px-4 py-3 text-left transition hover:bg-crt-panel-2 ${
                        unread ? "border-l-2 border-crt-accent" : "border-l-2 border-transparent"
                      }`}
                      key={transaction.id}
                      onClick={() => {
                        setIsOpen(false);
                        openTransaction(transaction.id);
                      }}
                      type="button"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="min-w-0 text-xs font-bold uppercase tracking-[0.1em] text-crt-text">
                          {transaction.message.title}
                        </p>
                        <span className="shrink-0 text-[10px] uppercase tracking-[0.16em] text-crt-muted">
                          {statusLabel(recipientState?.status)}
                        </span>
                      </div>
                      <p className="text-sm leading-5 text-crt-muted">{transaction.message.body.slice(0, 90)}</p>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="px-4 py-4 text-sm text-crt-muted">No recent transactions for this campaign.</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
