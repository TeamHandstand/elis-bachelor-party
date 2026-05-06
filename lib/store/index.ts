"use client";
import { create } from "zustand";
import type {
  ChallengeId,
  EventConfig,
  Player,
  ProgressMsg,
  Team,
  TeamProgress,
} from "@/lib/types";
import { CHALLENGES } from "@/lib/challenges";

// ---------- Helpers ----------

function emptyCell() {
  return {
    value: 0,
    completed: false,
    completedAt: null,
    perPlayer: {} as Record<string, number>,
    guesses: [] as Array<{ playerId: string; errorDeg: number }>,
  };
}

function emptyProgress(): TeamProgress {
  // Empty by default — cells are lazily created when the first message
  // for that round arrives. UI consumers must tolerate missing keys.
  return {} as TeamProgress;
}

function ensureCell(tp: TeamProgress, roundIndex: number) {
  let cur = tp[roundIndex];
  if (!cur) {
    cur = emptyCell();
    tp[roundIndex] = cur;
  }
  return cur;
}

// ---------- Store shape ----------

export interface ToastyStore {
  // identity / config (set on join)
  event: EventConfig | null;
  myPlayerId: string | null;
  myDeviceId: string | null;
  myTeamId: string | null;

  // roster (subscribed via PubNub presence + DB initial fetch)
  players: Record<string, Player>;
  teams: Record<string, Team>;

  // progress, indexed by team -> round index
  progress: Record<string /*teamId*/, TeamProgress>;

  // ephemeral live levels for scream/shake (last sample per player)
  liveLevels: Record<string /*playerId*/, Partial<Record<"scream" | "shake", { level: number; ts: number }>>>;

  // ---- actions ----
  bootstrap(args: {
    event: EventConfig;
    teams: Team[];
    players: Player[];
    myPlayerId: string;
    myDeviceId: string;
  }): void;

  receive(msg: ProgressMsg): void;

  setEventStatus(status: EventConfig["status"], winnerTeamId?: string | null): void;

  // Recompute completion flags for a team based on current progress.
  recomputeCompletion(teamId: string): void;

  // Apply a server-persisted progress snapshot. Used on first bootstrap to
  // recover state across page refreshes. Per-cell MAX-merge with what's
  // already in memory so we don't lose more-recent live updates.
  hydrateProgress(
    rows: Array<{
      teamId: string;
      roundIndex: number;
      challenge: ChallengeId;
      value: number;
      completed: boolean;
      completedAt: number | null;
    }>,
  ): void;

  // Wipe all team progress (used when host resets).
  clearAllProgress(): void;

  // ---- selectors (only methods returning STABLE references; arrays/derived
  //   collections live in lib/store/selectors.ts as memoized hooks to avoid
  //   useSyncExternalStore tearing → React #185 in production) ----
  getMyTeam(): Team | null;
  isTeamFinished(teamId: string): boolean;
  getMyTeamProgress(): TeamProgress | null;
}

export const useToastyStore = create<ToastyStore>((set, get) => ({
  event: null,
  myPlayerId: null,
  myDeviceId: null,
  myTeamId: null,
  players: {},
  teams: {},
  progress: {},
  liveLevels: {},

  bootstrap: ({ event, teams, players, myPlayerId, myDeviceId }) => {
    const state = get();
    // Preserve in-memory progress when re-bootstrapping the SAME event
    // (e.g. navigating /play <-> /play/[challenge]). Otherwise PubNub
    // history-replay gaps (lossy retention, or live dB messages flooding
    // the recent-100 window) would silently drop accumulated taps/steps/etc.
    // For a different event, start clean.
    const sameEvent = state.event?.id === event.id;

    const teamMap: Record<string, Team> = {};
    const newProgress: Record<string, TeamProgress> = {};
    for (const t of teams) {
      teamMap[t.id] = t;
      newProgress[t.id] =
        sameEvent && state.progress[t.id] ? state.progress[t.id] : emptyProgress();
    }
    const playerMap: Record<string, Player> = {};
    for (const p of players) playerMap[p.id] = p;

    const me = playerMap[myPlayerId];
    set({
      event,
      teams: teamMap,
      players: playerMap,
      progress: newProgress,
      myPlayerId,
      myDeviceId,
      myTeamId: me?.teamId ?? null,
    });
  },

  setEventStatus: (status, winnerTeamId) => {
    const ev = get().event;
    if (!ev) return;
    set({
      event: { ...ev, status, winnerTeamId: winnerTeamId ?? ev.winnerTeamId },
    });
  },

  receive: (msg) => {
    const state = get();

    switch (msg.kind) {
      case "progress": {
        const teamProg = state.progress[msg.teamId];
        if (!teamProg) return;
        const next: TeamProgress = { ...teamProg };
        const cur = ensureCell(next, msg.roundIndex);
        const newValue = cur.value + msg.delta;
        const perPlayer = { ...(cur.perPlayer ?? {}) };
        perPlayer[msg.playerId] = (perPlayer[msg.playerId] ?? 0) + msg.delta;
        next[msg.roundIndex] = { ...cur, value: newValue, perPlayer };
        set({
          progress: { ...state.progress, [msg.teamId]: next },
        });
        get().recomputeCompletion(msg.teamId);
        break;
      }

      case "live": {
        const playerLevels = { ...(state.liveLevels[msg.playerId] ?? {}) };
        playerLevels[msg.challenge] = { level: msg.level, ts: msg.ts };
        set({
          liveLevels: { ...state.liveLevels, [msg.playerId]: playerLevels },
        });
        break;
      }

      case "guess": {
        const teamProg = state.progress[msg.teamId];
        if (!teamProg) return;
        // Generic per-player-once: works for north (errorDeg) AND time-guess
        // (errorDeg = ms deviation from target).
        const next: TeamProgress = { ...teamProg };
        const cur = ensureCell(next, msg.roundIndex);
        const guesses = [...(cur.guesses ?? [])];
        // dedupe per player — they only get one shot
        if (!guesses.some((g) => g.playerId === msg.playerId)) {
          guesses.push({ playerId: msg.playerId, errorDeg: msg.errorDeg });
        }
        next[msg.roundIndex] = {
          ...cur,
          value: guesses.length,
          guesses,
        };
        set({
          progress: { ...state.progress, [msg.teamId]: next },
        });
        get().recomputeCompletion(msg.teamId);
        break;
      }

      case "complete": {
        const teamProg = state.progress[msg.teamId];
        if (!teamProg) return;
        const next: TeamProgress = { ...teamProg };
        const cur = ensureCell(next, msg.roundIndex);
        if (cur.completed) break;
        next[msg.roundIndex] = { ...cur, completed: true, completedAt: msg.ts };
        set({
          progress: { ...state.progress, [msg.teamId]: next },
        });
        get().recomputeCompletion(msg.teamId);
        break;
      }

      case "event-state": {
        get().setEventStatus(msg.status, msg.winnerTeamId);
        break;
      }

      case "player-joined":
      case "team-assigned":
        // Roster mutations: caller refetches via API (these messages just nudge)
        break;

      case "progress-reset": {
        get().clearAllProgress();
        break;
      }

      case "round-reset": {
        const ev = state.event;
        if (!ev) return;
        // Wipe progress for the reset round and everything beyond, but
        // preserve earlier rounds so per-round place medals stay correct.
        const totalRounds = ev.rounds.length;
        const newProgress: Record<string, TeamProgress> = {};
        for (const tid of Object.keys(state.progress)) {
          const tp = state.progress[tid];
          const cleaned: TeamProgress = {};
          for (const key of Object.keys(tp)) {
            const idx = Number(key);
            if (Number.isFinite(idx) && idx < msg.fromIndex) {
              cleaned[idx] = tp[idx];
            }
          }
          // Drop anything past the clamp too (defense).
          for (let i = msg.fromIndex; i < totalRounds; i++) {
            delete cleaned[i];
          }
          newProgress[tid] = cleaned;
        }
        const trimmedWinners = ev.roundWinners.slice(0, msg.fromIndex);
        set({
          progress: newProgress,
          liveLevels: {},
          event: {
            ...ev,
            roundWinners: trimmedWinners,
            currentRoundIndex: null,
            currentRoundStatus: null,
            currentRoundStartsAt: null,
            // Un-finish if we'd been finished — host is redoing rounds.
            status: ev.status === "finished" ? "active" : ev.status,
            winnerTeamId:
              ev.status === "finished" ? null : ev.winnerTeamId,
            finishedAt: ev.status === "finished" ? null : ev.finishedAt,
          },
        });
        break;
      }

      case "round-start": {
        const ev = state.event;
        if (!ev) return;
        // Wipe in-memory progress for this round across all teams so the
        // round starts clean. Past round winners stay in event.roundWinners.
        const newProgress: Record<string, TeamProgress> = {};
        for (const tid of Object.keys(state.progress)) {
          const tp = state.progress[tid];
          const cleaned: TeamProgress = { ...tp };
          delete cleaned[msg.roundIndex];
          newProgress[tid] = cleaned;
        }
        set({
          progress: newProgress,
          liveLevels: {},
          event: {
            ...ev,
            currentRoundIndex: msg.roundIndex,
            currentRoundStatus: "live",
            currentRoundStartsAt: msg.startsAt,
          },
        });
        break;
      }

      case "round-end": {
        const ev = state.event;
        if (!ev) return;
        const trimmed = ev.roundWinners.slice(0, msg.roundIndex);
        const nextWinners = [
          ...trimmed,
          {
            challenge: msg.challenge,
            teamId: msg.winnerTeamId,
            decidedAt: msg.decidedAt,
          },
        ];
        set({
          event: {
            ...ev,
            currentRoundStatus: "decided",
            roundWinners: nextWinners,
          },
        });
        break;
      }

      case "host-changed": {
        const ev = state.event;
        if (!ev) return;
        set({
          event: {
            ...ev,
            hostPlayerId: msg.hostPlayerId,
          },
        });
        break;
      }

      case "player-renamed": {
        const existing = state.players[msg.playerId];
        if (!existing) return;
        set({
          players: {
            ...state.players,
            [msg.playerId]: { ...existing, name: msg.name },
          },
        });
        break;
      }

      case "team-renamed": {
        const existing = state.teams[msg.teamId];
        if (!existing) return;
        set({
          teams: {
            ...state.teams,
            [msg.teamId]: {
              ...existing,
              name: msg.name,
              emoji: msg.emoji,
            },
          },
        });
        break;
      }
    }
  },

  recomputeCompletion: (teamId) => {
    const state = get();
    const ev = state.event;
    const teamProg = state.progress[teamId];
    if (!ev || !teamProg) return;

    const newProg: TeamProgress = { ...teamProg };
    for (let idx = 0; idx < ev.rounds.length; idx++) {
      const round = ev.rounds[idx];
      const def = CHALLENGES[round.challenge];
      const cur = newProg[idx];
      if (!cur || cur.completed) continue;
      const threshold = round.threshold ?? def.defaultThreshold;
      let isDone = false;

      switch (def.aggregation) {
        case "team-total":
          isDone = cur.value >= threshold;
          break;
        case "per-player": {
          const teammates = Object.values(state.players).filter(
            (p) => p.teamId === teamId,
          );
          const perPlayerThreshold = threshold / Math.max(1, teammates.length);
          isDone =
            teammates.length > 0 &&
            teammates.every((p) => (cur.perPlayer?.[p.id] ?? 0) >= perPlayerThreshold);
          break;
        }
        case "per-player-once": {
          const teammates = Object.values(state.players).filter(
            (p) => p.teamId === teamId,
          );
          isDone =
            teammates.length > 0 &&
            teammates.every((p) =>
              (cur.guesses ?? []).some((g) => g.playerId === p.id),
            );
          break;
        }
        case "all-simultaneous":
          // 'complete' message-driven; never auto-completed via threshold here.
          break;
      }

      if (isDone) {
        newProg[idx] = {
          ...cur,
          completed: true,
          completedAt: cur.completedAt ?? Date.now(),
        };
      }
    }

    set({ progress: { ...state.progress, [teamId]: newProg } });
  },

  // ---- selectors ----
  getMyTeam: () => {
    const s = get();
    return s.myTeamId ? s.teams[s.myTeamId] ?? null : null;
  },

  isTeamFinished: (teamId) => {
    const s = get();
    const ev = s.event;
    const tp = s.progress[teamId];
    if (!ev || !tp) return false;
    for (let idx = 0; idx < ev.rounds.length; idx++) {
      if (!tp[idx]?.completed) return false;
    }
    return ev.rounds.length > 0;
  },

  getMyTeamProgress: () => {
    const s = get();
    return s.myTeamId ? s.progress[s.myTeamId] ?? null : null;
  },

  hydrateProgress: (rows) => {
    const state = get();
    if (rows.length === 0) return;
    const newProgress: Record<string, TeamProgress> = { ...state.progress };

    for (const row of rows) {
      const teamProg = { ...(newProgress[row.teamId] ?? emptyProgress()) };
      const cur = teamProg[row.roundIndex] ?? emptyCell();
      // Per-cell MAX-merge: don't regress live updates that arrived before
      // the persisted snapshot loaded.
      const value = Math.max(cur.value, row.value);
      const completed = cur.completed || row.completed;
      const completedAt = cur.completedAt ?? row.completedAt ?? null;
      teamProg[row.roundIndex] = {
        ...cur,
        value,
        completed,
        completedAt,
      };
      newProgress[row.teamId] = teamProg;
    }

    set({ progress: newProgress });
    // Re-evaluate completion flags for affected teams.
    const affectedTeams = new Set(rows.map((r) => r.teamId));
    for (const teamId of affectedTeams) {
      get().recomputeCompletion(teamId);
    }
  },

  clearAllProgress: () => {
    const state = get();
    const newProgress: Record<string, TeamProgress> = {};
    for (const teamId of Object.keys(state.progress)) {
      newProgress[teamId] = emptyProgress();
    }
    set({ progress: newProgress, liveLevels: {} });
  },
}));
