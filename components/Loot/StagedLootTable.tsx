"use client";

import { faArrowDown, faArrowUp, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import type { LootDropEntry } from "@/types";
import { PixelButton } from "@/components/ui/PixelButton";
import { PixelInput } from "@/components/ui/PixelInput";
import { decodeDraggedEntry, LOOT_DRAG_MIME } from "@/components/Loot/entryHelpers";

interface StagedLootTableProps {
  entries: LootDropEntry[];
  onAddEntry: (entry: LootDropEntry) => void;
  onMoveEntry: (entryId: string, direction: "up" | "down") => void;
  onRemoveEntry: (entryId: string) => void;
  onUpdateQuantity: (entryId: string, quantity: number) => void;
}

export function StagedLootTable({
  entries,
  onAddEntry,
  onMoveEntry,
  onRemoveEntry,
  onUpdateQuantity
}: StagedLootTableProps) {
  return (
    <div
      className="rounded-sm border-2 border-crt-border bg-crt-panel p-2"
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(event) => {
        event.preventDefault();
        const entry = decodeDraggedEntry(event.dataTransfer.getData(LOOT_DRAG_MIME));

        if (entry) {
          onAddEntry(entry);
        }
      }}
    >
      <div className="border-b border-crt-border px-2 pb-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-crt-muted">Staged Loot Drop</p>
      </div>

      <div className="mt-2 max-h-[320px] space-y-2 overflow-y-auto px-1 pb-1">
        {entries.length ? (
          entries.map((entry, index) => (
            <div className="grid gap-2 border border-crt-border bg-crt-panel-2 px-3 py-2" key={entry.entryId}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold uppercase tracking-[0.08em] text-crt-text">
                    {entry.namePreview ?? entry.ref?.id ?? entry.customItemId ?? entry.entryId}
                  </p>
                  <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-crt-muted">
                    {entry.kind === "custom_item" ? "custom item" : entry.ref?.type ?? "item"}
                    {entry.rarity ? ` / ${entry.rarity}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <PixelButton
                    disabled={index === 0}
                    onClick={() => onMoveEntry(entry.entryId, "up")}
                    variant="ghost"
                  >
                    <FontAwesomeIcon fixedWidth icon={faArrowUp} />
                  </PixelButton>
                  <PixelButton
                    disabled={index === entries.length - 1}
                    onClick={() => onMoveEntry(entry.entryId, "down")}
                    variant="ghost"
                  >
                    <FontAwesomeIcon fixedWidth icon={faArrowDown} />
                  </PixelButton>
                  <PixelButton onClick={() => onRemoveEntry(entry.entryId)} variant="danger">
                    <FontAwesomeIcon fixedWidth icon={faTrash} />
                  </PixelButton>
                </div>
              </div>
              <div className="grid max-w-[160px] gap-2">
                <span className="text-[10px] uppercase tracking-[0.16em] text-crt-muted">Quantity</span>
                <PixelInput
                  inputMode="numeric"
                  min="1"
                  onChange={(event) => onUpdateQuantity(entry.entryId, Number.parseInt(event.target.value, 10) || 1)}
                  type="number"
                  value={String(entry.quantity)}
                />
              </div>
            </div>
          ))
        ) : (
          <p className="px-2 py-4 text-sm text-crt-muted">
            Drag item results into this area or use the add button to stage loot entries.
          </p>
        )}
      </div>
    </div>
  );
}
