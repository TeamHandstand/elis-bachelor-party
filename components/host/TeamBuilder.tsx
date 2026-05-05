"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type { EventConfig, Player, Team } from "@/lib/types";
import {
  addPlayer,
  assignPlayer,
  createTeam as createTeamFetch,
  deleteTeam as deleteTeamFetch,
  patchEvent,
} from "./_fetch";

interface Props {
  event: EventConfig;
  teams: Team[];
  players: Player[];
  onChange: (next: { event?: EventConfig; teams?: Team[]; players?: Player[] }) => void;
}

const POOL_ID = "__pool__";
const NEW_TEAM_ID = "__new_team__";
const EMOJI_OPTIONS = ["🍕", "🍝", "🍍", "🌭", "🍔", "🌮", "🍣", "🥨", "🍩", "🍦", "🥑", "🥩", "🥟", "🍤", "🍪"];

export default function TeamBuilder({ event, teams, players, onChange }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } })
  );

  const playersById = useMemo(() => {
    const m: Record<string, Player> = {};
    for (const p of players) m[p.id] = p;
    return m;
  }, [players]);

  const grouped = useMemo(() => {
    const pool: Player[] = [];
    const byTeam: Record<string, Player[]> = {};
    for (const t of teams) byTeam[t.id] = [];
    for (const p of players) {
      if (p.teamId && byTeam[p.teamId]) byTeam[p.teamId].push(p);
      else pool.push(p);
    }
    return { pool, byTeam };
  }, [players, teams]);

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  async function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const playerId = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    if (!overId) return;
    const player = playersById[playerId];
    if (!player) return;

    // Drop on the "+ new team" slot → create a team server-side, then move
    // the player onto it.
    if (overId === NEW_TEAM_ID) {
      try {
        const created = await createTeamFetch(event.code);
        const optimistic = players.map((p) =>
          p.id === playerId ? { ...p, teamId: created.team.id } : p,
        );
        onChange({ teams: [...teams, created.team], players: optimistic });
        const res = await assignPlayer(event.code, playerId, {
          teamId: created.team.id,
        });
        const final = optimistic.map((p) => (p.id === playerId ? res.player : p));
        onChange({ players: final });
      } catch {
        // Rollback team list + players if the chain failed.
        onChange({ teams, players });
      }
      return;
    }

    const targetTeamId = overId === POOL_ID ? null : overId;
    if (player.teamId === targetTeamId) return;

    // Optimistic update
    const optimistic = players.map((p) =>
      p.id === playerId ? { ...p, teamId: targetTeamId } : p
    );
    onChange({ players: optimistic });

    try {
      const res = await assignPlayer(event.code, playerId, { teamId: targetTeamId });
      const final = optimistic.map((p) => (p.id === playerId ? res.player : p));
      onChange({ players: final });
    } catch {
      // Rollback
      onChange({ players });
    }
  }

  async function updateTeam(teamId: string, patch: Partial<Pick<Team, "name" | "emoji">>) {
    const optimistic = teams.map((t) => (t.id === teamId ? { ...t, ...patch } : t));
    onChange({ teams: optimistic });
    try {
      const res = await patchEvent(event.code, {
        teams: [{ id: teamId, ...patch }],
      });
      onChange({ event: res.event, teams: res.teams });
    } catch {
      onChange({ teams });
    }
  }

  const [adding, setAdding] = useState(false);
  async function addTeam() {
    if (adding) return;
    setAdding(true);
    try {
      const res = await createTeamFetch(event.code);
      onChange({ teams: [...teams, res.team] });
    } catch {
      // Surface failures via the existing toast-less convention — no-op for now.
    } finally {
      setAdding(false);
    }
  }

  async function removeTeam(teamId: string) {
    const team = teams.find((t) => t.id === teamId);
    if (!team) return;
    const memberCount = players.filter((p) => p.teamId === teamId).length;
    const msg =
      memberCount > 0
        ? `Delete ${team.emoji} ${team.name}? ${memberCount} player(s) on this team will be moved back to the pool.`
        : `Delete ${team.emoji} ${team.name}?`;
    if (typeof window !== "undefined" && !window.confirm(msg)) return;

    const optimisticTeams = teams.filter((t) => t.id !== teamId);
    const optimisticPlayers = players.map((p) =>
      p.teamId === teamId ? { ...p, teamId: null } : p,
    );
    onChange({ teams: optimisticTeams, players: optimisticPlayers });
    try {
      await deleteTeamFetch(event.code, teamId);
    } catch {
      // Roll back on failure.
      onChange({ teams, players });
    }
  }

  const activePlayer = activeId ? playersById[activeId] : null;

  const [newName, setNewName] = useState("");
  const [addingPlayer, setAddingPlayer] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  async function handleAddPlayer(e?: React.FormEvent) {
    e?.preventDefault();
    const name = newName.trim();
    if (!name || addingPlayer) return;
    setAddingPlayer(true);
    setAddError(null);
    try {
      // Synthesize a unique deviceId so the server treats this as a brand-new
      // player and doesn't merge with any existing host device.
      const deviceId = `host-added-${
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`
      }`;
      const res = await addPlayer(event.code, { name, deviceId });
      onChange({ players: [...players, res.player] });
      setNewName("");
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Couldn't add player");
    } finally {
      setAddingPlayer(false);
    }
  }

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <section className="space-y-4">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <h2 className="font-display text-xl font-bold">👥 Team builder</h2>
          <div className="flex items-center gap-3">
            <p className="text-xs opacity-60 hidden sm:block">
              Drag names from the pool into a team. Long-press on touch.
            </p>
            <button
              type="button"
              onClick={addTeam}
              disabled={adding}
              className="rounded-xl px-3 py-2 bg-gradient-party text-sm font-bold disabled:opacity-50"
            >
              {adding ? "…" : "+ Add team"}
            </button>
          </div>
        </div>

        <form
          onSubmit={handleAddPlayer}
          className="bg-bg-card rounded-xl2 p-4 flex items-center gap-2 flex-wrap"
        >
          <div className="flex-1 min-w-[180px]">
            <label className="block text-[11px] uppercase tracking-widest opacity-60 mb-1 font-bold">
              ➕ Add player manually
            </label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Player name"
              maxLength={40}
              className="w-full rounded-xl bg-bg-deep border border-white/10 px-4 py-3 outline-none focus:border-accent-pink"
            />
          </div>
          <button
            type="submit"
            disabled={addingPlayer || !newName.trim()}
            className="rounded-xl px-4 py-3 bg-gradient-party text-sm font-bold disabled:opacity-50 self-end"
          >
            {addingPlayer ? "…" : "Add"}
          </button>
          {addError ? (
            <div className="basis-full text-xs text-accent-pink">{addError}</div>
          ) : null}
        </form>

        <NamePool players={grouped.pool} />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {teams.map((team, idx) => (
            <TeamBox
              key={team.id}
              team={team}
              players={grouped.byTeam[team.id] ?? []}
              gradient={teamGradient(idx)}
              onRename={(name) => updateTeam(team.id, { name })}
              onEmoji={(emoji) => updateTeam(team.id, { emoji })}
              onDelete={() => removeTeam(team.id)}
            />
          ))}
          <NewTeamSlot
            onClickCreate={addTeam}
            busy={adding}
            empty={teams.length === 0}
          />
        </div>
      </section>

      <DragOverlay>
        {activePlayer ? (
          <PlayerChipVisual player={activePlayer} dragging />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function teamGradient(idx: number): string {
  switch (idx) {
    case 0:
      return "bg-gradient-party";
    case 1:
      return "bg-gradient-cool";
    default:
      return "bg-gradient-done";
  }
}

function NewTeamSlot({
  onClickCreate,
  busy,
  empty,
}: {
  onClickCreate: () => void;
  busy: boolean;
  empty: boolean;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: NEW_TEAM_ID });
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onClickCreate}
      disabled={busy}
      className={`rounded-xl2 min-h-[180px] flex flex-col items-center justify-center text-center p-4 border-2 border-dashed transition-all ${
        isOver
          ? "border-accent-pink bg-accent-pink/10 scale-[1.01]"
          : "border-white/20 hover:border-accent-orange/60 hover:bg-white/5"
      } disabled:opacity-50`}
    >
      <div className="text-4xl mb-2 opacity-80">➕</div>
      <div className="font-display text-base font-extrabold tracking-wider">
        {busy ? "creating…" : "NEW TEAM"}
      </div>
      <div className="text-[11px] opacity-70 mt-1 max-w-[200px]">
        {empty
          ? "Drop a name here or tap to create your first team."
          : "Drop a player here to spawn a new team."}
      </div>
    </button>
  );
}

function NamePool({ players }: { players: Player[] }) {
  const { isOver, setNodeRef } = useDroppable({ id: POOL_ID });
  return (
    <div
      ref={setNodeRef}
      className={`bg-bg-card rounded-xl2 p-4 min-h-[100px] transition-colors ${
        isOver ? "ring-2 ring-accent-pink bg-bg-deep" : ""
      }`}
    >
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="font-bold">🎲 Name pool</h3>
        <span className="text-xs opacity-60">
          {players.length} unassigned
        </span>
      </div>
      {players.length === 0 ? (
        <div className="text-sm opacity-40 italic py-3">
          Players will show up here when they join.
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {players.map((p) => (
            <DraggablePlayer key={p.id} player={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function TeamBox({
  team,
  players,
  gradient,
  onRename,
  onEmoji,
  onDelete,
}: {
  team: Team;
  players: Player[];
  gradient: string;
  onRename: (name: string) => void;
  onEmoji: (emoji: string) => void;
  onDelete: () => void;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: team.id });
  const [picking, setPicking] = useState(false);
  const [name, setName] = useState(team.name);

  // Sync if external rename occurs (e.g., from server confirmation).
  useEffect(() => setName(team.name), [team.name]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function commitName(v: string) {
    setName(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (v.trim() && v !== team.name) onRename(v.trim());
    }, 500);
  }
  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    []
  );

  return (
    <div
      ref={setNodeRef}
      className={`relative rounded-xl2 p-4 min-h-[180px] transition-all ${
        isOver
          ? "ring-2 ring-white scale-[1.01]"
          : "ring-1 ring-white/10"
      } ${gradient}`}
    >
      <button
        type="button"
        onClick={onDelete}
        aria-label={`Delete team ${team.name}`}
        className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/30 hover:bg-accent-pink/80 text-xs font-bold leading-none flex items-center justify-center"
      >
        ✕
      </button>
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={() => setPicking((p) => !p)}
          className="text-3xl leading-none"
          aria-label="Change team emoji"
          type="button"
        >
          {team.emoji}
        </button>
        <input
          value={name}
          onChange={(e) => commitName(e.target.value)}
          className="flex-1 bg-transparent border-b border-white/30 px-1 py-1 font-display font-bold text-lg outline-none focus:border-white"
        />
      </div>

      {picking ? (
        <div className="mb-3 p-2 bg-black/30 rounded-lg flex flex-wrap gap-1">
          {EMOJI_OPTIONS.map((e) => (
            <button
              key={e}
              type="button"
              className="text-2xl p-1 hover:scale-125 transition-transform"
              onClick={() => {
                onEmoji(e);
                setPicking(false);
              }}
            >
              {e}
            </button>
          ))}
        </div>
      ) : null}

      <div className="text-xs opacity-80 mb-2">
        {players.length} player{players.length === 1 ? "" : "s"}
      </div>
      <div className="flex flex-wrap gap-2 min-h-[40px]">
        {players.map((p) => (
          <DraggablePlayer key={p.id} player={p} onTeam />
        ))}
        {players.length === 0 ? (
          <div className="text-xs opacity-70 italic py-2">Drop a name here</div>
        ) : null}
      </div>
    </div>
  );
}

function DraggablePlayer({ player, onTeam }: { player: Player; onTeam?: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: player.id,
  });
  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      type="button"
      className={`no-select touch-none px-3 py-2 rounded-xl text-sm font-bold border transition-opacity ${
        onTeam
          ? "bg-black/30 border-white/30 text-white"
          : "bg-bg-deep border-white/10 text-white"
      } ${isDragging ? "opacity-30" : "opacity-100"}`}
    >
      {player.name}
    </button>
  );
}

function PlayerChipVisual({ player, dragging }: { player: Player; dragging?: boolean }) {
  return (
    <div
      className={`px-3 py-2 rounded-xl text-sm font-bold border bg-bg-card border-accent-pink shadow-2xl ${
        dragging ? "scale-110" : ""
      }`}
    >
      {player.name}
    </div>
  );
}
