"use client";

import { useState } from "react";
import { useToastyStore } from "@/lib/store";
import { useTeammates } from "@/lib/store/selectors";
import { CHALLENGES } from "@/lib/challenges";
import type {
  ChallengeId,
  EventConfig,
  Player,
  TeamProgress,
} from "@/lib/types";
import { RenameModal } from "./RenameModal";

const AVATAR_GRADIENTS = [
  "bg-gradient-party",
  "bg-gradient-cool",
  "bg-gradient-done",
];

function topContribution(
  player: Player,
  progress: TeamProgress | null,
  rounds: EventConfig["rounds"],
): { challenge: ChallengeId; value: number } | null {
  if (!progress) return null;
  let best: { challenge: ChallengeId; value: number } | null = null;
  for (let idx = 0; idx < rounds.length; idx++) {
    const cur = progress[idx];
    if (!cur) continue;
    const v = cur.perPlayer?.[player.id] ?? 0;
    if (v <= 0) continue;
    if (!best || v > best.value)
      best = { challenge: rounds[idx].challenge, value: v };
  }
  return best;
}

function formatStat(challenge: ChallengeId, value: number): string {
  switch (challenge) {
    case "distance":
      return `${(value / 1609).toFixed(1)} mi`;
    case "steps":
      if (value >= 1000) return `${(value / 1000).toFixed(1)}k steps`;
      return `${Math.floor(value)} steps`;
    case "taps":
      if (value >= 1000) return `${(value / 1000).toFixed(1)}k taps`;
      return `${Math.floor(value)} taps`;
    case "spin":
      return `${Math.floor(value / 360)} spins`;
    default:
      return CHALLENGES[challenge].formatProgress(value, 0);
  }
}

export function TeammateOrbit() {
  const teammates = useTeammates();
  const myProgress = useToastyStore((s) => s.getMyTeamProgress());
  const myPlayerId = useToastyStore((s) => s.myPlayerId);
  const myDeviceId = useToastyStore((s) => s.myDeviceId);
  const event = useToastyStore((s) => s.event);
  const playersMap = useToastyStore((s) => s.players);

  const [editing, setEditing] = useState(false);

  if (!teammates.length) {
    return (
      <div className="text-center text-xs opacity-60 py-3">
        Waiting on teammates...
      </div>
    );
  }

  // Stable order, me first
  const ordered = [...teammates].sort((a, b) => {
    if (a.id === myPlayerId) return -1;
    if (b.id === myPlayerId) return 1;
    return a.joinedAt.localeCompare(b.joinedAt);
  });

  const me = myPlayerId ? playersMap[myPlayerId] ?? null : null;

  async function handleRename({ name }: { name: string }) {
    if (!event || !me || !myDeviceId) return;
    const res = await fetch(
      `/api/events/${event.code}/players/${me.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, deviceId: myDeviceId }),
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(text || `Rename failed (${res.status})`);
    }
    const data = (await res.json()) as { player: Player };
    useToastyStore.setState({
      players: { ...playersMap, [data.player.id]: data.player },
    });
  }

  return (
    <>
      <div className="flex justify-center gap-2 my-3">
        {ordered.map((p, i) => {
          const top = topContribution(p, myProgress, event?.rounds ?? []);
          const initial = (p.name?.trim()?.[0] ?? "?").toUpperCase();
          const isMe = p.id === myPlayerId;
          const InnerEl = isMe ? "button" : "div";
          return (
            <InnerEl
              key={p.id}
              {...(isMe
                ? {
                    type: "button" as const,
                    onClick: () => setEditing(true),
                    "aria-label": "Edit your name",
                  }
                : {})}
              className={`w-20 text-center ${
                isMe ? "active:scale-[0.97] transition-transform" : ""
              }`}
            >
              <div
                className={`w-12 h-12 rounded-full mx-auto mb-1 flex items-center justify-center font-extrabold text-lg ${
                  AVATAR_GRADIENTS[i % AVATAR_GRADIENTS.length]
                } ${isMe ? "ring-2 ring-white" : ""}`}
              >
                {initial}
              </div>
              <div className="text-[11px] font-semibold truncate">
                {p.name}
                {isMe ? " (you) ✎" : ""}
              </div>
              <div className="text-[10px] opacity-70 truncate">
                {top ? formatStat(top.challenge, top.value) : "warming up"}
              </div>
            </InnerEl>
          );
        })}
      </div>

      {editing && me && (
        <RenameModal
          title="Edit your name"
          initial={me.name}
          busyLabel="RENAMING…"
          onClose={() => setEditing(false)}
          onSubmit={handleRename}
        />
      )}
    </>
  );
}
