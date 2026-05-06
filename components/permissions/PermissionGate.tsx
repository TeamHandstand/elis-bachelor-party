"use client";

import { useEffect, useRef, useState } from "react";

type GateState =
  | "checking"
  | "needs-tap"
  | "requesting"
  | "granted"
  | "denied";

interface Props {
  /** Big emoji shown above the title. */
  icon: string;
  /** Short uppercase noun, e.g. "COMPASS", "MOTION", "MIC", "LOCATION". */
  label: string;
  /** One-sentence explanation rendered under the title. */
  blurb: string;
  /**
   * Called to ask the OS for permission. MUST be safe to call inside a tap
   * handler — on iOS that's the only way the system prompt actually appears.
   */
  request: () => Promise<boolean>;
  /**
   * iOS Settings string for the "still blocked?" hint, e.g.
   * "Motion & Orientation Access" or "Microphone". When omitted the hint
   * collapses to a generic message.
   */
  iosSetting?: string;
  /**
   * When true, skip the optimistic mount-time request and always require a
   * tap. Use this when `request` does work that *needs* user activation to
   * succeed (e.g. AudioContext.resume() for the mic challenge) — calling it
   * outside a tap handler can leave the resource in a half-initialised state
   * even if the OS-level permission is already granted.
   */
  requireUserGesture?: boolean;
  /** Rendered once permission is granted. */
  children: React.ReactNode;
}

// iOS Safari requires DeviceMotion/Orientation permission popups to be
// triggered from a synchronous user gesture. The presence of these static
// requestPermission() functions is the most reliable feature detect.
function iosGesturePermsExist(): boolean {
  if (typeof window === "undefined") return false;
  const ME: any = (window as any).DeviceMotionEvent;
  const OE: any = (window as any).DeviceOrientationEvent;
  return (
    (ME && typeof ME.requestPermission === "function") ||
    (OE && typeof OE.requestPermission === "function")
  );
}

/**
 * Wrap a sensor-using challenge view in this gate. While permission isn't
 * granted, renders a big ENABLE button. Tapping it calls `request()` from
 * inside the click handler — which is the only way iOS will surface the
 * system prompt. Once granted, renders children.
 *
 * On non-iOS platforms an optimistic mount-time request runs so users don't
 * see an extra tap; on iOS we still try optimistically (in case the grant is
 * already active in this document) but fall back to the button when not.
 */
export function PermissionGate({
  icon,
  label,
  blurb,
  request,
  iosSetting,
  requireUserGesture,
  children,
}: Props) {
  const [state, setState] = useState<GateState>(
    requireUserGesture ? "needs-tap" : "checking",
  );
  const requestRef = useRef(request);
  requestRef.current = request;

  useEffect(() => {
    if (requireUserGesture) return;
    let cancelled = false;
    (async () => {
      try {
        const ok = await requestRef.current();
        if (cancelled) return;
        if (ok) {
          setState("granted");
        } else {
          setState(iosGesturePermsExist() ? "needs-tap" : "denied");
        }
      } catch {
        if (cancelled) return;
        setState(iosGesturePermsExist() ? "needs-tap" : "denied");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [requireUserGesture]);

  async function handleTap() {
    setState("requesting");
    try {
      const ok = await requestRef.current();
      setState(ok ? "granted" : "denied");
    } catch {
      setState("denied");
    }
  }

  if (state === "granted") return <>{children}</>;

  if (state === "checking") {
    return (
      <div className="flex flex-col items-center justify-center flex-1 p-6 text-center">
        <div className="text-5xl animate-spin">🍕</div>
      </div>
    );
  }

  const denied = state === "denied";
  const requesting = state === "requesting";
  return (
    <div className="flex flex-col items-center justify-center flex-1 p-6 text-center gap-4">
      <div className="text-7xl">{icon}</div>
      <div className="font-display text-3xl font-extrabold tracking-wide">
        {denied ? `${label} BLOCKED` : `ENABLE ${label}`}
      </div>
      <div className="text-sm max-w-xs opacity-90">{blurb}</div>
      <button
        type="button"
        onClick={handleTap}
        disabled={requesting}
        className="w-full max-w-xs py-5 rounded-2xl bg-gradient-party font-display text-xl font-extrabold tracking-widest disabled:opacity-50"
      >
        {requesting ? "ASKING…" : denied ? "TRY AGAIN" : `ENABLE ${label}`}
      </button>
      {denied && (
        <div className="mt-2 max-w-xs rounded-2xl border-2 border-accent-pink bg-accent-pink/10 p-4 text-left">
          <div className="font-display text-lg font-extrabold text-accent-pink mb-2">
            ⚠️ STILL BLOCKED?
          </div>
          <div className="text-sm leading-snug">
            {iosSetting ? (
              <>
                On iPhone: open Settings → Safari →{" "}
                <b>{iosSetting}</b> and turn it ON. Then come back and tap{" "}
                <b>TRY AGAIN</b>. If that fails, fully quit Safari from the app
                switcher and reopen this page.
              </>
            ) : (
              <>
                Open your browser&rsquo;s site permissions and allow this
                site, then come back and tap <b>TRY AGAIN</b>.
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
