"use client";
import { useEffect } from "react";
import { useToastyStore } from "@/lib/store";
import {
  fetchHistory,
  getPubNubClient,
  publishToEvent,
  subscribeToEvent,
} from "@/lib/pubnub/client";
import { getOrCreateDeviceId } from "@/lib/utils/device";
import type { GetEventResponse } from "@/lib/api/contract";
import type { ProgressMsg } from "@/lib/types";

/**
 * Subscribe a player (or host monitor) to an event.
 *
 *  - Fetches initial config/teams/players from the API.
 *  - Bootstraps the Zustand store.
 *  - Hydrates progress from PubNub message history.
 *  - Subscribes to live PubNub messages.
 *
 * Pass `myPlayerId = null` to subscribe in spectator mode (host monitor).
 */
export function useEventBootstrap(code: string, myPlayerId: string | null): void {
  const bootstrap = useToastyStore((s) => s.bootstrap);
  const receive = useToastyStore((s) => s.receive);

  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | null = null;

    (async () => {
      const deviceId = getOrCreateDeviceId();

      const res = await fetch(`/api/events/${code}`);
      if (!res.ok) return;
      const data = (await res.json()) as GetEventResponse;
      if (cancelled) return;

      bootstrap({
        event: data.event,
        teams: data.teams,
        players: data.players,
        myPlayerId: myPlayerId ?? "__spectator__",
        myDeviceId: deviceId,
      });

      const client = getPubNubClient(myPlayerId ?? deviceId);

      try {
        const history = await fetchHistory(client, code, 100);
        for (const msg of history) receive(msg);
      } catch (err) {
        console.warn("[bootstrap] history fetch failed", err);
      }

      if (cancelled) return;

      const sub = subscribeToEvent(client, code, receive);
      unsub = sub.unsubscribe;
    })();

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [code, myPlayerId, bootstrap, receive]);
}

/**
 * Convenience: get a publisher bound to a code.
 * Sensors call this and publish their own progress messages.
 */
export function usePublisher(code: string): (msg: ProgressMsg) => Promise<void> {
  return async (msg: ProgressMsg) => {
    const deviceId = getOrCreateDeviceId();
    const client = getPubNubClient(deviceId);
    await publishToEvent(client, code, msg);
  };
}
