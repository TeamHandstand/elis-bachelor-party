"use client";
import { useState } from "react";
import Link from "next/link";
import type { GetEventResponse } from "@/lib/api/contract";
import type { EventConfig, Player, Team } from "@/lib/types";
import EventConfigPanel from "./EventConfigPanel";
import HostMonitor from "./HostMonitor";
import HostPlayerPicker from "./HostPlayerPicker";
import QrCard from "./QrCard";
import StartButton from "./StartButton";
import ResetButtons from "./ResetButtons";
import EndButton from "./EndButton";
import TeamBuilder from "./TeamBuilder";

interface Props {
  initial: GetEventResponse;
}

type Tab = "config" | "teams" | "monitor";

export default function HostDashboard({ initial }: Props) {
  const [event, setEvent] = useState<EventConfig>(initial.event);
  const [teams, setTeams] = useState<Team[]>(initial.teams);
  const [players, setPlayers] = useState<Player[]>(initial.players);
  const [tab, setTab] = useState<Tab>("config");

  function applyChange(next: {
    event?: EventConfig;
    teams?: Team[];
    players?: Player[];
  }) {
    if (next.event) setEvent(next.event);
    if (next.teams) setTeams(next.teams);
    if (next.players) setPlayers(next.players);
  }

  return (
    <main className="min-h-screen pb-12">
      <StickyHeader
        event={event}
        teams={teams}
        players={players}
        onEvent={(e) => setEvent(e)}
        onReset={({ event: e, teams: t, players: p }) => {
          setEvent(e);
          setTeams(t);
          setPlayers(p);
        }}
      />

      <div className="max-w-6xl mx-auto px-4 mt-4">
        <Tabs tab={tab} setTab={setTab} status={event.status} />

        <div className="mt-5">
          {tab === "config" ? (
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-6">
              <EventConfigPanel
                event={event}
                onSaved={(e) => setEvent(e)}
              />
              <div className="lg:order-2 order-first">
                <QrCard code={event.code} />
              </div>
            </div>
          ) : null}

          {tab === "teams" ? (
            <div className="space-y-4">
              <HostPlayerPicker
                event={event}
                players={players}
                onChange={(e) => setEvent(e)}
              />
              <TeamBuilder
                event={event}
                teams={teams}
                players={players}
                onChange={applyChange}
              />
            </div>
          ) : null}

          {tab === "monitor" ? <HostMonitor code={event.code} /> : null}
        </div>
      </div>
    </main>
  );
}

function StickyHeader({
  event,
  teams,
  players,
  onEvent,
  onReset,
}: {
  event: EventConfig;
  teams: Team[];
  players: Player[];
  onEvent: (e: EventConfig) => void;
  onReset: (n: { event: EventConfig; teams: Team[]; players: Player[] }) => void;
}) {
  return (
    <header className="sticky top-0 z-30 bg-bg/95 backdrop-blur border-b border-white/10">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3 flex-wrap">
        <Link
          href="/host"
          className="text-sm opacity-70 hover:opacity-100"
          aria-label="Back to host home"
        >
          ← Events
        </Link>
        <div className="flex-1 min-w-0">
          <div className="font-display text-lg sm:text-xl font-extrabold truncate">
            {event.title || "Untitled event"}
          </div>
          <div className="text-xs opacity-60 flex items-center gap-3 flex-wrap">
            <span className="font-bold tracking-widest text-accent-orange">
              {event.code}
            </span>
            <span>·</span>
            <span>{players.length} players</span>
            <span>·</span>
            <span>{teams.length} teams</span>
            <span>·</span>
            <span>
              {event.hostPlayerId ? (
                <>
                  host:{" "}
                  <span className="text-accent-orange font-bold">
                    👑{" "}
                    {players.find((p) => p.id === event.hostPlayerId)?.name ??
                      "?"}
                  </span>
                </>
              ) : (
                <span className="opacity-50">no host set</span>
              )}
            </span>
            <span>·</span>
            <span>
              status:{" "}
              <span
                className={
                  event.status === "active"
                    ? "text-accent-green"
                    : event.status === "finished"
                      ? "text-accent-orange"
                      : ""
                }
              >
                {event.status}
              </span>
            </span>
            {event.status === "finished" ? (
              <Link
                href={`/host/${event.code}/results`}
                className="text-accent-orange underline"
              >
                view results →
              </Link>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 items-start">
          <StartButton event={event} players={players} onStarted={onEvent} />
          <ResetButtons event={event} onReset={onReset} />
          <EndButton event={event} teams={teams} onEnded={onEvent} />
        </div>
      </div>
    </header>
  );
}

function Tabs({
  tab,
  setTab,
  status,
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  status: EventConfig["status"];
}) {
  const items: Array<{ id: Tab; label: string; emoji: string }> = [
    { id: "config", label: "Config + QR", emoji: "⚙️" },
    { id: "teams", label: "Team builder", emoji: "👥" },
    {
      id: "monitor",
      label: status === "active" ? "Live monitor" : "Monitor",
      emoji: "📡",
    },
  ];
  return (
    <div className="bg-bg-card rounded-xl2 p-1 inline-flex gap-1 max-w-full overflow-x-auto">
      {items.map((it) => (
        <button
          key={it.id}
          onClick={() => setTab(it.id)}
          className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-colors ${
            tab === it.id
              ? "bg-gradient-party text-white"
              : "opacity-70 hover:opacity-100"
          }`}
        >
          <span className="mr-1">{it.emoji}</span>
          {it.label}
        </button>
      ))}
    </div>
  );
}
