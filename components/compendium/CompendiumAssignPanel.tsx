"use client";

import { useEffect, useState } from "react";

import type { AssignablePlayerOption, CompendiumDetail, CompendiumType } from "@/types";
import { useCampaign } from "@/components/providers/CampaignProvider";
import { PixelButton } from "@/components/ui/PixelButton";
import { PixelSelect } from "@/components/ui/PixelSelect";
import { listAssignablePlayers } from "@/lib/firebase/firestore";

type AssignableCompendiumType = Extract<CompendiumType, "items" | "spells" | "traits">;

interface CompendiumAssignPanelProps {
  detail: CompendiumDetail;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getNestedValue(source: unknown, path: string[]): unknown {
  let current: unknown = source;

  for (const segment of path) {
    if (!isRecord(current) || !(segment in current)) {
      return null;
    }

    current = current[segment];
  }

  return current;
}

function isAssignableType(type: CompendiumType): type is AssignableCompendiumType {
  return type === "items" || type === "spells" || type === "traits";
}

function inferSpellCantrip(detail: CompendiumDetail): boolean {
  const levelValue = getNestedValue(detail.raw, ["level"]) ?? getNestedValue(detail.raw, ["taxonomy", "level"]);

  if (typeof levelValue === "number") {
    return levelValue === 0;
  }

  if (typeof levelValue === "string") {
    const normalized = levelValue.trim().toLowerCase();
    return normalized === "0" || normalized.includes("cantrip");
  }

  return false;
}

function inferItemContainerTag(detail: CompendiumDetail): string {
  const candidates = [
    getNestedValue(detail.raw, ["classification", "type"]),
    getNestedValue(detail.raw, ["classification", "category"]),
    getNestedValue(detail.raw, ["taxonomy", "type"]),
    getNestedValue(detail.raw, ["type"]),
    getNestedValue(detail.raw, ["category"])
  ];

  const normalized = candidates
    .find((value): value is string => typeof value === "string" && value.trim().length > 0)
    ?.trim()
    .toLowerCase();

  if (!normalized) {
    return "misc";
  }

  if (normalized.includes("weapon") || normalized.includes("ammo")) {
    return "weapon";
  }

  if (normalized.includes("armor") || normalized.includes("shield")) {
    return "armor";
  }

  if (normalized.includes("tool")) {
    return "tool";
  }

  return "misc";
}

function getAssignHint(type: AssignableCompendiumType): string {
  if (type === "items") {
    return "Adds this item to the player's inventory stack on the player document.";
  }

  if (type === "spells") {
    return "Adds this spell to grants.spells on the player document.";
  }

  return "Adds this trait to grants.traits on the player document.";
}

function getPlayerLabel(player: AssignablePlayerOption): string {
  const baseName = player.name?.trim() || player.id;
  return player.active ? baseName : `${baseName} (inactive)`;
}

export function CompendiumAssignPanel({ detail }: CompendiumAssignPanelProps) {
  const { campaignId } = useCampaign();
  const [players, setPlayers] = useState<AssignablePlayerOption[]>([]);
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [isLoadingPlayers, setIsLoadingPlayers] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isAssignableType(detail.type)) {
      setPlayers([]);
      setSelectedPlayerId("");
      return;
    }

    let active = true;
    setIsLoadingPlayers(true);
    setError(null);
    setMessage(null);

    void listAssignablePlayers(campaignId)
      .then((nextPlayers) => {
        if (!active) {
          return;
        }

        setPlayers(nextPlayers);
        setSelectedPlayerId((current) => {
          if (current && nextPlayers.some((player) => player.id === current)) {
            return current;
          }

          return nextPlayers.find((player) => player.active)?.id ?? nextPlayers[0]?.id ?? "";
        });
      })
      .catch((loadError) => {
        if (active) {
          setPlayers([]);
          setSelectedPlayerId("");
          setError(loadError instanceof Error ? loadError.message : "Unable to load party members.");
        }
      })
      .finally(() => {
        if (active) {
          setIsLoadingPlayers(false);
        }
      });

    return () => {
      active = false;
    };
  }, [campaignId, detail.type]);

  if (!isAssignableType(detail.type)) {
    return null;
  }

  async function handleAssign() {
    if (!selectedPlayerId || isAssigning) {
      return;
    }

    const selectedPlayer = players.find((player) => player.id === selectedPlayerId);

    setIsAssigning(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/assign", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          campaignId,
          playerId: selectedPlayerId,
          type: detail.type,
          entryId: detail.id,
          entryName: detail.name,
          isCantrip: detail.type === "spells" ? inferSpellCantrip(detail) : undefined,
          itemContainerTag: detail.type === "items" ? inferItemContainerTag(detail) : undefined
        })
      });

      const payload = (await response.json()) as {
        status?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Unable to assign this compendium entry.");
      }

      if (payload.status === "already_assigned") {
        setMessage(`${selectedPlayer?.name ?? selectedPlayerId} already has this ${detail.type.slice(0, -1)} assigned.`);
      } else if (payload.status === "incremented") {
        setMessage(`Added another copy for ${selectedPlayer?.name ?? selectedPlayerId}.`);
      } else {
        setMessage(`Assigned to ${selectedPlayer?.name ?? selectedPlayerId}.`);
      }
    } catch (assignError) {
      setError(assignError instanceof Error ? assignError.message : "Unable to assign this compendium entry.");
    } finally {
      setIsAssigning(false);
    }
  }

  return (
    <div className="space-y-3 border-2 border-crt-border bg-crt-panel-2 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-crt-accent">Assign to Party Member</p>
        <p className="text-[10px] uppercase tracking-[0.16em] text-crt-muted">{detail.type.slice(0, -1)} grant</p>
      </div>
      <p className="text-xs leading-5 text-crt-muted">{getAssignHint(detail.type)}</p>
      <div className="flex flex-col gap-3 md:flex-row">
        <PixelSelect
          aria-label="Choose a player"
          disabled={isLoadingPlayers || !players.length || isAssigning}
          onChange={(event) => setSelectedPlayerId(event.target.value)}
          value={selectedPlayerId}
        >
          {players.length ? null : <option value="">No players found</option>}
          {players.map((player) => (
            <option key={player.id} value={player.id}>
              {getPlayerLabel(player)}
            </option>
          ))}
        </PixelSelect>
        <PixelButton
          className="md:min-w-[180px]"
          disabled={!selectedPlayerId || isLoadingPlayers || isAssigning}
          onClick={() => void handleAssign()}
          variant="secondary"
        >
          {isAssigning ? "Assigning..." : "Assign"}
        </PixelButton>
      </div>
      {error ? <p className="text-xs uppercase tracking-[0.14em] text-crt-danger">{error}</p> : null}
      {message ? <p className="text-xs uppercase tracking-[0.14em] text-crt-accent">{message}</p> : null}
    </div>
  );
}
