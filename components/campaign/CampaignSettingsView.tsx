"use client";

import { useEffect, useMemo, useState } from "react";

import { useCampaign } from "@/components/providers/CampaignProvider";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { LoadingPanel } from "@/components/shared/LoadingPanel";
import { PixelPanel } from "@/components/ui/PixelPanel";
import type { EquipSettingsDoc, EquipSlotCounts } from "@/types";

const SLOT_FIELDS: Array<{ key: keyof EquipSlotCounts; label: string }> = [
  { key: "head", label: "Head" },
  { key: "body", label: "Body" },
  { key: "cloak", label: "Cloak" },
  { key: "hands", label: "Hands" },
  { key: "feet", label: "Feet" },
  { key: "bracers", label: "Bracers" },
  { key: "neck", label: "Neck" },
  { key: "rings", label: "Rings" },
  { key: "mainHand", label: "Main Hand" },
  { key: "offHand", label: "Off Hand" }
];

function clampSlotValue(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(8, Math.floor(value)));
}

export function CampaignSettingsView() {
  const { campaignId } = useCampaign();
  const [settings, setSettings] = useState<EquipSettingsDoc | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    setIsLoading(true);
    setError(null);
    setSaveMessage(null);

    void fetch(`/api/equipment/settings?campaignId=${encodeURIComponent(campaignId)}`, {
      cache: "no-store"
    })
      .then(async (response) => {
        const payload = (await response.json()) as { settings?: EquipSettingsDoc; error?: string };

        if (!response.ok || !payload.settings) {
          throw new Error(payload.error || "Unable to load campaign equip settings.");
        }

        if (!active) {
          return;
        }

        setSettings(payload.settings);
      })
      .catch((loadError) => {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load campaign equip settings.");
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [campaignId]);

  const canSave = useMemo(() => Boolean(settings) && !isSaving, [isSaving, settings]);

  function updateSlot(key: keyof EquipSlotCounts, value: number) {
    setSettings((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        slots: {
          ...current.slots,
          [key]: clampSlotValue(value)
        }
      };
    });
  }

  function updateField<K extends keyof EquipSettingsDoc>(key: K, value: EquipSettingsDoc[K]) {
    setSettings((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        [key]: value
      };
    });
  }

  async function handleSave() {
    if (!settings) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setSaveMessage(null);

    try {
      const response = await fetch("/api/equipment/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          campaignId,
          settings
        })
      });
      const payload = (await response.json()) as { settings?: EquipSettingsDoc; error?: string };

      if (!response.ok || !payload.settings) {
        throw new Error(payload.error || "Unable to save campaign equip settings.");
      }

      setSettings(payload.settings);
      setSaveMessage("Equip settings saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save campaign equip settings.");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return <LoadingPanel label="Loading campaign settings..." />;
  }

  if (error && !settings) {
    return <ErrorState body={error} />;
  }

  if (!settings) {
    return <EmptyState body="Equip settings are unavailable for this campaign." title="Settings Missing" />;
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.35em] text-crt-accent">Campaign Settings</p>
        <h2 className="mt-2 text-3xl font-bold uppercase tracking-[0.12em] text-crt-text">Equip System</h2>
        <p className="mt-2 text-sm text-crt-muted">
          Configure slot counts and enforcement rules for all player equipment actions in this campaign.
        </p>
      </div>

      {error ? (
        <div className="border-2 border-crt-danger bg-crt-panel px-4 py-3 text-xs uppercase tracking-[0.16em] text-crt-danger">
          {error}
        </div>
      ) : null}
      {saveMessage ? (
        <div className="border-2 border-crt-accent bg-crt-panel px-4 py-3 text-xs uppercase tracking-[0.16em] text-crt-accent">
          {saveMessage}
        </div>
      ) : null}

      <PixelPanel className="space-y-5">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-crt-muted">Slot Counts</p>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {SLOT_FIELDS.map((field) => (
            <div className="border border-crt-border bg-crt-panel-2 px-3 py-3" key={field.key}>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-crt-muted">{field.label}</p>
              <div className="mt-2 flex items-center gap-2">
                <button
                  className="inline-flex h-8 w-8 items-center justify-center border border-crt-border bg-crt-panel text-sm font-bold text-crt-text transition hover:border-crt-accent"
                  onClick={() => updateSlot(field.key, settings.slots[field.key] - 1)}
                  type="button"
                >
                  -
                </button>
                <input
                  className="w-16 border border-crt-border bg-crt-bg px-2 py-1 text-center text-sm text-crt-text focus:border-crt-accent focus:outline-none"
                  max={8}
                  min={0}
                  onChange={(event) => updateSlot(field.key, Number(event.target.value))}
                  type="number"
                  value={settings.slots[field.key]}
                />
                <button
                  className="inline-flex h-8 w-8 items-center justify-center border border-crt-border bg-crt-panel text-sm font-bold text-crt-text transition hover:border-crt-accent"
                  onClick={() => updateSlot(field.key, settings.slots[field.key] + 1)}
                  type="button"
                >
                  +
                </button>
              </div>
            </div>
          ))}
        </div>
      </PixelPanel>

      <PixelPanel className="space-y-5">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-crt-muted">Rules</p>
        <div className="grid gap-4 lg:grid-cols-2">
          <label className="pixel-choice flex cursor-pointer items-start gap-3 border border-crt-border bg-crt-panel-2 px-3 py-3 text-sm text-crt-text">
            <input
              checked={settings.enforceAttunementLimit}
              onChange={(event) => updateField("enforceAttunementLimit", event.target.checked)}
              type="checkbox"
            />
            <span>
              <span className="block text-xs font-bold uppercase tracking-[0.18em] text-crt-accent">Enforce Attunement Limit</span>
              <span className="mt-1 block text-xs text-crt-muted">Default D&D limit is 3 attuned items.</span>
            </span>
          </label>

          <div className="border border-crt-border bg-crt-panel-2 px-3 py-3">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-crt-accent">Attunement Limit</p>
            <input
              className="mt-2 w-20 border border-crt-border bg-crt-bg px-2 py-1 text-sm text-crt-text focus:border-crt-accent focus:outline-none"
              max={10}
              min={0}
              onChange={(event) => updateField("attunementLimit", Math.max(0, Math.min(10, Number(event.target.value) || 0)))}
              type="number"
              value={settings.attunementLimit}
            />
          </div>

          <label className="pixel-choice flex cursor-pointer items-start gap-3 border border-crt-border bg-crt-panel-2 px-3 py-3 text-sm text-crt-text">
            <input
              checked={settings.enforceWeight}
              onChange={(event) => updateField("enforceWeight", event.target.checked)}
              type="checkbox"
            />
            <span>
              <span className="block text-xs font-bold uppercase tracking-[0.18em] text-crt-accent">Enforce Weight</span>
              <span className="mt-1 block text-xs text-crt-muted">Optional carry weight gate for future inventory rules.</span>
            </span>
          </label>

          <div className="border border-crt-border bg-crt-panel-2 px-3 py-3">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-crt-accent">Max Carry Override</p>
            <input
              className="mt-2 w-28 border border-crt-border bg-crt-bg px-2 py-1 text-sm text-crt-text focus:border-crt-accent focus:outline-none"
              min={0}
              onChange={(event) => {
                const raw = event.target.value.trim();
                updateField("maxCarryWeightOverride", raw ? Math.max(0, Number(raw) || 0) : null);
              }}
              placeholder="None"
              type="number"
              value={settings.maxCarryWeightOverride ?? ""}
            />
          </div>
        </div>
      </PixelPanel>

      <PixelPanel className="space-y-3">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-crt-muted">Notes</p>
        <textarea
          className="min-h-[96px] w-full border border-crt-border bg-crt-bg px-3 py-2 text-sm text-crt-text focus:border-crt-accent focus:outline-none"
          onChange={(event) => updateField("notes", event.target.value)}
          placeholder="Optional campaign notes for equip rules."
          value={settings.notes ?? ""}
        />
      </PixelPanel>

      <div className="flex justify-end">
        <button
          className="inline-flex items-center border-2 border-crt-accent px-4 py-2 text-xs font-bold uppercase tracking-[0.22em] text-crt-accent transition hover:bg-crt-accent hover:text-crt-bg disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!canSave}
          onClick={() => void handleSave()}
          type="button"
        >
          {isSaving ? "Saving..." : "Save Equip Settings"}
        </button>
      </div>
    </div>
  );
}
