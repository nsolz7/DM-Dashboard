"use client";

import { clearAuthSessionInBrowser, markAuthSessionInBrowser } from "@/lib/firebase/authSession";
import { getFirebaseWebConfig } from "@/lib/firebase/config";

const TOKEN_STORAGE_KEY = "septagon:firebase-id-token";
const EMAIL_STORAGE_KEY = "septagon:firebase-email";

interface FirebaseAuthSuccess {
  idToken: string;
  email?: string;
  localId?: string;
}

export interface DmSessionUser {
  email: string | null;
  uid?: string | null;
}

function getStoredIdToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const token = window.localStorage.getItem(TOKEN_STORAGE_KEY);
  return token && token.trim() ? token : null;
}

function storeSession(idToken: string, email: string | null, uid: string | null) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(TOKEN_STORAGE_KEY, idToken);

  if (email) {
    window.localStorage.setItem(EMAIL_STORAGE_KEY, email);
  } else {
    window.localStorage.removeItem(EMAIL_STORAGE_KEY);
  }

  markAuthSessionInBrowser(uid);
}

function clearSession() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  window.localStorage.removeItem(EMAIL_STORAGE_KEY);
  clearAuthSessionInBrowser();
}

function getIdentityToolkitUrl(path: string): string {
  const { apiKey } = getFirebaseWebConfig();
  return `https://identitytoolkit.googleapis.com/v1/${path}?key=${apiKey}`;
}

function parseAuthError(payload: unknown): string {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "object" &&
    payload.error !== null &&
    "message" in payload.error &&
    typeof payload.error.message === "string"
  ) {
    const code = payload.error.message;

    if (code === "PASSWORD_LOGIN_DISABLED") {
      return "Email/password sign-in is disabled in Firebase. Enable it under Authentication > Sign-in method > Email/Password.";
    }

    if (code === "INVALID_LOGIN_CREDENTIALS" || code === "INVALID_PASSWORD") {
      return "Invalid email or password.";
    }

    if (code === "EMAIL_NOT_FOUND") {
      return "No Firebase Auth user exists for that email address.";
    }

    return code.replace(/_/g, " ");
  }

  return "Firebase Auth request failed.";
}

async function postAuthRequest<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(getIdentityToolkitUrl(path), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const payload = (await response.json()) as T;

  if (!response.ok) {
    throw new Error(parseAuthError(payload));
  }

  return payload;
}

async function lookupSessionUser(idToken: string): Promise<DmSessionUser | null> {
  try {
    const payload = await postAuthRequest<{
      users?: Array<{
        email?: string;
        localId?: string;
      }>;
    }>("accounts:lookup", { idToken });

    const email = payload.users?.[0]?.email ?? null;
    const uid = payload.users?.[0]?.localId ?? null;

    if (!email) {
      clearSession();
      return null;
    }

    storeSession(idToken, email, uid);
    return { email, uid };
  } catch {
    clearSession();
    return null;
  }
}

export async function signInDm(email: string, password: string): Promise<DmSessionUser> {
  const payload = await postAuthRequest<FirebaseAuthSuccess>("accounts:signInWithPassword", {
    email,
    password,
    returnSecureToken: true
  });

  const normalizedEmail = payload.email ?? email;
  const uid = payload.localId ?? null;
  storeSession(payload.idToken, normalizedEmail, uid);
  return { email: normalizedEmail, uid };
}

export async function signOutDm(): Promise<void> {
  clearSession();
}

export function subscribeToAuthState(callback: (user: DmSessionUser | null) => void): () => void {
  let active = true;
  const idToken = getStoredIdToken();

  if (!idToken) {
    callback(null);
    return () => {
      active = false;
    };
  }

  void lookupSessionUser(idToken).then((user) => {
    if (active) {
      callback(user);
    }
  });

  return () => {
    active = false;
  };
}
