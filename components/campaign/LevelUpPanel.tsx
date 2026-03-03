"use client";

import { useEffect, useState } from "react";

import { PixelPanel } from "@/components/ui/PixelPanel";
import { formatNumber, readableId } from "@/lib/utils";
import type { LevelHistoryEntry, LevelUpResult, LevelingPreview } from "@/types/leveling";

interface LevelUpPanelProps {
  campaignId: string;
  playerId: string;
  onLevelApplied?: (result: LevelUpResult) => void;
}

interface PreviewResponse {
  preview?: LevelingPreview;
  recentHistory?: LevelHistoryEntry[];
  error?: string;
}

interface ApplyResponse extends Partial<LevelUpResult> {
  error?: string;
  preview?: LevelingPreview;
}

function formatDate(value: string | null): string {
  if (!value) {
    return "Just now";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "Unknown";
  }

  return parsed.toLocaleString();
}

export function LevelUpPanel({ campaignId, playerId, onLevelApplied }: LevelUpPanelProps) {
  const [preview, setPreview] = useState<LevelingPreview | null>(null);
  const [recentHistory, setRecentHistory] = useState<LevelHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isApplying, setIsApplying] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applyMessage, setApplyMessage] = useState<string | null>(null);
  const [note, setNote] = useState("Manual level up");
  const [previewReloadKey, setPreviewReloadKey] = useState(0);

  useEffect(() => {
    let isMounted = true;

    async function loadPreview() {
      setIsLoading(true);
      setLoadError(null);

      try {
        const response = await fetch(
          `/api/players/${encodeURIComponent(playerId)}/level-up?campaignId=${encodeURIComponent(campaignId)}`
        );
        const payload = (await response.json()) as PreviewResponse;

        if (!response.ok) {
          throw new Error(payload.error || "Unable to load character advancement.");
        }

        if (!isMounted) {
          return;
        }

        setPreview(payload.preview ?? null);
        setRecentHistory(payload.recentHistory ?? []);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setLoadError(error instanceof Error ? error.message : "Unable to load character advancement.");
        setPreview(null);
        setRecentHistory([]);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadPreview();

    return () => {
      isMounted = false;
    };
  }, [campaignId, playerId, previewReloadKey]);

  const blockReason = (() => {
    if (!preview) {
      return "Loading schema mapping...";
    }

    if (!preview.canLevel) {
      const issues = [...preview.missingRequiredMappings];

      if (preview.currentLevel !== null && preview.currentLevel >= preview.maxLevelCap) {
        issues.push(`max level ${preview.maxLevelCap} reached`);
      }

      return issues.join(" | ") || "Required player fields are not mapped.";
    }

    return "";
  })();

  async function handleApply() {
    if (!preview?.canLevel) {
      return;
    }

    setIsApplying(true);
    setApplyError(null);
    setApplyMessage(null);

    try {
      const response = await fetch(`/api/players/${encodeURIComponent(playerId)}/level-up`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          campaignId,
          note
        })
      });
      const payload = (await response.json()) as ApplyResponse;

      if (!response.ok) {
        if (payload.preview) {
          setPreview(payload.preview);
        }

        throw new Error(payload.error || "Unable to apply this level.");
      }

      const result = payload as LevelUpResult;

      setApplyMessage(
        `Advanced to level ${result.nextLevel}. HP +${result.hpGain} (${result.currentHp}/${result.maxHp})${
          result.pendingSelectionsAdded ? ` / ${result.pendingSelectionsAdded} manual review prompt added` : ""
        }.`
      );

      setPreviewReloadKey((current) => current + 1);
      onLevelApplied?.(result);
    } catch (error) {
      setApplyError(error instanceof Error ? error.message : "Unable to apply this level.");
    } finally {
      setIsApplying(false);
    }
  }

  return (
    <PixelPanel className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-crt-muted">Character Advancement</p>
          <p className="mt-2 text-sm text-crt-muted">
            Reads the live player + sheet schema, then applies a single safe level-up through the adapter.
          </p>
        </div>
        <button
          className="inline-flex min-h-[3rem] min-w-[8rem] items-center justify-center border-2 border-crt-accent px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-crt-accent transition hover:bg-crt-accent hover:text-crt-bg disabled:cursor-not-allowed disabled:opacity-50"
          disabled={isApplying || isLoading || !preview?.canLevel}
          onClick={() => void handleApply()}
          title={blockReason}
          type="button"
        >
          {isApplying ? "Applying..." : "Level Up"}
        </button>
      </div>

      {loadError ? (
        <div className="border-2 border-crt-danger bg-crt-panel-2 px-4 py-3 text-xs font-bold uppercase tracking-[0.16em] text-crt-danger">
          {loadError}
        </div>
      ) : null}
      {applyError ? (
        <div className="border-2 border-crt-danger bg-crt-panel-2 px-4 py-3 text-xs font-bold uppercase tracking-[0.16em] text-crt-danger">
          {applyError}
        </div>
      ) : null}
      {applyMessage ? (
        <div className="border-2 border-crt-accent bg-crt-panel-2 px-4 py-3 text-xs font-bold uppercase tracking-[0.16em] text-crt-accent">
          {applyMessage}
        </div>
      ) : null}

      {preview ? (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="border border-crt-border px-3 py-3 text-sm text-crt-muted">
              Current Level
              <span className="block pt-1 text-lg font-bold text-crt-text">{formatNumber(preview.currentLevel)}</span>
            </div>
            <div className="border border-crt-border px-3 py-3 text-sm text-crt-muted">
              Next Level
              <span className="block pt-1 text-lg font-bold text-crt-text">{formatNumber(preview.nextLevel)}</span>
            </div>
            <div className="border border-crt-border px-3 py-3 text-sm text-crt-muted">
              HP Gain
              <span className="block pt-1 text-lg font-bold text-crt-text">
                {typeof preview.hpGain === "number" ? `+${preview.hpGain}` : "—"}
              </span>
            </div>
            <div className="border border-crt-border px-3 py-3 text-sm text-crt-muted">
              Hit Die / Con
              <span className="block pt-1 text-lg font-bold text-crt-text">
                {preview.hitDie && preview.hitDie !== "—" && typeof preview.conModifier === "number"
                  ? `${preview.hitDie} / ${preview.conModifier >= 0 ? "+" : ""}${preview.conModifier}`
                  : "—"}
              </span>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="space-y-3">
              <label className="block text-[10px] font-bold uppercase tracking-[0.22em] text-crt-accent" htmlFor="level-up-note">
                Audit Note
              </label>
              <input
                className="w-full border-2 border-crt-border bg-crt-panel-2 px-3 py-3 text-sm text-crt-text outline-none transition focus:border-crt-accent"
                id="level-up-note"
                maxLength={240}
                onChange={(event) => setNote(event.target.value)}
                value={note}
              />
              <div className="border border-crt-border bg-crt-panel-2 px-3 py-3 text-xs text-crt-muted">
                <p>
                  <span className="font-bold text-crt-text">Class:</span> {readableId(preview.classId)}
                </p>
                <p className="mt-2">
                  <span className="font-bold text-crt-text">Subclass:</span> {readableId(preview.subclassId)}
                </p>
                <p className="mt-2">
                  <span className="font-bold text-crt-text">Max Level Cap:</span> {preview.maxLevelCap}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-crt-accent">Preflight Mapping</p>
              <div className="border border-crt-border bg-crt-panel-2 px-3 py-3 text-xs text-crt-muted">
                {preview.missingRequiredMappings.length ? (
                  <div>
                    <p className="font-bold uppercase tracking-[0.16em] text-crt-danger">Missing / Unmapped Fields</p>
                    <ul className="mt-2 space-y-1">
                      {preview.missingRequiredMappings.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="font-bold uppercase tracking-[0.16em] text-crt-accent">Required mappings resolved.</p>
                )}
                {preview.unmappedPaths.length ? (
                  <div className="mt-3 border-t border-crt-border pt-3">
                    <p className="font-bold uppercase tracking-[0.16em] text-crt-text">Optional paths not present</p>
                    <ul className="mt-2 space-y-1">
                      {preview.unmappedPaths.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="border border-crt-border bg-crt-panel-2 px-3 py-3 text-xs text-crt-muted">
            <p className="font-bold uppercase tracking-[0.16em] text-crt-text">Resolved field paths</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <p>Total Level: {preview.resolvedPaths.totalLevelPath ?? "—"}</p>
              <p>Class Levels: {preview.resolvedPaths.classLevelPath ?? "—"}</p>
              <p>Class Id: {preview.resolvedPaths.classIdPath ?? "—"}</p>
              <p>Abilities: {preview.resolvedPaths.abilitiesPath ?? "—"}</p>
              <p>HP Max: {preview.resolvedPaths.hpMaxPath ?? "—"}</p>
              <p>HP Current: {preview.resolvedPaths.hpCurrentPath ?? "—"}</p>
              <p>Hit Dice: {preview.resolvedPaths.hitDicePath ?? "—"}</p>
              <p>Pending Selections: {preview.resolvedPaths.pendingSelectionsPath ?? "—"}</p>
            </div>
          </div>
        </>
      ) : isLoading ? (
        <div className="border border-crt-border bg-crt-panel-2 px-4 py-4 text-sm text-crt-muted">Loading character advancement…</div>
      ) : null}

      <div className="space-y-3 border-t border-crt-border pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-crt-accent">Recent Level History</p>
          <button
            className="border border-crt-border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-crt-muted transition hover:border-crt-accent hover:text-crt-accent"
            onClick={() => setPreviewReloadKey((current) => current + 1)}
            type="button"
          >
            Refresh
          </button>
        </div>
        {recentHistory.length ? (
          <div className="grid gap-3">
            {recentHistory.map((entry) => (
              <div className="border border-crt-border bg-crt-panel-2 px-3 py-3 text-sm text-crt-muted" key={entry.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-bold uppercase tracking-[0.14em] text-crt-text">
                      {readableId(entry.classId)} {entry.fromLevel} → {entry.toLevel}
                    </p>
                    <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-crt-muted">
                      {entry.hitDie} / HP +{entry.hpGain} / {formatDate(entry.createdAt)}
                    </p>
                  </div>
                  <span className="border border-crt-border px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-crt-muted">
                    {entry.createdByUid ?? "dm-web"}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-crt-muted">{entry.note}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-crt-muted">No level history has been recorded for this player yet.</p>
        )}
      </div>
    </PixelPanel>
  );
}
