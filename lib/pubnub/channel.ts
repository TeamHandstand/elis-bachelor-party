// Channel naming is shared across client and server.
export function eventChannel(code: string): string {
  return `event-${code.toUpperCase()}`;
}
