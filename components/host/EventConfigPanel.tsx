"use client";
import { useEffect, useRef, useState } from "react";
import type { EventConfig } from "@/lib/types";
import type { UpdateEventRequest } from "@/lib/api/contract";
import { CHALLENGES, CHALLENGE_ORDER } from "@/lib/challenges";
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

  // Refresh local state if a fresh event prop arrives (e.g., after reset).
  const lastEventId = useRef(event.id);
  useEffect(() => {
    if (event.id !== lastEventId.current) {
      lastEventId.current = event.id;
      setTitle(event.title);
      setGroomName(event.groomName);
      setChallenges(event.challenges);
    }
  }, [event]);

  // Debounced auto-save whenever inputs change.
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

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  function updateTitle(v: string) {
    setTitle(v);
    scheduleSave({ title: v });
  }
  function updateGroom(v: string) {
    setGroomName(v);
    scheduleSave({ groomName: v });
  }
  function updateChallenge(
    id: keyof EventConfig["challenges"],
    patch: Partial<{ enabled: boolean; threshold: number }>
  ) {
    const next = {
      ...challenges,
      [id]: { ...challenges[id], ...patch },
    };
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
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-xl font-bold">🎯 Challenges</h2>
          <span className="text-xs opacity-50">
            Toggle and tune thresholds
          </span>
        </div>

        <div className="divide-y divide-white/5">
          {CHALLENGE_ORDER.map((id) => {
            const def = CHALLENGES[id];
            const cur = challenges[id];
            return (
              <div
                key={id}
                className="py-3 flex flex-wrap items-center gap-3"
              >
                <label className="flex items-center gap-3 flex-1 min-w-[180px] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cur.enabled}
                    onChange={(e) =>
                      updateChallenge(id, { enabled: e.target.checked })
                    }
                    className="size-5 accent-accent-pink"
                  />
                  <span className="text-2xl">{def.emoji}</span>
                  <div className="leading-tight">
                    <div className="font-bold">{def.label}</div>
                    <div className="text-xs opacity-60">{def.description}</div>
                  </div>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    value={cur.threshold}
                    onChange={(e) =>
                      updateChallenge(id, {
                        threshold: Number(e.target.value) || 0,
                      })
                    }
                    disabled={!cur.enabled}
                    className="w-28 rounded-lg bg-bg-deep border border-white/10 px-3 py-2 text-right outline-none focus:border-accent-pink disabled:opacity-40"
                  />
                  <span className="text-xs opacity-60 w-20">{def.unit}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
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
