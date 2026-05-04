/**
 * Generate a 6-character event code, easy to read aloud and type.
 * Avoids visually ambiguous characters (0/O, 1/I/L).
 */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateEventCode(): string {
  let s = "";
  for (let i = 0; i < 6; i++) {
    s += ALPHABET.charAt(Math.floor(Math.random() * ALPHABET.length));
  }
  return s;
}

export function normalizeEventCode(input: string): string {
  return input.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}
