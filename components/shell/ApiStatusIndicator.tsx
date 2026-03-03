"use client";

import { faPlug } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect, useState } from "react";

import { compendiumEndpoints, getDnDataBaseUrl } from "@/lib/compendium/api";

type ApiStatus = "checking" | "online" | "offline";

async function checkApiHealth(signal: AbortSignal): Promise<boolean> {
  const response = await fetch(`${getDnDataBaseUrl()}${compendiumEndpoints.health}`, {
    cache: "no-store",
    signal
  });

  return response.ok;
}

export function ApiStatusIndicator() {
  const [status, setStatus] = useState<ApiStatus>("checking");

  useEffect(() => {
    let active = true;
    let currentController: AbortController | null = null;

    async function runHealthCheck() {
      currentController?.abort();
      const controller = new AbortController();
      currentController = controller;

      try {
        const isOnline = await checkApiHealth(controller.signal);

        if (active) {
          setStatus(isOnline ? "online" : "offline");
        }
      } catch {
        if (active) {
          setStatus("offline");
        }
      }
    }

    void runHealthCheck();

    const interval = window.setInterval(() => {
      void runHealthCheck();
    }, 15000);

    return () => {
      active = false;
      currentController?.abort();
      window.clearInterval(interval);
    };
  }, []);

  const dotClass =
    status === "online"
      ? "bg-crt-accent"
      : status === "offline"
        ? "bg-crt-danger"
        : "bg-crt-warn animate-pulse";
  const pulseClass =
    status === "online"
      ? "bg-crt-accent animate-ping opacity-40"
      : status === "checking"
        ? "bg-crt-warn animate-ping opacity-30"
        : "";

  const label =
    status === "online"
      ? "API online"
      : status === "offline"
        ? "API offline"
        : "Checking API";

  const helper =
    status === "online"
      ? "DnData reachable"
      : status === "offline"
        ? "Run local DnData server"
        : "Pinging local DnData";

  return (
    <div className="flex items-center gap-2 text-right">
      <span className="relative flex h-3.5 w-3.5 items-center justify-center">
        {pulseClass ? <span className={`absolute h-full w-full rounded-full ${pulseClass}`} /> : null}
        <span className={`relative h-2.5 w-2.5 rounded-full ${dotClass}`} />
      </span>
      <FontAwesomeIcon className="text-[11px] text-crt-muted" fixedWidth icon={faPlug} />
      <div className="leading-tight">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-crt-text">{label}</p>
        <p className="text-[9px] uppercase tracking-[0.14em] text-crt-muted">{helper}</p>
      </div>
    </div>
  );
}
