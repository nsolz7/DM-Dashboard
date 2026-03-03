"use client";

import { getApp, getApps, initializeApp } from "firebase/app";

import { getFirebaseWebConfig } from "@/lib/firebase/config";

export function getFirebaseClientApp() {
  if (!getApps().length) {
    initializeApp(getFirebaseWebConfig());
  }

  return getApp();
}
