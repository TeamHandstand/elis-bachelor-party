"use client";

import { useEffect } from "react";

export default function PlayerError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[player-error]", error);
  }, [error]);

  return (
    <main className="min-h-screen p-6 flex flex-col items-center justify-center text-center">
      <div className="text-5xl mb-3">🍕💥</div>
      <div className="font-display text-xl font-extrabold mb-2">
        Burned the pizza.
      </div>
      <p className="text-xs opacity-70 mb-3 max-w-xs">
        Send this to Sam:
      </p>
      <pre className="bg-bg-deep text-yellow-200 text-[11px] p-3 rounded-xl max-w-sm overflow-auto whitespace-pre-wrap break-words text-left">
        {error.message || "(no message)"}
        {error.stack ? `\n\n${error.stack}` : ""}
        {error.digest ? `\n\ndigest: ${error.digest}` : ""}
      </pre>
      <button
        onClick={() => reset()}
        className="mt-4 px-5 py-2 rounded-2xl bg-gradient-party font-bold"
      >
        Try again →
      </button>
    </main>
  );
}
