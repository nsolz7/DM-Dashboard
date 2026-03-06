import { NextResponse } from "next/server";

import { getCompendiumLinkedRecord } from "@/lib/compendium/api";
import { toStringValue } from "@/lib/utils";

interface LinkedRecordRequest {
  id: string;
  fallbackName?: string;
}

function parseRecordRequests(value: unknown): LinkedRecordRequest[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.reduce<LinkedRecordRequest[]>((accumulator, entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return accumulator;
    }

    const candidate = entry as Record<string, unknown>;
    const id = toStringValue(candidate.id);

    if (!id) {
      return accumulator;
    }

    accumulator.push({
      id,
      fallbackName: toStringValue(candidate.fallbackName) ?? undefined
    });
    return accumulator;
  }, []);
}

export async function POST(request: Request) {
  let body: { records?: unknown };

  try {
    body = (await request.json()) as { records?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const records = parseRecordRequests(body.records);

  try {
    const resolved = await Promise.all(records.map((record) => getCompendiumLinkedRecord(record.id, record.fallbackName)));
    return NextResponse.json({ records: resolved });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to resolve linked records.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
