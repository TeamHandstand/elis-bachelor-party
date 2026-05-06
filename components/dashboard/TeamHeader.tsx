"use client";

import { useState } from "react";
import { useToastyStore } from "@/lib/store";
import { useStandings } from "@/lib/store/selectors";
import { RenameModal } from "./RenameModal";

const PLACE_LABELS = ["1st", "2nd", "3rd", "4th", "5th"];

export function TeamHeader() {
  const team = useToastyStore((s) => s.getMyTeam());
  const event = useToastyStore((s) => s.event);
  const standings = useStandings();
  const myProgress = useToastyStore((s) => s.getMyTeamProgress());
  const myDeviceId = useToastyStore((s) => s.myDeviceId);
  const teams = useToastyStore((s) => s.teams);
  const [editing, setEditing] = useState(false);

  if (!team || !event) {
    return (
      <div className="rounded-2xl bg-gradient-party p-4 text-center">
        <div className="font-display text-xl font-extrabold tracking-wider">
          NO TEAM YET
        </div>
        <div className="text-xs opacity-90 mt-1">
          Host hasn’t put you on a squad
        </div>
      </div>
    );
  }

  const placeIdx = standings.findIndex((s) => s.team.id === team.id);
  const place =
    placeIdx >= 0 ? PLACE_LABELS[placeIdx] ?? `${placeIdx + 1}th` : "—";
  const totalRounds = event.rounds.length;
  let doneCount = 0;
  if (myProgress) {
    for (let i = 0; i < totalRounds; i++) {
      if (myProgress[i]?.completed) doneCount += 1;
    }
  }

  async function handleRename({
    name,
    emoji,
  }: {
    name: string;
    emoji?: string;
  }) {
    if (!myDeviceId || !team || !event) return;
    const res = await fetch(
      `/api/events/${event.code}/teams/${team.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          ...(emoji !== undefined ? { emoji } : {}),
          deviceId: myDeviceId,
        }),
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(text || `Rename failed (${res.status})`);
    }
    const data = (await res.json()) as { team: typeof team };
    // Optimistically apply locally — PubNub also publishes team-renamed
    // which will reconcile any remaining clients.
    useToastyStore.setState({
      teams: { ...teams, [data.team.id]: data.team },
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="w-full rounded-2xl bg-gradient-party p-4 text-center shadow-lg active:scale-[0.99] transition-transform text-left"
        aria-label="Edit team name and emoji"
      >
        <div className="flex items-center justify-center gap-2">
          <span className="px-2 py-0.5 rounded-full bg-black/30 text-[10px] uppercase tracking-[0.2em] font-extrabold">
            👇 your team
          </span>
        </div>
        <div className="font-display text-2xl font-extrabold tracking-wider drop-shadow mt-2">
          {team.emoji} {team.name.toUpperCase()}
          <span className="ml-2 text-sm opacity-80 align-middle">✎</span>
        </div>
        <div className="text-xs uppercase tracking-widest opacity-95 mt-1 font-bold">
          {place} place · {doneCount} of {totalRounds} done
        </div>
      </button>

      {editing && (
        <RenameModal
          title="Edit your team"
          initial={team.name}
          emojiInitial={team.emoji}
          busyLabel="RENAMING…"
          onClose={() => setEditing(false)}
          onSubmit={handleRename}
        />
      )}
    </>
  );
}
