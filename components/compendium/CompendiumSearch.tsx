"use client";

import { faSearch } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import type { CompendiumResult } from "@/types";
import { CompendiumTypeIcon } from "@/components/shared/CompendiumTypeIcon";
import { ErrorState } from "@/components/shared/ErrorState";
import { PixelButton } from "@/components/ui/PixelButton";
import { PixelInput } from "@/components/ui/PixelInput";
import { PixelPanel } from "@/components/ui/PixelPanel";
import { getTypeaheadResults } from "@/lib/compendium/api";

const rotatingTypes = ["Monsters", "Items", "Spells", "NPCs", "Backgrounds", "Classes"];
const longestRotatingType = rotatingTypes.reduce((longest, current) =>
  current.length > longest.length ? current : longest
);

export function CompendiumSearch() {
  const router = useRouter();
  const [rotationIndex, setRotationIndex] = useState(0);
  const [query, setQuery] = useState("");
  const [typeahead, setTypeahead] = useState<CompendiumResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setRotationIndex((current) => (current + 1) % rotatingTypes.length);
    }, 2200);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setTypeahead([]);
      setError(null);
      return;
    }

    const timeout = window.setTimeout(() => {
      void getTypeaheadResults(query)
        .then((results) => {
          setTypeahead(results);
          setError(null);
        })
        .catch((loadError) => {
          setTypeahead([]);
          setError(loadError instanceof Error ? loadError.message : "Unable to fetch typeahead.");
        });
    }, 180);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [query]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!query.trim()) {
      return;
    }

    router.push(`/compendium/results?q=${encodeURIComponent(query.trim())}&page=1`);
  }

  const currentType = rotatingTypes[rotationIndex];
  const nextType = rotatingTypes[(rotationIndex + 1) % rotatingTypes.length];

  return (
    <div className="mx-auto flex min-h-[calc(100vh-180px)] max-w-4xl items-center justify-center">
      <div className="w-full space-y-6">
        <div className="space-y-3 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.4em] text-crt-accent">Compendium</p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <h2 className="text-4xl font-bold uppercase tracking-[0.1em] text-crt-text">Search for</h2>
            <span
              aria-label={`Search for ${currentType}`}
              aria-live="polite"
              className="compendium-flip"
            >
              <span aria-hidden="true" className="compendium-flip__sizer">
                {longestRotatingType}
              </span>
              <span className="compendium-flip__stage" key={rotationIndex}>
                <span className="compendium-flip__face compendium-flip__face--front">{currentType}</span>
                <span className="compendium-flip__face compendium-flip__face--top">{nextType}</span>
              </span>
            </span>
          </div>
          <p className="text-sm text-crt-muted">
            Powered by the local DnData API. Typeahead pulls mixed dataset suggestions from one endpoint.
          </p>
        </div>
        <PixelPanel className="space-y-4">
          <form className="flex flex-col gap-3 md:flex-row" onSubmit={handleSubmit}>
            <PixelInput
              className="text-base"
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Search for ${rotatingTypes[rotationIndex].toLowerCase()} by name`}
              value={query}
            />
            <PixelButton className="md:w-[220px]" type="submit">
              <FontAwesomeIcon className="mr-2 text-[11px]" fixedWidth icon={faSearch} />
              Search
            </PixelButton>
          </form>
          {error ? <ErrorState body={error} title="DnData API" /> : null}
          {typeahead.length ? (
            <div className="grid gap-2">
              {typeahead.map((item) => (
                <Link
                  className="flex items-center justify-between gap-3 border-2 border-crt-border bg-crt-panel-2 px-4 py-3 text-sm transition hover:border-crt-accent"
                  href={`/compendium/${item.type}/${encodeURIComponent(item.id)}`}
                  key={`${item.type}-${item.id}`}
                >
                  <span className="flex min-w-0 items-center gap-2 font-bold uppercase tracking-[0.08em] text-crt-text">
                    <CompendiumTypeIcon className="text-crt-accent" type={item.type} />
                    <span className="truncate">{item.name}</span>
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.2em] text-crt-muted">[{item.type}]</span>
                </Link>
              ))}
            </div>
          ) : query.trim() ? (
            <p className="text-sm text-crt-muted">No typeahead matches yet. Try the full results page.</p>
          ) : null}
        </PixelPanel>
      </div>
    </div>
  );
}
