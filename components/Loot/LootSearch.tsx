"use client";

import { useEffect, useMemo, useState } from "react";
import { faArrowUpWideShort, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import type { LootDropEntry, LootSearchItem, LootSortKey } from "@/types";
import { PixelButton } from "@/components/ui/PixelButton";
import { PixelInput } from "@/components/ui/PixelInput";
import { PixelSelect } from "@/components/ui/PixelSelect";
import { searchCompendiumItems } from "@/lib/loot";
import { createEntryFromSearchItem, encodeDraggedEntry, LOOT_DRAG_MIME } from "@/components/Loot/entryHelpers";

interface LootSearchProps {
  onAddEntry: (entry: LootDropEntry) => void;
}

function compareBySortKey(left: LootSearchItem, right: LootSearchItem, sortKey: LootSortKey): number {
  if (sortKey === "type") {
    const typeCompare = left.type.localeCompare(right.type);
    return typeCompare !== 0 ? typeCompare : left.name.localeCompare(right.name);
  }

  if (sortKey === "rarity") {
    const rarityCompare = (left.rarity ?? "").localeCompare(right.rarity ?? "");
    return rarityCompare !== 0 ? rarityCompare : left.name.localeCompare(right.name);
  }

  return left.name.localeCompare(right.name);
}

export function LootSearch({ onAddEntry }: LootSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LootSearchItem[]>([]);
  const [sortKey, setSortKey] = useState<LootSortKey>("name");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setError(null);
      return;
    }

    const timeout = window.setTimeout(() => {
      setIsLoading(true);

      void searchCompendiumItems(query)
        .then((rows) => {
          setResults(rows);
          setError(null);
        })
        .catch((loadError) => {
          setResults([]);
          setError(loadError instanceof Error ? loadError.message : "Unable to search compendium items.");
        })
        .finally(() => {
          setIsLoading(false);
        });
    }, 180);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [query]);

  const sortedResults = useMemo(
    () => [...results].sort((left, right) => compareBySortKey(left, right, sortKey)),
    [results, sortKey]
  );

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-[1fr_180px]">
        <PixelInput
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search item name and drag into staged loot"
          value={query}
        />
        <PixelSelect onChange={(event) => setSortKey(event.target.value as LootSortKey)} value={sortKey}>
          <option value="name">Sort: Name</option>
          <option value="type">Sort: Type</option>
          <option value="rarity">Sort: Rarity</option>
        </PixelSelect>
      </div>

      <div className="rounded-sm border-2 border-crt-border bg-crt-panel-2 p-2">
        <div className="flex items-center justify-between border-b border-crt-border px-2 pb-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-crt-muted">Compendium Item Typeahead</p>
          <span className="text-[10px] uppercase tracking-[0.16em] text-crt-muted">
            <FontAwesomeIcon className="mr-1" fixedWidth icon={faArrowUpWideShort} />
            drag or add
          </span>
        </div>
        <div className="mt-2 max-h-[240px] space-y-2 overflow-y-auto px-1 pb-1">
          {isLoading ? (
            <p className="px-2 py-3 text-sm text-crt-muted">Searching items...</p>
          ) : error ? (
            <p className="px-2 py-3 text-sm text-crt-danger">{error}</p>
          ) : sortedResults.length ? (
            sortedResults.map((item) => (
              <div
                className="flex items-center justify-between gap-3 border border-crt-border bg-crt-panel px-3 py-2"
                draggable
                key={item.id}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "copy";
                  event.dataTransfer.setData(LOOT_DRAG_MIME, encodeDraggedEntry(createEntryFromSearchItem(item)));
                }}
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold uppercase tracking-[0.08em] text-crt-text">{item.name}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-crt-muted">
                    {item.type}
                    {item.rarity ? ` / ${item.rarity}` : ""}
                  </p>
                </div>
                <PixelButton onClick={() => onAddEntry(createEntryFromSearchItem(item))} variant="secondary">
                  <FontAwesomeIcon fixedWidth icon={faPlus} />
                </PixelButton>
              </div>
            ))
          ) : query.trim() ? (
            <p className="px-2 py-3 text-sm text-crt-muted">No item matches. Try a broader query.</p>
          ) : (
            <p className="px-2 py-3 text-sm text-crt-muted">Start typing to search compendium items.</p>
          )}
        </div>
      </div>
    </div>
  );
}
