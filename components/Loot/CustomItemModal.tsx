"use client";

import { useEffect, useState } from "react";

import type { CustomItemDoc } from "@/types";
import { createCustomItem } from "@/lib/customItems";
import { PixelButton } from "@/components/ui/PixelButton";
import { PixelInput } from "@/components/ui/PixelInput";

interface CustomItemModalProps {
  campaignId: string;
  isOpen: boolean;
  onClose: () => void;
  onCreated: (item: CustomItemDoc) => void;
}

const textareaClassName =
  "w-full border-2 border-crt-border bg-crt-panel px-4 py-3 text-sm text-crt-text outline-none transition placeholder:text-crt-muted focus:border-crt-accent";

export function CustomItemModal({ campaignId, isOpen, onClose, onCreated }: CustomItemModalProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState("wondrous");
  const [rarity, setRarity] = useState("");
  const [description, setDescription] = useState("");
  const [value, setValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setName("");
      setType("wondrous");
      setRarity("");
      setDescription("");
      setValue("");
      setError(null);
      setIsSaving(false);
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  async function handleCreate() {
    if (isSaving) {
      return;
    }

    setError(null);
    setIsSaving(true);

    try {
      const item = await createCustomItem({
        campaignId,
        name,
        type,
        rarity: rarity || null,
        description,
        value: value.trim() ? value.trim() : null
      });

      onCreated(item);
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to create custom item.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-crt-bg/80 p-4">
      <div className="w-full max-w-2xl border-2 border-crt-border bg-crt-panel p-5 shadow-[8px_8px_0_0_rgba(6,12,24,0.5)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-crt-accent">Custom Item</p>
            <h3 className="mt-2 text-xl font-bold uppercase tracking-[0.1em] text-crt-text">Create Item</h3>
          </div>
          <PixelButton onClick={onClose} variant="ghost">
            Close
          </PixelButton>
        </div>

        {error ? (
          <div className="mt-4 border border-crt-danger px-3 py-3 text-xs uppercase tracking-[0.14em] text-crt-danger">{error}</div>
        ) : null}

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-[0.16em] text-crt-muted">Name</label>
            <PixelInput onChange={(event) => setName(event.target.value)} value={name} />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-[0.16em] text-crt-muted">Type</label>
            <PixelInput onChange={(event) => setType(event.target.value)} value={type} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="text-[10px] font-bold uppercase tracking-[0.16em] text-crt-muted">Rarity</label>
            <PixelInput onChange={(event) => setRarity(event.target.value)} placeholder="Optional" value={rarity} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="text-[10px] font-bold uppercase tracking-[0.16em] text-crt-muted">Description</label>
            <textarea
              className={textareaClassName}
              onChange={(event) => setDescription(event.target.value)}
              rows={5}
              value={description}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="text-[10px] font-bold uppercase tracking-[0.16em] text-crt-muted">Value / Notes</label>
            <PixelInput onChange={(event) => setValue(event.target.value)} placeholder="Optional" value={value} />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <PixelButton onClick={onClose} variant="secondary">
            Cancel
          </PixelButton>
          <PixelButton disabled={isSaving} onClick={() => void handleCreate()}>
            {isSaving ? "Saving..." : "Create & Add"}
          </PixelButton>
        </div>
      </div>
    </div>
  );
}
