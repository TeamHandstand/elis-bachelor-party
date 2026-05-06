"use client";

import { useMemo, useState } from "react";
import { useToastyStore } from "@/lib/store";
import { useTeammates } from "@/lib/store/selectors";
import { usePublisher } from "@/lib/store/bootstrap";
import { scoreTriviaAnswers } from "@/lib/challenges";
import type { TriviaQuestion } from "@/lib/types";

interface Props {
  code: string;
  myPlayerId: string;
  roundIndex: number;
}

export function TriviaView({ code, myPlayerId, roundIndex }: Props) {
  const publisher = usePublisher(code);
  const myTeamId = useToastyStore((s) => s.myTeamId);
  const myProgress = useToastyStore((s) => s.getMyTeamProgress());
  const event = useToastyStore((s) => s.event);
  const players = useToastyStore((s) => s.players);
  const teammates = useTeammates();

  const round = event?.rounds[roundIndex];
  const questions: TriviaQuestion[] = round?.questions ?? [];
  const cur = myProgress?.[roundIndex];
  const submitted = !!cur?.completed;
  const answers: Record<string, number> = useMemo(() => {
    if (submitted) return cur?.triviaAnswers ?? {};
    return cur?.triviaDraft ?? {};
  }, [submitted, cur?.triviaAnswers, cur?.triviaDraft]);

  const submitterId = cur?.triviaSubmittedBy ?? null;
  const submitterName = submitterId
    ? submitterId === myPlayerId
      ? "you"
      : players[submitterId]?.name ?? "?"
    : null;

  const [submitting, setSubmitting] = useState(false);

  if (questions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 p-8 text-center">
        <div className="text-5xl mb-3">🤷</div>
        <div className="font-display font-extrabold text-lg mb-2">
          No questions configured
        </div>
        <div className="text-xs opacity-70 max-w-xs">
          The host needs to add some trivia questions before this round can
          start. Tell them to head to the host page.
        </div>
      </div>
    );
  }

  function pick(questionId: string, choiceIndex: number) {
    if (submitted || !myTeamId) return;
    publisher({
      kind: "trivia-pick",
      teamId: myTeamId,
      playerId: myPlayerId,
      roundIndex,
      questionId,
      choiceIndex,
      ts: Date.now(),
    }).catch(() => {});
  }

  async function submit() {
    if (submitted || submitting || !myTeamId) return;
    setSubmitting(true);
    const finalAnswers = { ...(cur?.triviaDraft ?? {}) };
    const correctCount = scoreTriviaAnswers(questions, finalAnswers);
    try {
      await publisher({
        kind: "trivia-submit",
        teamId: myTeamId,
        playerId: myPlayerId,
        roundIndex,
        answers: finalAnswers,
        correctCount,
        ts: Date.now(),
      });
    } finally {
      setSubmitting(false);
    }
  }

  const answeredCount = questions.filter((q) => q.id in answers).length;
  const allAnswered = answeredCount === questions.length;
  const correctCount =
    submitted && cur?.triviaAnswers
      ? scoreTriviaAnswers(questions, cur.triviaAnswers)
      : 0;

  return (
    <div className="flex flex-col flex-1 p-4 gap-4 overflow-y-auto pb-32">
      {/* Live-team status bar */}
      <div
        className={`rounded-2xl px-4 py-3 text-xs ${
          submitted
            ? "bg-gradient-done text-white"
            : "bg-bg-card border border-white/10"
        }`}
      >
        {submitted ? (
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-widest opacity-90">
                ✅ submitted
              </div>
              <div className="font-display font-extrabold text-base">
                {submitterName ?? "your team"} locked in
              </div>
            </div>
            <div className="text-right">
              <div className="font-display text-3xl font-extrabold tabular-nums leading-none">
                {correctCount}
              </div>
              <div className="text-[10px] uppercase tracking-widest opacity-90">
                / {questions.length}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-widest opacity-60">
                pick together · live synced
              </div>
              <div className="font-bold">
                Anyone on your team can change answers. Hit SUBMIT when ready.
              </div>
            </div>
            <div className="text-right tabular-nums">
              <div className="font-display text-2xl font-extrabold leading-none">
                {answeredCount}
              </div>
              <div className="text-[10px] uppercase tracking-widest opacity-60">
                / {questions.length}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Question list */}
      <div className="flex flex-col gap-3">
        {questions.map((q, qIdx) => {
          const picked = answers[q.id];
          return (
            <div
              key={q.id}
              className="rounded-2xl bg-bg-card border border-white/10 p-4"
            >
              <div className="flex items-baseline gap-2 mb-3">
                <div className="font-display font-extrabold text-accent-orange tabular-nums w-6">
                  {qIdx + 1}.
                </div>
                <div className="font-bold leading-snug flex-1">{q.prompt}</div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {q.choices.map((choice, cIdx) => {
                  const isPicked = picked === cIdx;
                  const isCorrect = q.correctIndex === cIdx;
                  let cls =
                    "px-3 py-2 rounded-xl text-left text-sm font-bold border transition-colors ";
                  if (submitted) {
                    if (isCorrect) {
                      cls +=
                        "bg-accent-green/30 border-accent-green text-white";
                    } else if (isPicked) {
                      cls += "bg-accent-pink/20 border-accent-pink/60";
                    } else {
                      cls += "bg-bg-deep border-white/10 opacity-70";
                    }
                  } else {
                    cls += isPicked
                      ? "bg-gradient-party border-transparent text-white"
                      : "bg-bg-deep border-white/10 hover:border-accent-orange/50";
                  }
                  return (
                    <button
                      key={cIdx}
                      type="button"
                      onClick={() => pick(q.id, isPicked ? -1 : cIdx)}
                      disabled={submitted}
                      className={cls}
                    >
                      <span className="opacity-60 mr-2 tabular-nums">
                        {String.fromCharCode(65 + cIdx)}.
                      </span>
                      {choice}
                      {submitted && isCorrect ? (
                        <span className="ml-2 text-[10px] uppercase tracking-widest opacity-90">
                          ✅ correct
                        </span>
                      ) : null}
                      {submitted && isPicked && !isCorrect ? (
                        <span className="ml-2 text-[10px] uppercase tracking-widest opacity-90">
                          ✗ your pick
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Teammates strip */}
      {teammates.length > 0 && (
        <div className="text-[11px] opacity-60 text-center">
          team:{" "}
          {teammates.map((p, i) => (
            <span key={p.id}>
              {i > 0 ? " · " : ""}
              <span className={p.id === myPlayerId ? "font-bold" : ""}>
                {p.id === myPlayerId ? "you" : p.name}
              </span>
            </span>
          ))}
        </div>
      )}

      {/* Sticky submit bar */}
      {!submitted && (
        <div className="fixed bottom-0 left-0 right-0 bg-bg-deep/95 backdrop-blur border-t border-white/10 p-4 flex flex-col items-center gap-2 z-20">
          {!allAnswered && (
            <div className="text-[10px] uppercase tracking-widest text-accent-pink">
              {questions.length - answeredCount} unanswered — submitting now
              counts those wrong
            </div>
          )}
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="w-full max-w-md py-4 rounded-2xl bg-gradient-party font-display text-xl font-extrabold tracking-widest disabled:opacity-50"
          >
            {submitting ? "..." : "SUBMIT TEAM ANSWERS"}
          </button>
          <div className="text-[10px] opacity-60">
            one submission per team · earliest correct submission wins ties
          </div>
        </div>
      )}
    </div>
  );
}
