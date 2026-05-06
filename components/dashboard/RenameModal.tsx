"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  title: string;
  initial: string;
  emojiInitial?: string; // when present, show an emoji input row too
  busyLabel?: string;
  onClose(): void;
  onSubmit(value: { name: string; emoji?: string }): Promise<void>;
}

/**
 * Lightweight bottom-sheet style modal for renaming the player's own name
 * or their team. Touch-friendly, autofocus, escape/backdrop closes.
 */
export function RenameModal({
  title,
  initial,
  emojiInitial,
  busyLabel,
  onClose,
  onSubmit,
}: Props) {
  const [name, setName] = useState(initial);
  const [emoji, setEmoji] = useState(emojiInitial ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    if (
      trimmed === initial.trim() &&
      (emojiInitial === undefined || emoji === emojiInitial)
    ) {
      onClose();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        name: trimmed,
        ...(emojiInitial !== undefined ? { emoji } : {}),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save");
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-3"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-bg-card border border-white/10 p-5 shadow-2xl"
      >
        <div className="font-display text-xl font-extrabold tracking-wider mb-4">
          {title}
        </div>

        {emojiInitial !== undefined && (
          <label className="block mb-4">
            <span className="text-[11px] uppercase tracking-widest opacity-70 font-bold">
              Emoji
            </span>
            <input
              type="text"
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              maxLength={32}
              placeholder="🎉"
              aria-label="Team emoji"
              className="mt-1 w-20 text-3xl text-center rounded-xl bg-bg-deep border border-white/10 px-3 py-2 outline-none focus:border-accent-pink"
            />
            <span className="block mt-1 text-[10px] opacity-60">
              Tap to open your keyboard&apos;s emoji picker
            </span>
          </label>
        )}

        <label className="block">
          <span className="text-[11px] uppercase tracking-widest opacity-70 font-bold">
            Name
          </span>
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            className="mt-1 w-full rounded-xl bg-bg-deep border border-white/10 px-4 py-3 outline-none focus:border-accent-pink text-base"
          />
        </label>

        {error ? (
          <div className="mt-3 text-xs text-accent-pink">{error}</div>
        ) : null}

        <div className="mt-5 flex flex-col gap-2">
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className="w-full py-4 rounded-2xl bg-gradient-party font-display text-base font-extrabold tracking-widest disabled:opacity-50"
          >
            {busy ? busyLabel ?? "SAVING…" : "SAVE"}
          </button>
          <button
            type="button"
            onClick={() => {
              if (!busy) onClose();
            }}
            disabled={busy}
            className="w-full py-3 rounded-2xl bg-bg-deep border border-white/20 font-display text-sm font-extrabold tracking-widest disabled:opacity-50"
          >
            CANCEL
          </button>
        </div>
      </form>
    </div>
  );
}
