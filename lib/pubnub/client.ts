"use client";
import PubNub from "pubnub";
import type { ProgressMsg } from "@/lib/types";
import { eventChannel } from "./channel";

let _client: PubNub | null = null;

export function getPubNubClient(uuid: string): PubNub {
  if (_client) return _client;
  const publishKey = process.env.NEXT_PUBLIC_PUBNUB_PUBLISH_KEY;
  const subscribeKey = process.env.NEXT_PUBLIC_PUBNUB_SUBSCRIBE_KEY;
  if (!publishKey || !subscribeKey) {
    throw new Error("PubNub keys missing — check NEXT_PUBLIC_PUBNUB_* env vars");
  }
  _client = new PubNub({
    publishKey,
    subscribeKey,
    userId: uuid,
    heartbeatInterval: 30,
    presenceTimeout: 60,
  });
  return _client;
}

export type SubscribeHandle = {
  unsubscribe: () => void;
};

// Loose presence shape; we read the fields we care about defensively.
export interface PresenceEvent {
  action: string;
  uuid?: string;
  occupancy?: number;
  timestamp?: number;
}

export function subscribeToEvent(
  client: PubNub,
  code: string,
  onMessage: (msg: ProgressMsg) => void,
  onPresence?: (event: PresenceEvent) => void,
): SubscribeHandle {
  const channel = eventChannel(code);

  // PubNub's Listener types are tight enough that they fight tagged-union
  // event payloads; we use `any` for the listener object only.
  const listener: any = {
    message: (e: { message: unknown }) => {
      try {
        onMessage(e.message as ProgressMsg);
      } catch (err) {
        console.error("[pubnub] message handler threw", err);
      }
    },
    presence: (e: any) => {
      onPresence?.({
        action: e?.action,
        uuid: e?.uuid ?? e?.data?.uuid,
        occupancy: e?.occupancy,
        timestamp: e?.timestamp,
      });
    },
    status: (e: { category?: string }) => {
      if (
        e.category === "PNNetworkDownCategory" ||
        e.category === "PNUnexpectedDisconnectCategory"
      ) {
        console.warn("[pubnub] connection issue:", e.category);
      }
    },
  };

  client.addListener(listener);
  client.subscribe({ channels: [channel], withPresence: true });

  return {
    unsubscribe: () => {
      client.removeListener(listener);
      client.unsubscribe({ channels: [channel] });
    },
  };
}

export async function publishToEvent(
  client: PubNub,
  code: string,
  message: ProgressMsg,
): Promise<void> {
  const channel = eventChannel(code);
  // PubNub's Payload type rejects tagged unions; cast for transport.
  await client.publish({ channel, message: message as any });
}

/**
 * Fetch recent message history for state recovery on reconnect.
 * Default: last 100 messages.
 */
export async function fetchHistory(
  client: PubNub,
  code: string,
  count = 100,
): Promise<ProgressMsg[]> {
  const channel = eventChannel(code);
  const res = await client.fetchMessages({ channels: [channel], count });
  const msgs = res.channels[channel] ?? [];
  return msgs.map((m) => m.message as unknown as ProgressMsg);
}
