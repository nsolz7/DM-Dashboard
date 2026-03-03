import type { FirebaseOptions } from "firebase/app";

const env = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? ""
};

export const FIREBASE_PROJECT_ID = "septagon-a676f";
export const FIREBASE_STORAGE_BUCKET = "septagon-a676f.firebasestorage.app";

export function getMissingFirebaseConfigKeys(): string[] {
  return Object.entries(env)
    .filter(([, value]) => !value)
    .map(([key]) => key);
}

export function isFirebaseConfigured(): boolean {
  return getMissingFirebaseConfigKeys().length === 0;
}

export function getFirebaseWebConfig(): FirebaseOptions {
  if (!isFirebaseConfigured()) {
    throw new Error(
      `Firebase web config is incomplete. Missing: ${getMissingFirebaseConfigKeys().join(", ")}. Copy values into .env.local.`
    );
  }

  return {
    apiKey: env.apiKey,
    authDomain: env.authDomain,
    projectId: env.projectId,
    storageBucket: env.storageBucket,
    appId: env.appId,
    messagingSenderId: env.messagingSenderId
  };
}
