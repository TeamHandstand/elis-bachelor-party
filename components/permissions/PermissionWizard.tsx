"use client";

import { useState } from "react";

interface Step {
  id: "motion" | "orientation" | "geo" | "mic";
  label: string;
  emoji: string;
  blurb: string;
  request: () => Promise<boolean>;
}

async function requestMotion(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const ME: any = (window as any).DeviceMotionEvent;
  if (ME && typeof ME.requestPermission === "function") {
    try {
      return (await ME.requestPermission()) === "granted";
    } catch {
      return false;
    }
  }
  return true;
}

async function requestOrientation(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const OE: any = (window as any).DeviceOrientationEvent;
  if (OE && typeof OE.requestPermission === "function") {
    try {
      return (await OE.requestPermission()) === "granted";
    } catch {
      return false;
    }
  }
  return true;
}

async function requestGeo(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return false;
  return new Promise<boolean>((resolve) => {
    try {
      navigator.geolocation.getCurrentPosition(
        () => resolve(true),
        () => resolve(false),
        { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
      );
    } catch {
      resolve(false);
    }
  });
}

async function requestMic(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices) return false;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Release immediately — DbMeter will reopen when needed.
    stream.getTracks().forEach((t) => t.stop());
    return true;
  } catch {
    return false;
  }
}

const STEPS: Step[] = [
  {
    id: "motion",
    label: "Motion",
    emoji: "📳",
    blurb: "Steps, shake, spin — we need your phone’s wiggle.",
    request: requestMotion,
  },
  {
    id: "orientation",
    label: "Compass",
    emoji: "🧭",
    blurb: "For Due North + spin counting.",
    request: requestOrientation,
  },
  {
    id: "geo",
    label: "Location",
    emoji: "📍",
    blurb: "GPS for the distance challenge.",
    request: requestGeo,
  },
  {
    id: "mic",
    label: "Microphone",
    emoji: "🎤",
    blurb: "So you can scream loud enough.",
    request: requestMic,
  },
];

interface Props {
  onComplete: () => void;
}

export function PermissionWizard({ onComplete }: Props) {
  const [granted, setGranted] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const allDone = STEPS.every((s) => granted[s.id]);

  async function run(step: Step) {
    setBusy(step.id);
    const ok = await step.request();
    setGranted((g) => ({ ...g, [step.id]: ok }));
    setBusy(null);
  }

  return (
    <div className="fixed inset-0 z-50 bg-bg-deep/95 flex flex-col p-5 overflow-y-auto safe-top safe-bottom">
      <div className="max-w-md w-full mx-auto flex-1 flex flex-col">
        <div className="text-center mb-6 mt-4">
          <div className="text-5xl mb-2">🍕</div>
          <div className="font-display text-2xl font-extrabold tracking-wider">
            UNLOCK YOUR PHONE
          </div>
          <div className="text-sm opacity-70 mt-2">
            Hit ENABLE on each. Say YES to every popup. No data leaves your phone — promise.
          </div>
        </div>

        <div className="flex flex-col gap-3 flex-1">
          {STEPS.map((step) => {
            const isOk = granted[step.id];
            const isBusy = busy === step.id;
            return (
              <div
                key={step.id}
                className={`rounded-2xl p-4 ${
                  isOk ? "bg-gradient-done" : "bg-bg-card"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="text-3xl">{step.emoji}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold tracking-wide">{step.label}</div>
                    <div className="text-xs opacity-80">{step.blurb}</div>
                  </div>
                  {isOk ? (
                    <div className="text-2xl">✅</div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => run(step)}
                      disabled={isBusy}
                      className="px-4 py-2 rounded-xl bg-gradient-party font-extrabold text-sm tracking-wider disabled:opacity-60"
                    >
                      {isBusy ? "..." : "ENABLE"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 mb-2">
          <button
            type="button"
            onClick={onComplete}
            disabled={!allDone}
            className="w-full py-4 rounded-2xl bg-gradient-party font-display text-lg font-extrabold tracking-widest disabled:opacity-40 disabled:bg-bg-card"
          >
            {allDone ? "LET'S GO 🔥" : "ENABLE THE STUFF ABOVE"}
          </button>
          <button
            type="button"
            onClick={onComplete}
            className="w-full mt-2 py-2 text-xs opacity-50"
          >
            Skip for now (some challenges won’t work)
          </button>
        </div>
      </div>
    </div>
  );
}
