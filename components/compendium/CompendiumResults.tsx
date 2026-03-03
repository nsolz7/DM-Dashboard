"use client";

import { faSearch } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import type { CompendiumSearchResponse } from "@/types";
import { searchCompendium } from "@/lib/compendium/api";
import { CompendiumTypeIcon } from "@/components/shared/CompendiumTypeIcon";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { LoadingPanel } from "@/components/shared/LoadingPanel";
import { PixelButton } from "@/components/ui/PixelButton";
import { PixelInput } from "@/components/ui/PixelInput";
import { PixelPanel } from "@/components/ui/PixelPanel";

export function CompendiumResults() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const parsedPage = Number(searchParams.get("page") ?? "1");
  const currentPage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  const [draftQuery, setDraftQuery] = useState(query);
  const [results, setResults] = useState<CompendiumSearchResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraftQuery(query);
  }, [query]);

  useEffect(() => {
    let isMounted = true;

    if (!query.trim()) {
      setResults({
        items: [],
        total: 0,
        count: 0,
        limit: 12,
        offset: 0
      });
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    void searchCompendium(query, currentPage)
      .then((payload) => {
        if (isMounted) {
          setResults(payload);
        }
      })
      .catch((loadError) => {
        if (isMounted) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load search results.");
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [query, currentPage]);

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push(`/compendium/results?q=${encodeURIComponent(draftQuery.trim())}&page=1`);
  }

  function goToPage(page: number) {
    router.push(`/compendium/results?q=${encodeURIComponent(query)}&page=${page}`);
  }

  if (isLoading) {
    return <LoadingPanel label="Loading compendium results..." />;
  }

  if (error) {
    return <ErrorState body={error} title="DnData API" />;
  }

  if (!query.trim()) {
    return <EmptyState body="Enter a search term to query the local DnData API." title="No Query" />;
  }

  const totalPages = results ? Math.max(1, Math.ceil(results.total / results.limit)) : 1;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-[0.35em] text-crt-accent">Compendium</p>
        <h2 className="text-3xl font-bold uppercase tracking-[0.12em] text-crt-text">
          Results for &quot;{query}&quot;
        </h2>
        <p className="text-sm text-crt-muted">
          Showing {results?.count ?? 0} of {results?.total ?? 0} results.
        </p>
      </div>

      <PixelPanel>
        <form className="flex flex-col gap-3 md:flex-row" onSubmit={submitSearch}>
          <PixelInput onChange={(event) => setDraftQuery(event.target.value)} value={draftQuery} />
          <PixelButton className="md:w-[220px]" type="submit">
            <FontAwesomeIcon className="mr-2 text-[11px]" fixedWidth icon={faSearch} />
            Refresh Search
          </PixelButton>
        </form>
      </PixelPanel>

      {results?.items.length ? (
        <div className="grid gap-4">
          {results.items.map((item) => (
            <Link
              className="block border-2 border-crt-border bg-crt-panel px-5 py-4 transition hover:border-crt-accent"
              href={`/compendium/${item.type}/${encodeURIComponent(item.id)}`}
              key={`${item.type}-${item.id}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-lg font-bold uppercase tracking-[0.08em] text-crt-text">
                    <CompendiumTypeIcon className="text-crt-accent" type={item.type} />
                    <span className="truncate">{item.name}</span>
                  </p>
                  <p className="mt-1 text-xs uppercase tracking-[0.2em] text-crt-muted">
                    {item.type} / {item.id}
                  </p>
                </div>
                <span className="border border-crt-border px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-crt-accent">
                  {item.type}
                </span>
              </div>
              <p className="mt-3 text-sm text-crt-muted">{item.summary ?? "Open for full details."}</p>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState body="The query returned no matching records." title="No Results" />
      )}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-xs uppercase tracking-[0.2em] text-crt-muted">
          Page {currentPage} of {totalPages}
        </p>
        <div className="flex gap-3">
          <PixelButton disabled={currentPage <= 1} onClick={() => goToPage(currentPage - 1)} variant="secondary">
            Previous
          </PixelButton>
          <PixelButton
            disabled={currentPage >= totalPages || !results?.items.length}
            onClick={() => goToPage(currentPage + 1)}
            variant="secondary"
          >
            Next
          </PixelButton>
        </div>
      </div>
    </div>
  );
}
