"use client";

import { getFirebaseWebConfig } from "@/lib/firebase/config";

export type PlayerPortraitVariant = "reference" | "detail";

export function buildStorageUrl(storagePath: string | null | undefined): string | null {
  if (!storagePath) {
    return null;
  }

  try {
    const { storageBucket } = getFirebaseWebConfig();
    return `https://firebasestorage.googleapis.com/v0/b/${storageBucket}/o/${encodeURIComponent(storagePath)}?alt=media`;
  } catch {
    return null;
  }
}

function getPortraitDirectory(campaignId: string, portraitStoragePath: string | null | undefined): string {
  if (portraitStoragePath && portraitStoragePath.includes("/")) {
    const segments = portraitStoragePath.split("/");
    segments.pop();
    return segments.join("/");
  }

  return `campaigns/${campaignId}/portraits`;
}

export function getPlayerPortraitUrls(options: {
  campaignId: string;
  playerId: string;
  variant: PlayerPortraitVariant;
  portraitStoragePath?: string | null;
  portraitUrl?: string | null;
}): string[] {
  const { campaignId, playerId, variant, portraitStoragePath, portraitUrl } = options;
  const directory = getPortraitDirectory(campaignId, portraitStoragePath);

  const candidatePaths =
    variant === "detail"
      ? [
          `${directory}/${playerId}.gif`,
          portraitStoragePath ?? null,
          `${directory}/${playerId}_headshot.png`,
          `${directory}/${playerId}_bg.png`,
          `${directory}/${playerId}_nobg.png`
        ]
      : [
          `${directory}/${playerId}_headshot.png`,
          `${directory}/${playerId}_bg.png`,
          `${directory}/${playerId}_nobg.png`,
          `${directory}/${playerId}.png`,
          `${directory}/${playerId}.gif`,
          portraitStoragePath ?? null
        ];

  const urls = candidatePaths
    .map((path) => buildStorageUrl(path))
    .concat(portraitUrl ?? null)
    .filter((url): url is string => Boolean(url));

  return Array.from(new Set(urls));
}

export async function resolveStorageUrl(storagePath: string | null | undefined): Promise<string | null> {
  return buildStorageUrl(storagePath);
}
