"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { ErrorState } from "@/components/shared/ErrorState";
import { PixelButton } from "@/components/ui/PixelButton";
import { PixelInput } from "@/components/ui/PixelInput";
import { PixelPanel } from "@/components/ui/PixelPanel";
import { signInDm, subscribeToAuthState } from "@/lib/firebase/auth";
import { getMissingFirebaseConfigKeys, isFirebaseConfigured } from "@/lib/firebase/config";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      return;
    }

    const unsubscribe = subscribeToAuthState((user) => {
      if (user) {
        router.replace("/campaigns");
      }
    });

    return unsubscribe;
  }, [router]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isFirebaseConfigured()) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await signInDm(email.trim(), password);
      router.replace("/campaigns");
    } catch (submissionError) {
      const message = submissionError instanceof Error ? submissionError.message : "Unable to sign in.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  const missingKeys = getMissingFirebaseConfigKeys();

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md items-center justify-center px-6">
      <div className="w-full space-y-6">
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-[0.4em] text-crt-accent">Septagon</p>
          <h1 className="mt-4 text-3xl font-bold uppercase tracking-[0.15em] text-crt-text">DM Dashboard</h1>
          <p className="mt-3 text-sm text-crt-muted">Email/password login for the manually-created DM account.</p>
        </div>
        {!isFirebaseConfigured() ? (
          <ErrorState
            title="Firebase Setup"
            body={`Missing .env.local values: ${missingKeys.join(", ")}. Create a Firebase Web App in the console, then copy the web config values into .env.local.`}
          />
        ) : (
          <PixelPanel>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <label className="block space-y-2 text-xs font-bold uppercase tracking-[0.2em] text-crt-muted">
                <span>DM Email</span>
                <PixelInput
                  autoComplete="email"
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="dm@example.com"
                  type="email"
                  value={email}
                />
              </label>
              <label className="block space-y-2 text-xs font-bold uppercase tracking-[0.2em] text-crt-muted">
                <span>Password</span>
                <PixelInput
                  autoComplete="current-password"
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Password"
                  type="password"
                  value={password}
                />
              </label>
              {error ? <p className="text-sm text-crt-danger">{error}</p> : null}
              <PixelButton className="w-full" disabled={isSubmitting} type="submit">
                {isSubmitting ? "Authenticating..." : "Enter Dashboard"}
              </PixelButton>
            </form>
          </PixelPanel>
        )}
      </div>
    </div>
  );
}
