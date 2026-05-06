"use client";
import { useEffect, useRef, useState } from "react";
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
import type { ChallengeId, EventConfig } from "@/lib/types";
import type { UpdateEventRequest } from "@/lib/api/contract";
import { CHALLENGES, fullChallengeOrder } from "@/lib/challenges";
import { patchEvent } from "./_fetch";

interface Props {
  event: EventConfig;
  onSaved: (event: EventConfig) => void;
}

const SAVE_DEBOUNCE_MS = 500;

export default function EventConfigPanel({ event, onSaved }: Props) {
  const [title, setTitle] = useState(event.title);
  const [groomName, setGroomName] = useState(event.groomName);
  const [challenges, setChallenges] = useState(event.challenges);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lastEventId = useRef(event.id);
  useEffect(() => {
    if (event.id !== lastEventId.current) {
      lastEventId.current = event.id;
      setTitle(event.title);
      setGroomName(event.groomName);
      setChallenges(event.challenges);
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
  function updateChallenge(
    id: ChallengeId,
    patch: Partial<{ enabled: boolean; threshold: number }>,
  ) {
    const next: EventConfig["challenges"] = {
      ...challenges,
      [id]: { ...challenges[id], ...patch },
    };
    setChallenges(next);
    scheduleSave({ challenges: next });
  }

  const ordered = fullChallengeOrder(challenges);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  );

  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const oldIndex = ordered.indexOf(e.active.id as ChallengeId);
    const newIndex = ordered.indexOf(e.over.id as ChallengeId);
    if (oldIndex < 0 || newIndex < 0) return;
    const newOrder = arrayMove(ordered, oldIndex, newIndex);
    const next: EventConfig["challenges"] = { ...challenges };
    newOrder.forEach((id, idx) => {
      next[id] = { ...next[id], order: idx };
    });
    setChallenges(next);
    scheduleSave({ challenges: next });
  }

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
          <h2 className="font-display text-xl font-bold">🎯 Challenges</h2>
          <span className="text-xs opacity-50">
            Drag to reorder · toggle to disable · tune thresholds
          </span>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext items={ordered} strategy={verticalListSortingStrategy}>
            <div className="divide-y divide-white/5">
              {ordered.map((id, idx) => (
                <SortableChallengeRow
                  key={id}
                  id={id}
                  ordinal={idx + 1}
                  enabled={challenges[id]?.enabled ?? false}
                  threshold={
                    challenges[id]?.threshold ??
                    CHALLENGES[id].defaultThreshold
                  }
                  onToggle={(checked) =>
                    updateChallenge(id, { enabled: checked })
                  }
                  onThreshold={(t) => updateChallenge(id, { threshold: t })}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </section>
  );
}

function SortableChallengeRow({
  id,
  ordinal,
  enabled,
  threshold,
  onToggle,
  onThreshold,
}: {
  id: ChallengeId;
  ordinal: number;
  enabled: boolean;
  threshold: number;
  onToggle: (checked: boolean) => void;
  onThreshold: (n: number) => void;
}) {
  const def = CHALLENGES[id];
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="py-3 flex flex-wrap items-center gap-3"
    >
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
      <label className="flex items-center gap-3 flex-1 min-w-[180px] cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
          className="size-5 accent-accent-pink"
        />
        <span className="text-2xl">{def.emoji}</span>
        <div className="leading-tight">
          <div className="font-bold">{def.label}</div>
          <div className="text-xs opacity-60">{def.description}</div>
        </div>
      </label>
      <div className="flex items-center gap-2">
        {id === "time-guess" ? (
          <>
            <input
              type="number"
              min={1}
              step={1}
              value={Math.round(threshold / 1000)}
              onChange={(e) =>
                onThreshold((Number(e.target.value) || 0) * 1000)
              }
              disabled={!enabled}
              className="w-28 rounded-lg bg-bg-deep border border-white/10 px-3 py-2 text-right outline-none focus:border-accent-pink disabled:opacity-40"
            />
            <span className="text-xs opacity-60 w-20">seconds</span>
          </>
        ) : (
          <>
            <input
              type="number"
              min={1}
              value={threshold}
              onChange={(e) => onThreshold(Number(e.target.value) || 0)}
              disabled={!enabled}
              className="w-28 rounded-lg bg-bg-deep border border-white/10 px-3 py-2 text-right outline-none focus:border-accent-pink disabled:opacity-40"
            />
            <span className="text-xs opacity-60 w-20">{def.unit}</span>
          </>
        )}
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
