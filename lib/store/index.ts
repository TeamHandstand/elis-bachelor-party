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
import { CHALLENGES, CHALLENGE_ORDER } from "@/lib/challenges";

// ---------- Helpers ----------

function emptyProgress(): TeamProgress {
  const p: Partial<TeamProgress> = {};
  for (const id of CHALLENGE_ORDER) {
    p[id] = {
      value: 0,
      completed: false,
      completedAt: null,
      perPlayer: {},
      guesses: [],
    };
  }
  return p as TeamProgress;
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

  // progress, indexed by team
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
        const cur = teamProg[msg.challenge];
        const newValue = cur.value + msg.delta;
        const perPlayer = { ...(cur.perPlayer ?? {}) };
        perPlayer[msg.playerId] = (perPlayer[msg.playerId] ?? 0) + msg.delta;
        const updated = { ...teamProg, [msg.challenge]: { ...cur, value: newValue, perPlayer } };
        set({
          progress: { ...state.progress, [msg.teamId]: updated },
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
        const cur = teamProg.north;
        const guesses = [...(cur.guesses ?? [])];
        // dedupe per player — they only get one shot
        if (!guesses.some((g) => g.playerId === msg.playerId)) {
          guesses.push({ playerId: msg.playerId, errorDeg: msg.errorDeg });
        }
        const updated = {
          ...teamProg,
          north: {
            ...cur,
            value: guesses.length,
            guesses,
          },
        };
        set({
          progress: { ...state.progress, [msg.teamId]: updated },
        });
        get().recomputeCompletion(msg.teamId);
        break;
      }

      case "complete": {
        const teamProg = state.progress[msg.teamId];
        if (!teamProg) return;
        const cur = teamProg[msg.challenge];
        if (cur.completed) break;
        const updated = {
          ...teamProg,
          [msg.challenge]: { ...cur, completed: true, completedAt: msg.ts },
        };
        set({
          progress: { ...state.progress, [msg.teamId]: updated },
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
    }
  },

  recomputeCompletion: (teamId) => {
    const state = get();
    const ev = state.event;
    const teamProg = state.progress[teamId];
    if (!ev || !teamProg) return;

    const newProg: TeamProgress = { ...teamProg };
    const enabledIds = CHALLENGE_ORDER.filter((id) => ev.challenges[id]?.enabled);
    for (const id of enabledIds) {
      const def = CHALLENGES[id];
      const cur = newProg[id];
      if (cur.completed) continue;
      const threshold = ev.challenges[id]?.threshold ?? def.defaultThreshold;
      let isDone = false;

      switch (def.aggregation) {
        case "team-total":
          isDone = cur.value >= threshold;
          break;
        case "per-player": {
          // Each teammate must hit threshold/3 (or threshold/playerCount). Sum still represented.
          const teammates = Object.values(state.players).filter((p) => p.teamId === teamId);
          const perPlayerThreshold = threshold / Math.max(1, teammates.length);
          isDone =
            teammates.length > 0 &&
            teammates.every((p) => (cur.perPlayer?.[p.id] ?? 0) >= perPlayerThreshold);
          break;
        }
        case "per-player-once": {
          const teammates = Object.values(state.players).filter((p) => p.teamId === teamId);
          isDone =
            teammates.length > 0 &&
            teammates.every((p) => (cur.guesses ?? []).some((g) => g.playerId === p.id));
          break;
        }
        case "all-simultaneous":
          // 'complete' message-driven; never auto-completed via threshold here.
          break;
      }

      if (isDone) {
        newProg[id] = { ...cur, completed: true, completedAt: cur.completedAt ?? Date.now() };
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
    const enabled = CHALLENGE_ORDER.filter((id) => ev.challenges[id]?.enabled);
    return enabled.every((id) => tp[id]?.completed);
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
      const teamProg = newProgress[row.teamId] ?? emptyProgress();
      const cur = teamProg[row.challenge];
      if (!cur) continue;
      // Per-cell MAX-merge: don't regress live updates that arrived before
      // the persisted snapshot loaded.
      const value = Math.max(cur.value, row.value);
      const completed = cur.completed || row.completed;
      const completedAt =
        cur.completedAt ?? row.completedAt ?? null;
      newProgress[row.teamId] = {
        ...teamProg,
        [row.challenge]: {
          ...cur,
          value,
          completed,
          completedAt,
        },
      };
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
