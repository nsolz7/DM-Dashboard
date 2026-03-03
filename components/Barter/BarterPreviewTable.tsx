"use client";

import type { AssignablePlayerOption, BarterTargetDelta } from "@/types";
import { formatCurrencyAmount } from "@/lib/currency";

interface BarterPreviewTableProps {
  players: AssignablePlayerOption[];
  targets: BarterTargetDelta[];
}

function resolvePlayerName(players: AssignablePlayerOption[], playerId: string): string {
  return players.find((player) => player.id === playerId)?.name ?? playerId;
}

export function BarterPreviewTable({ players, targets }: BarterPreviewTableProps) {
  if (!targets.length) {
    return (
      <div className="border border-dashed border-crt-border px-4 py-4 text-sm text-crt-muted">
        Complete the form to preview affected players.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto border-2 border-crt-border">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-crt-panel-2 text-[10px] uppercase tracking-[0.2em] text-crt-muted">
          <tr>
            <th className="px-3 py-2">Player</th>
            <th className="px-3 py-2">Net Delta</th>
          </tr>
        </thead>
        <tbody>
          {targets.map((target) => (
            <tr className="border-t border-crt-border" key={`${target.playerId}-${formatCurrencyAmount(target.delta)}`}>
              <td className="px-3 py-3 font-bold uppercase tracking-[0.08em] text-crt-text">
                {resolvePlayerName(players, target.playerId)}
              </td>
              <td className="px-3 py-3 text-crt-muted">{formatCurrencyAmount(target.delta)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
