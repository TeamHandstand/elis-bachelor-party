"use client";

import { useId, useState } from "react";
import {
  emptyTriviaQuestion,
  newTriviaQuestionId,
} from "@/lib/challenges";
import type { TriviaQuestion } from "@/lib/types";

interface Props {
  questions: TriviaQuestion[];
  onChange: (next: TriviaQuestion[]) => void;
}

/**
 * Inline editor for a list of trivia questions. The host adds/removes/edits
 * questions, choices, and marks the correct answer. Auto-saves are caller's
 * responsibility — this component just emits the latest list via onChange.
 */
export function TriviaQuestionsEditor({ questions, onChange }: Props) {
  function update(idx: number, patch: Partial<TriviaQuestion>) {
    const next = questions.map((q, i) => (i === idx ? { ...q, ...patch } : q));
    onChange(next);
  }
  function remove(idx: number) {
    onChange(questions.filter((_, i) => i !== idx));
  }
  function move(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= questions.length) return;
    const next = [...questions];
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next);
  }
  function add() {
    onChange([...questions, emptyTriviaQuestion()]);
  }

  return (
    <div className="space-y-3">
      {questions.length === 0 && (
        <div className="rounded-xl bg-bg-deep border border-dashed border-white/15 p-5 text-center text-sm opacity-70">
          No questions yet. Add one below or apply a preset.
        </div>
      )}
      {questions.map((q, idx) => (
        <QuestionRow
          key={q.id}
          ordinal={idx + 1}
          question={q}
          first={idx === 0}
          last={idx === questions.length - 1}
          onChange={(patch) => update(idx, patch)}
          onRemove={() => remove(idx)}
          onMoveUp={() => move(idx, -1)}
          onMoveDown={() => move(idx, 1)}
        />
      ))}

      <button
        type="button"
        onClick={add}
        className="w-full py-3 rounded-xl bg-bg-deep border border-white/15 hover:border-accent-orange text-sm font-bold flex items-center justify-center gap-2"
      >
        ➕ Add question
      </button>
    </div>
  );
}

function QuestionRow({
  ordinal,
  question,
  first,
  last,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  ordinal: number;
  question: TriviaQuestion;
  first: boolean;
  last: boolean;
  onChange: (patch: Partial<TriviaQuestion>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const promptId = useId();

  function setChoice(i: number, value: string) {
    const next = [...question.choices];
    next[i] = value;
    onChange({ choices: next });
  }
  function addChoice() {
    if (question.choices.length >= 8) return;
    onChange({ choices: [...question.choices, ""] });
  }
  function removeChoice(i: number) {
    if (question.choices.length <= 2) return;
    const next = question.choices.filter((_, idx) => idx !== i);
    let correctIndex = question.correctIndex;
    if (correctIndex === i) correctIndex = 0;
    else if (correctIndex > i) correctIndex -= 1;
    onChange({ choices: next, correctIndex });
  }

  return (
    <div className="rounded-xl bg-bg-deep border border-white/10 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <span className="font-display font-extrabold text-accent-orange tabular-nums w-6 text-center">
          {ordinal}
        </span>
        <input
          id={promptId}
          type="text"
          value={question.prompt}
          placeholder="Question prompt…"
          onChange={(e) => onChange({ prompt: e.target.value })}
          className="flex-1 rounded-lg bg-bg-card border border-white/10 px-3 py-2 outline-none focus:border-accent-pink"
        />
        <div className="flex gap-1">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={first}
            aria-label="Move up"
            className="px-2 py-2 rounded-lg bg-bg-card border border-white/10 disabled:opacity-30 text-xs"
          >
            ▲
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={last}
            aria-label="Move down"
            className="px-2 py-2 rounded-lg bg-bg-card border border-white/10 disabled:opacity-30 text-xs"
          >
            ▼
          </button>
          <button
            type="button"
            onClick={onRemove}
            aria-label="Remove question"
            className="px-2 py-2 rounded-lg bg-bg-card border border-white/10 text-xs hover:text-accent-pink"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="space-y-2 pl-8">
        {question.choices.map((c, i) => {
          const isCorrect = i === question.correctIndex;
          return (
            <div key={i} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onChange({ correctIndex: i })}
                aria-label={isCorrect ? "Marked correct" : "Mark correct"}
                className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center shrink-0 ${
                  isCorrect
                    ? "bg-accent-green text-bg-deep"
                    : "bg-bg-card border border-white/15 opacity-70 hover:opacity-100"
                }`}
              >
                {isCorrect ? "✓" : String.fromCharCode(65 + i)}
              </button>
              <input
                type="text"
                value={c}
                placeholder={`Choice ${String.fromCharCode(65 + i)}`}
                onChange={(e) => setChoice(i, e.target.value)}
                className={`flex-1 rounded-lg px-3 py-2 outline-none border ${
                  isCorrect
                    ? "bg-accent-green/10 border-accent-green/60"
                    : "bg-bg-card border-white/10 focus:border-accent-pink"
                }`}
              />
              <button
                type="button"
                onClick={() => removeChoice(i)}
                disabled={question.choices.length <= 2}
                aria-label="Remove choice"
                className="px-2 py-2 rounded-lg bg-bg-card border border-white/10 text-xs disabled:opacity-30"
              >
                ✕
              </button>
            </div>
          );
        })}
        {question.choices.length < 8 && (
          <button
            type="button"
            onClick={addChoice}
            className="text-xs px-3 py-1.5 rounded-lg bg-bg-card border border-white/10 hover:border-accent-orange font-bold"
          >
            + add choice
          </button>
        )}
        <div className="text-[10px] uppercase tracking-widest opacity-50 pl-1">
          tap a letter to mark the correct answer
        </div>
      </div>
    </div>
  );
}

export { newTriviaQuestionId };
