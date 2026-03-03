"use client";

import { useEffect, useMemo, useState } from "react";

import type { Player } from "@/types";
import { getPlayerPortraitUrls, type PlayerPortraitVariant } from "@/lib/firebase/storage";

interface PlayerPortraitProps {
  campaignId: string;
  player: Pick<Player, "id" | "name" | "portraitStoragePath" | "portraitUrl">;
  variant: PlayerPortraitVariant;
  className?: string;
  imgClassName?: string;
}

function getInitials(name: string | null | undefined): string {
  if (!name) {
    return "?";
  }

  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) {
    return "?";
  }

  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export function PlayerPortrait({
  campaignId,
  player,
  variant,
  className = "",
  imgClassName = ""
}: PlayerPortraitProps) {
  const sources = useMemo(
    () =>
      getPlayerPortraitUrls({
        campaignId,
        playerId: player.id,
        variant,
        portraitStoragePath: player.portraitStoragePath,
        portraitUrl: player.portraitUrl
      }),
    [campaignId, player.id, player.portraitStoragePath, player.portraitUrl, variant]
  );
  const [sourceIndex, setSourceIndex] = useState(0);

  useEffect(() => {
    setSourceIndex(0);
  }, [sources]);

  const currentSource = sources[sourceIndex] ?? null;

  if (!currentSource) {
    return (
      <div
        className={`flex items-center justify-center border-2 border-dashed border-crt-border bg-crt-panel-2 text-xs font-bold uppercase tracking-[0.18em] text-crt-muted ${className}`.trim()}
      >
        {getInitials(player.name)}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={player.name ?? player.id}
      className={`${className} ${imgClassName}`.trim()}
      onError={() => {
        setSourceIndex((current) => current + 1);
      }}
      src={currentSource}
    />
  );
}
