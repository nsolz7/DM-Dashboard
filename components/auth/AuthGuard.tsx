"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { ErrorState } from "@/components/shared/ErrorState";
import { LoadingPanel } from "@/components/shared/LoadingPanel";
import { isFirebaseConfigured } from "@/lib/firebase/config";
import { subscribeToAuthState } from "@/lib/firebase/auth";

interface AuthGuardProps {
  children: ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const [state, setState] = useState<"checking" | "ready" | "config-error">("checking");

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setState("config-error");
      return;
    }

    const unsubscribe = subscribeToAuthState((user) => {
      if (!user) {
        router.replace("/login");
        return;
      }

      setState("ready");
    });

    return unsubscribe;
  }, [router]);

  if (state === "config-error") {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-2xl items-center justify-center px-6">
        <ErrorState body="Firebase Web App config is missing. Copy the values from .env.local.example into .env.local before using protected routes." />
      </div>
    );
  }

  if (state !== "ready") {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-2xl items-center justify-center px-6">
        <LoadingPanel label="Checking DM session..." />
      </div>
    );
  }

  return <>{children}</>;
}
