import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
  type App,
  type ServiceAccount
} from "firebase-admin/app";

import { FIREBASE_PROJECT_ID, FIREBASE_STORAGE_BUCKET } from "../firebase/config";

const FALLBACK_SERVICE_ACCOUNT_PATH = resolve(process.cwd(), "secrets/serviceAccountKey.json");
const MACOS_ADC_PATH = join(homedir(), "Library/Application Support/gcloud/application_default_credentials.json");
const UNIX_ADC_PATH = join(homedir(), ".config/gcloud/application_default_credentials.json");

function resolveAdcCredentialsPath(): string | null {
  const explicitPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (explicitPath && existsSync(explicitPath)) {
    return explicitPath;
  }

  if (existsSync(MACOS_ADC_PATH)) {
    return MACOS_ADC_PATH;
  }

  if (existsSync(UNIX_ADC_PATH)) {
    return UNIX_ADC_PATH;
  }

  return null;
}

function getExistingAdminApp(name: string): App | null {
  return getApps().find((app) => app.name === name) ?? null;
}

async function initializeNamedAdminApp(appName: string): Promise<{
  app: App;
  authMode: "adc" | "serviceAccount";
  adcPath?: string;
  serviceAccountPath?: string;
}> {
  const adcPath = resolveAdcCredentialsPath();

  if (adcPath) {
    const adcAppName = `${appName}-adc`;
    const adcApp =
      getExistingAdminApp(adcAppName) ??
      initializeApp(
        {
          credential: applicationDefault(),
          projectId: FIREBASE_PROJECT_ID,
          storageBucket: FIREBASE_STORAGE_BUCKET
        },
        adcAppName
      );

    return {
      app: adcApp,
      authMode: "adc",
      adcPath
    };
  }

  try {
    const raw = readFileSync(FALLBACK_SERVICE_ACCOUNT_PATH, "utf8");
    const serviceAccount = JSON.parse(raw) as ServiceAccount;
    const serviceAppName = `${appName}-service-account`;
    const serviceAccountApp =
      getExistingAdminApp(serviceAppName) ??
      initializeApp(
        {
          credential: cert(serviceAccount),
          projectId: FIREBASE_PROJECT_ID,
          storageBucket: FIREBASE_STORAGE_BUCKET
        },
        serviceAppName
      );

    return {
      app: serviceAccountApp,
      authMode: "serviceAccount",
      serviceAccountPath: FALLBACK_SERVICE_ACCOUNT_PATH
    };
  } catch {
    // The caller prints setup instructions when both auth methods fail.
  }

  throw new Error(
    "Unable to authenticate with Firebase Admin SDK. Try Application Default Credentials first (`gcloud auth application-default login`), or place a service account JSON file at ./secrets/serviceAccountKey.json."
  );
}

export async function initializeAdminForInspection() {
  return initializeNamedAdminApp("inspect");
}

export async function initializeAdminForServer() {
  return initializeNamedAdminApp("server");
}
