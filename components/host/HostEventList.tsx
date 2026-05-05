"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listEvents } from "./_fetch";
import type { ListEventsResponse } from "@/lib/api/contract";

interface Props {
  initial: ListEventsResponse["events"];
}

const POLL_INTERVAL_MS = 4000;

/**
 * Client-side wrapper around the events list that:
 *  - polls /api/host/events every few seconds so LIVE / countdown markers
 *    stay fresh without a hard refresh
 *  - if any event is currently in countdown (status='live' AND startsAt is
 *    still in the future), redirects the host into that event's journey
 *    so they never miss the kickoff.
 */
export default function HostEventList({ initial }: Props) {
  const router = useRouter();
  const [events, setEvents] = useState(initial);

  useEffect(() => {
    let cancelled = false;
    let redirected = false;

    async function poll() {
      try {
        const data = await listEvents();
        if (cancelled) return;
        setEvents(data.events);

        // Auto-redirect once if any event is mid-countdown.
        if (!redirected) {
          const now = Date.now();
          const countdown = data.events.find(
            (e) =>
              e.status === "active" &&
              e.currentRoundStatus === "live" &&
              e.currentRoundStartsAt !== null &&
              e.currentRoundStartsAt > now,
          );
          if (countdown) {
            redirected = true;
            router.push(`/e/${countdown.code}/play`);
          }
        }
      } catch {
        /* ignore — try again next tick */
      }
    }

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [router]);

  if (events.length === 0) {
    return (
      <div className="bg-bg-card rounded-xl2 p-8 text-center opacity-70">
        <div className="text-5xl mb-2">🌭</div>
        <div className="font-bold mb-1">No events yet</div>
        <div className="text-sm opacity-80">
          Hit “New event” to spin one up.
        </div>
      </div>
    );
  }

  const now = Date.now();

  return (
    <ul className="space-y-2">
      {events.map((ev) => {
        const isLive = ev.status === "active";
        const inCountdown =
          isLive &&
          ev.currentRoundStatus === "live" &&
          ev.currentRoundStartsAt !== null &&
          ev.currentRoundStartsAt > now;
        const inRound =
          isLive &&
          ev.currentRoundStatus === "live" &&
          ev.currentRoundStartsAt !== null &&
          ev.currentRoundStartsAt <= now;

        return (
          <li key={ev.id}>
            <Link
              href={isLive ? `/e/${ev.code}/play` : `/host/${ev.code}`}
              className={`flex items-center justify-between gap-3 rounded-xl2 p-4 transition-colors ${
                isLive
                  ? "bg-bg-card ring-2 ring-accent-pink/60"
                  : "bg-bg-card hover:bg-bg-deep"
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-display text-lg font-bold truncate">
                    {ev.title || "Untitled event"}
                  </span>
                  {inCountdown ? (
                    <span className="px-2 py-0.5 rounded-full bg-accent-orange text-bg text-[10px] uppercase tracking-widest font-extrabold animate-pulse">
                      ⏱ COUNTDOWN
                    </span>
                  ) : inRound ? (
                    <span className="px-2 py-0.5 rounded-full bg-accent-pink text-white text-[10px] uppercase tracking-widest font-extrabold animate-pulse">
                      ● LIVE
                    </span>
                  ) : isLive ? (
                    <span className="px-2 py-0.5 rounded-full bg-accent-green text-bg text-[10px] uppercase tracking-widest font-extrabold">
                      ACTIVE
                    </span>
                  ) : null}
                </div>
                <div className="text-xs opacity-60 mt-1">
                  <span className="font-bold tracking-widest text-accent-orange">
                    {ev.code}
                  </span>{" "}
                  · {new Date(ev.createdAt).toLocaleString()} · {ev.status}
                </div>
              </div>
              <span className="opacity-50 flex flex-col items-end gap-0.5">
                {isLive ? (
                  <span className="text-[10px] uppercase tracking-widest opacity-60">
                    join →
                  </span>
                ) : null}
                <span className="text-lg">→</span>
              </span>
            </Link>
            {isLive && (
              <div className="mt-1 ml-2">
                <Link
                  href={`/host/${ev.code}`}
                  className="text-[11px] opacity-50 underline hover:opacity-80"
                >
                  manage event →
                </Link>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
