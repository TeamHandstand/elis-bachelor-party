import "server-only";
import PubNub from "pubnub";
import type { ProgressMsg } from "@/lib/types";
import { eventChannel } from "./channel";

let _server: PubNub | null = null;

export function getServerPubNub(): PubNub {
  if (_server) return _server;
  const publishKey = process.env.NEXT_PUBLIC_PUBNUB_PUBLISH_KEY;
  const subscribeKey = process.env.NEXT_PUBLIC_PUBNUB_SUBSCRIBE_KEY;
  const secretKey = process.env.PUBNUB_SECRET_KEY;
  if (!publishKey || !subscribeKey || !secretKey) {
    throw new Error("Server PubNub keys missing");
  }
  _server = new PubNub({
    publishKey,
    subscribeKey,
    secretKey,
    userId: "toasty-server",
  });
  return _server;
}

export async function publishFromServer(code: string, message: ProgressMsg): Promise<void> {
  const client = getServerPubNub();
  await client.publish({
    channel: eventChannel(code),
    // PubNub's Payload type rejects tagged unions; cast for transport.
    message: message as any,
  });
}
