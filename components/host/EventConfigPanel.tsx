"use client";
import { useEffect, useId, useRef, useState } from "react";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type {
  ChallengeId,
  EventConfig,
  InterleaveSegment,
  RoundConfig,
  TriviaQuestion,
} from "@/lib/types";
import type { UpdateEventRequest } from "@/lib/api/contract";
import {
  CHALLENGE_ORDER,
  CHALLENGES,
  DEFAULT_INTERLEAVE_SEGMENTS,
  DEFAULT_PUNISHMENT_MESSAGE,
  challengeHasThreshold,
  interleaveTotal,
} from "@/lib/challenges";
import { patchEvent } from "./_fetch";
import { TriviaRoundModal } from "./TriviaRoundModal";

interface Props {
  event: EventConfig;
  onSaved: (event: EventConfig) => void;
}

const SAVE_DEBOUNCE_MS = 500;

// Stable per-row keys so dnd-kit can track items even though challenge ids
// repeat. We assign one fresh id per round on mount and keep it across edits.
type RowId = string;
type Row = { id: RowId; round: RoundConfig };

function newRowId(): RowId {
  return `r_${Math.random().toString(36).slice(2, 10)}`;
}

function roundsToRows(rounds: RoundConfig[]): Row[] {
  return rounds.map((r) => ({ id: newRowId(), round: { ...r } }));
}

function rowsToRounds(rows: Row[]): RoundConfig[] {
  return rows.map((r) => ({ ...r.round }));
}

export default function EventConfigPanel({ event, onSaved }: Props) {
  const [title, setTitle] = useState(event.title);
  const [groomName, setGroomName] = useState(event.groomName);
  const [rows, setRows] = useState<Row[]>(() => roundsToRows(event.rounds));
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingTrivia, setEditingTrivia] = useState<RowId | null>(null);

  const lastEventId = useRef(event.id);
  useEffect(() => {
    if (event.id !== lastEventId.current) {
      lastEventId.current = event.id;
      setTitle(event.title);
      setGroomName(event.groomName);
      setRows(roundsToRows(event.rounds));
    }
  }, [event]);

  const dirtyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function scheduleSave(patch: UpdateEventRequest) {
    dirtyRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      if (!dirtyRef.current) return;
      dirtyRef.current = false;
      setSaving(true);
      setError(null);
      try {
        const res = await patchEvent(event.code, patch);
        onSaved(res.event);
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 1200);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Save failed.");
      } finally {
        setSaving(false);
      }
    }, SAVE_DEBOUNCE_MS);
  }

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  function updateTitle(v: string) {
    setTitle(v);
    scheduleSave({ title: v });
  }
  function updateGroom(v: string) {
    setGroomName(v);
    scheduleSave({ groomName: v });
  }

  function applyRows(next: Row[]) {
    setRows(next);
    scheduleSave({ rounds: rowsToRounds(next) });
  }

  function updateRow(id: RowId, patch: Partial<RoundConfig>) {
    const next = rows.map((r) =>
      r.id === id ? { ...r, round: { ...r.round, ...patch } } : r,
    );
    applyRows(next);
  }

  function removeRow(id: RowId) {
    applyRows(rows.filter((r) => r.id !== id));
  }

  function addRound(challenge: ChallengeId) {
    const def = CHALLENGES[challenge];
    let round: RoundConfig;
    if (challenge === "trivia") {
      round = { challenge, threshold: def.defaultThreshold, questions: [] };
    } else if (challenge === "punishment") {
      round = {
        challenge,
        threshold: 0,
        message: DEFAULT_PUNISHMENT_MESSAGE,
      };
    } else if (challenge === "interleave") {
      const segs = [...DEFAULT_INTERLEAVE_SEGMENTS];
      round = {
        challenge,
        threshold: interleaveTotal(segs),
        segments: segs,
      };
    } else {
      round = { challenge, threshold: def.defaultThreshold };
    }
    applyRows([...rows, { id: newRowId(), round }]);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  );

  function onDragEnd(e: DragEndEvent) {
    const overId = e.over?.id;
    if (overId === undefined || e.active.id === overId) return;
    const oldIndex = rows.findIndex((r) => r.id === e.active.id);
    const newIndex = rows.findIndex((r) => r.id === overId);
    if (oldIndex < 0 || newIndex < 0) return;
    applyRows(arrayMove(rows, oldIndex, newIndex));
  }

  const items = rows.map((r) => r.id);

  return (
    <section className="space-y-6">
      <div className="bg-bg-card rounded-xl2 p-5 space-y-4">
        <h2 className="font-display text-xl font-bold">⚙️ Event details</h2>

        <label className="block">
          <span className="text-xs uppercase tracking-wider opacity-60">
            Title
          </span>
          <input
            type="text"
            value={title}
            onChange={(e) => updateTitle(e.target.value)}
            placeholder="Eli's Bachelor Party"
            className="mt-1 w-full rounded-xl bg-bg-deep border border-white/10 px-4 py-3 outline-none focus:border-accent-pink"
          />
        </label>

        <label className="block">
          <span className="text-xs uppercase tracking-wider opacity-60">
            Groom
          </span>
          <input
            type="text"
            value={groomName}
            onChange={(e) => updateGroom(e.target.value)}
            placeholder="Eli"
            className="mt-1 w-full rounded-xl bg-bg-deep border border-white/10 px-4 py-3 outline-none focus:border-accent-pink"
          />
        </label>

        <SaveStatus saving={saving} flash={savedFlash} error={error} />
      </div>

      <div className="bg-bg-card rounded-xl2 p-5 space-y-3">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <h2 className="font-display text-xl font-bold">🎯 Rounds</h2>
          <span className="text-xs opacity-50">
            Drag to reorder · add multiple of the same challenge with different thresholds
          </span>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext items={items} strategy={verticalListSortingStrategy}>
            <div className="divide-y divide-white/5">
              {rows.length === 0 ? (
                <div className="py-6 text-center text-sm opacity-60">
                  No rounds yet. Add one below ↓
                </div>
              ) : null}
              {rows.map((row, idx) => (
                <SortableRoundRow
                  key={row.id}
                  rowId={row.id}
                  ordinal={idx + 1}
                  round={row.round}
                  onChange={(patch) => updateRow(row.id, patch)}
                  onRemove={() => removeRow(row.id)}
                  onEditTrivia={() => setEditingTrivia(row.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        <AddRoundBar onAdd={addRound} />
      </div>

      {editingTrivia &&
        (() => {
          const row = rows.find((r) => r.id === editingTrivia);
          if (!row) return null;
          const ordinal = rows.findIndex((r) => r.id === editingTrivia) + 1;
          return (
            <TriviaRoundModal
              ordinal={ordinal}
              initialQuestions={row.round.questions ?? []}
              onClose={() => setEditingTrivia(null)}
              onSave={(qs: TriviaQuestion[]) =>
                updateRow(row.id, { questions: qs })
              }
            />
          );
        })()}
    </section>
  );
}

function SortableRoundRow({
  rowId,
  ordinal,
  round,
  onChange,
  onRemove,
  onEditTrivia,
}: {
  rowId: string;
  ordinal: number;
  round: RoundConfig;
  onChange: (patch: Partial<RoundConfig>) => void;
  onRemove: () => void;
  onEditTrivia: () => void;
}) {
  const def = CHALLENGES[round.challenge];
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: rowId });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  const showThreshold = challengeHasThreshold(round.challenge);
  const isTrivia = round.challenge === "trivia";
  const isPunishment = round.challenge === "punishment";
  const isInterleave = round.challenge === "interleave";
  const triviaCount = round.questions?.length ?? 0;
  const selectId = useId();

  function changeChallenge(next: ChallengeId) {
    if (next === round.challenge) return;
    const def = CHALLENGES[next];
    const patch: Partial<RoundConfig> = {
      challenge: next,
      threshold: def.defaultThreshold,
      // Strip type-specific fields the new challenge doesn't use.
      questions: undefined,
      message: undefined,
      segments: undefined,
    };
    if (next === "trivia") patch.questions = [];
    if (next === "punishment") patch.message = DEFAULT_PUNISHMENT_MESSAGE;
    if (next === "interleave") {
      patch.segments = [...DEFAULT_INTERLEAVE_SEGMENTS];
      patch.threshold = interleaveTotal(patch.segments);
    }
    onChange(patch);
  }

  if (isPunishment) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="py-3 flex flex-wrap items-stretch gap-3 bg-accent-pink/10 -mx-2 px-2 rounded-xl border border-accent-pink/40"
      >
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
          className="cursor-grab touch-none px-2 py-1 rounded-lg bg-bg-deep border border-accent-pink/40 text-sm font-bold opacity-80 hover:opacity-100 self-start"
        >
          ⋮⋮
        </button>
        <div className="font-display font-extrabold text-lg text-accent-pink w-6 text-center tabular-nums self-start mt-1">
          {ordinal}
        </div>
        <div className="flex flex-col gap-1.5 flex-1 min-w-[200px]">
          <div className="flex items-center gap-2">
            <span className="text-2xl">💀</span>
            <span className="font-display font-extrabold tracking-widest text-accent-pink text-xs uppercase">
              Punishment Line
            </span>
          </div>
          <textarea
            value={round.message ?? ""}
            onChange={(e) => onChange({ message: e.target.value })}
            rows={2}
            placeholder="Punishment message…"
            className="w-full rounded-lg bg-bg-deep border border-accent-pink/40 px-3 py-2 outline-none focus:border-accent-pink text-sm font-bold resize-none"
          />
          <div className="text-[11px] opacity-60">
            When live: losing team gets called out fullscreen — host marks
            complete to advance. Doesn&rsquo;t affect scoring.
          </div>
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove punishment"
          className="px-3 py-2 rounded-lg bg-bg-deep border border-accent-pink/40 text-sm font-bold opacity-80 hover:opacity-100 hover:text-accent-pink self-start"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="py-3 flex flex-wrap items-center gap-3"
    >
      {isInterleave ? (
        <div className="w-full flex flex-col gap-3">
          <InterleaveRowHead
            ordinal={ordinal}
            attributes={attributes}
            listeners={listeners}
            selectId={selectId}
            challenge={round.challenge}
            description={def.description}
            onChangeChallenge={changeChallenge}
            onRemove={onRemove}
          />
          <InterleaveSegmentEditor
            segments={round.segments ?? DEFAULT_INTERLEAVE_SEGMENTS}
            onChange={(segs) =>
              onChange({
                segments: segs,
                threshold: interleaveTotal(segs),
              })
            }
          />
        </div>
      ) : (
        <>
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
        className="cursor-grab touch-none px-2 py-1 rounded-lg bg-bg-deep border border-white/10 text-sm font-bold opacity-70 hover:opacity-100"
      >
        ⋮⋮
      </button>
      <div className="font-display font-extrabold text-lg opacity-60 w-6 text-center tabular-nums">
        {ordinal}
      </div>
      <span className="text-2xl">{def.emoji}</span>
      <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
        <label htmlFor={selectId} className="sr-only">
          Challenge type
        </label>
        <select
          id={selectId}
          value={round.challenge}
          onChange={(e) => changeChallenge(e.target.value as ChallengeId)}
          className="rounded-lg bg-bg-deep border border-white/10 px-3 py-2 outline-none focus:border-accent-pink font-bold"
        >
          {CHALLENGE_ORDER.map((id) => (
            <option key={id} value={id}>
              {CHALLENGES[id].emoji} {CHALLENGES[id].label}
            </option>
          ))}
        </select>
        <div className="text-xs opacity-60">{def.description}</div>
      </div>
      <div className="flex items-center gap-2">
        {isInterleave ? (
          <div className="text-xs opacity-60 w-48 text-right">
            edit segments below ↓
          </div>
        ) : isTrivia ? (
          <button
            type="button"
            onClick={onEditTrivia}
            className={`px-3 py-2 rounded-lg border text-xs font-bold ${
              triviaCount === 0
                ? "bg-bg-deep border-accent-pink/50 text-accent-pink"
                : "bg-bg-deep border-white/10 hover:border-accent-orange"
            }`}
          >
            {triviaCount === 0
              ? "✏️ add questions"
              : `❓ ${triviaCount} question${triviaCount === 1 ? "" : "s"} · edit`}
          </button>
        ) : showThreshold ? (
          round.challenge === "time-guess" ? (
            <>
              <input
                type="number"
                min={1}
                step={1}
                value={Math.round(round.threshold / 1000)}
                onChange={(e) =>
                  onChange({ threshold: (Number(e.target.value) || 0) * 1000 })
                }
                className="w-28 rounded-lg bg-bg-deep border border-white/10 px-3 py-2 text-right outline-none focus:border-accent-pink"
              />
              <span className="text-xs opacity-60 w-20">seconds</span>
            </>
          ) : (
            <>
              <input
                type="number"
                min={1}
                value={round.threshold}
                onChange={(e) =>
                  onChange({ threshold: Number(e.target.value) || 0 })
                }
                className="w-28 rounded-lg bg-bg-deep border border-white/10 px-3 py-2 text-right outline-none focus:border-accent-pink"
              />
              <span className="text-xs opacity-60 w-20">{def.unit}</span>
            </>
          )
        ) : (
          <div className="text-xs opacity-60 w-48 text-right">
            one guess per teammate · smallest avg wins
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove round"
        className="px-3 py-2 rounded-lg bg-bg-deep border border-white/10 text-sm font-bold opacity-70 hover:opacity-100 hover:text-accent-pink"
      >
        ✕
      </button>
        </>
      )}
    </div>
  );
}

function InterleaveRowHead({
  ordinal,
  attributes,
  listeners,
  selectId,
  challenge,
  description,
  onChangeChallenge,
  onRemove,
}: {
  ordinal: number;
  attributes: ReturnType<typeof useSortable>["attributes"];
  listeners: ReturnType<typeof useSortable>["listeners"];
  selectId: string;
  challenge: ChallengeId;
  description: string;
  onChangeChallenge: (id: ChallengeId) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
        className="cursor-grab touch-none px-2 py-1 rounded-lg bg-bg-deep border border-white/10 text-sm font-bold opacity-70 hover:opacity-100"
      >
        ⋮⋮
      </button>
      <div className="font-display font-extrabold text-lg opacity-60 w-6 text-center tabular-nums">
        {ordinal}
      </div>
      <span className="text-2xl">{CHALLENGES[challenge].emoji}</span>
      <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
        <label htmlFor={selectId} className="sr-only">
          Challenge type
        </label>
        <select
          id={selectId}
          value={challenge}
          onChange={(e) => onChangeChallenge(e.target.value as ChallengeId)}
          className="rounded-lg bg-bg-deep border border-white/10 px-3 py-2 outline-none focus:border-accent-pink font-bold"
        >
          {CHALLENGE_ORDER.map((id) => (
            <option key={id} value={id}>
              {CHALLENGES[id].emoji} {CHALLENGES[id].label}
            </option>
          ))}
        </select>
        <div className="text-xs opacity-60">{description}</div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove round"
        className="px-3 py-2 rounded-lg bg-bg-deep border border-white/10 text-sm font-bold opacity-70 hover:opacity-100 hover:text-accent-pink"
      >
        ✕
      </button>
    </div>
  );
}

function InterleaveSegmentEditor({
  segments,
  onChange,
}: {
  segments: InterleaveSegment[];
  onChange: (segs: InterleaveSegment[]) => void;
}) {
  function update(idx: number, patch: Partial<InterleaveSegment>) {
    const next = segments.map((s, i) => (i === idx ? { ...s, ...patch } : s));
    onChange(next);
  }
  function remove(idx: number) {
    onChange(segments.filter((_, i) => i !== idx));
  }
  function add(kind: InterleaveSegment["kind"]) {
    const last = segments[segments.length - 1];
    const fallback = kind === "spin" ? 30 : 200;
    const count = last && last.kind === kind ? last.count : fallback;
    onChange([...segments, { kind, count }]);
  }
  function move(idx: number, dir: -1 | 1) {
    const j = idx + dir;
    if (j < 0 || j >= segments.length) return;
    const next = [...segments];
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange(next);
  }
  const total = interleaveTotal(segments);

  return (
    <div className="rounded-xl bg-bg-deep border border-white/10 p-3 space-y-2">
      <div className="flex items-center justify-between text-[11px] uppercase tracking-widest font-bold">
        <span className="opacity-60">segments</span>
        <span className="opacity-80">
          total: {total.toLocaleString()} reps
        </span>
      </div>
      {segments.length === 0 ? (
        <div className="text-xs opacity-60 py-2">
          No segments yet. Add at least one ↓
        </div>
      ) : (
        <ol className="space-y-2">
          {segments.map((seg, idx) => (
            <li
              key={idx}
              className="flex items-center gap-2 bg-bg-card rounded-lg px-2 py-1.5"
            >
              <span className="font-display font-extrabold tabular-nums opacity-60 w-5 text-center">
                {idx + 1}
              </span>
              <select
                value={seg.kind}
                onChange={(e) =>
                  update(idx, {
                    kind: e.target.value as InterleaveSegment["kind"],
                  })
                }
                className="rounded-lg bg-bg-deep border border-white/10 px-2 py-1.5 text-sm font-bold"
              >
                <option value="spin">🌀 Spin</option>
                <option value="steps">👟 Steps</option>
              </select>
              <input
                type="number"
                min={1}
                value={seg.count}
                onChange={(e) =>
                  update(idx, { count: Math.max(0, Number(e.target.value) || 0) })
                }
                className="w-24 rounded-lg bg-bg-deep border border-white/10 px-2 py-1.5 text-right text-sm tabular-nums"
              />
              <span className="text-[11px] opacity-60 w-12">
                {seg.kind === "spin" ? "spins" : "steps"}
              </span>
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => move(idx, -1)}
                disabled={idx === 0}
                aria-label="Move up"
                className="px-2 py-1 rounded-md bg-bg-deep border border-white/10 text-xs font-bold opacity-70 disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => move(idx, 1)}
                disabled={idx === segments.length - 1}
                aria-label="Move down"
                className="px-2 py-1 rounded-md bg-bg-deep border border-white/10 text-xs font-bold opacity-70 disabled:opacity-30"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => remove(idx)}
                aria-label="Remove segment"
                className="px-2 py-1 rounded-md bg-bg-deep border border-white/10 text-xs font-bold opacity-70 hover:text-accent-pink"
              >
                ✕
              </button>
            </li>
          ))}
        </ol>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => add("spin")}
          className="flex-1 px-3 py-2 rounded-lg bg-bg-deep border border-white/10 hover:border-accent-pink text-xs font-extrabold tracking-wider"
        >
          ➕ 🌀 Spin segment
        </button>
        <button
          type="button"
          onClick={() => add("steps")}
          className="flex-1 px-3 py-2 rounded-lg bg-bg-deep border border-white/10 hover:border-accent-pink text-xs font-extrabold tracking-wider"
        >
          ➕ 👟 Step segment
        </button>
      </div>
    </div>
  );
}

function AddRoundBar({ onAdd }: { onAdd: (id: ChallengeId) => void }) {
  return (
    <div className="pt-3 border-t border-white/5 space-y-3">
      <div>
        <div className="text-[11px] uppercase tracking-widest opacity-60 mb-2 font-bold">
          ➕ add a round
        </div>
        <div className="flex flex-wrap gap-2">
          {CHALLENGE_ORDER.map((id) => {
            const def = CHALLENGES[id];
            return (
              <button
                key={id}
                type="button"
                onClick={() => onAdd(id)}
                className="px-3 py-2 rounded-xl bg-bg-deep border border-white/10 hover:border-accent-pink text-sm font-bold flex items-center gap-2"
              >
                <span className="text-base">{def.emoji}</span>
                <span>{def.label}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <div className="text-[11px] uppercase tracking-widest text-accent-pink/80 mb-2 font-bold">
          💀 drop in a punishment
        </div>
        <button
          type="button"
          onClick={() => onAdd("punishment")}
          className="px-3 py-2 rounded-xl bg-accent-pink/15 border border-accent-pink/50 hover:bg-accent-pink/25 text-sm font-extrabold tracking-wide flex items-center gap-2 text-accent-pink"
        >
          <span className="text-base">💀</span>
          <span>Add Punishment Line</span>
        </button>
      </div>
    </div>
  );
}

function SaveStatus({
  saving,
  flash,
  error,
}: {
  saving: boolean;
  flash: boolean;
  error: string | null;
}) {
  let label: string;
  let cls: string;
  if (error) {
    label = `⚠️ ${error}`;
    cls = "text-accent-pink";
  } else if (saving) {
    label = "Saving…";
    cls = "opacity-60";
  } else if (flash) {
    label = "✅ Saved";
    cls = "text-accent-green";
  } else {
    label = "Auto-saves as you type";
    cls = "opacity-40";
  }
  return <div className={`text-xs ${cls}`}>{label}</div>;
}
