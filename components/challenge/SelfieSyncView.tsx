"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useToastyStore } from "@/lib/store";
import { useTeammates } from "@/lib/store/selectors";
import { usePublisher } from "@/lib/store/bootstrap";
import { CHALLENGES } from "@/lib/challenges";
import {
  expressionForRound,
  type Expression,
} from "@/lib/challenges/selfie-expressions";
import {
  blendshapesByName,
  getFaceLandmarker,
} from "@/lib/sensors/face-landmarker";
import { PermissionGate } from "@/components/permissions/PermissionGate";

interface Props {
  code: string;
  myPlayerId: string;
  roundIndex: number;
}

const PUBLISH_INTERVAL_MS = 250;
const MATCH_THRESHOLD = 0.5; // a "good enough" match for a teammate

async function requestCameraPerm(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia)
    return false;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: 320, height: 240 },
      audio: false,
    });
    // Release immediately — the challenge component re-acquires once it mounts.
    for (const t of stream.getTracks()) t.stop();
    return true;
  } catch {
    return false;
  }
}

export function SelfieSyncView(props: Props) {
  return (
    <PermissionGate
      icon="📷"
      label="CAMERA"
      blurb="We need your front camera to read your face. Hit ENABLE and say YES."
      request={requestCameraPerm}
      iosSetting="Camera"
      requireUserGesture
    >
      <SelfieSyncChallenge {...props} />
    </PermissionGate>
  );
}

function SelfieSyncChallenge({ code, myPlayerId, roundIndex }: Props) {
  const publisher = usePublisher(code);
  const myTeamId = useToastyStore((s) => s.myTeamId);
  const teammates = useTeammates();
  const liveLevels = useToastyStore((s) => s.liveLevels);
  const event = useToastyStore((s) => s.event);
  const myProgress = useToastyStore((s) => s.getMyTeamProgress());

  const expression: Expression = useMemo(
    () => expressionForRound(code, roundIndex),
    [code, roundIndex],
  );

  const def = CHALLENGES["selfie-sync"];
  const threshold =
    event?.rounds[roundIndex]?.threshold ?? def.defaultThreshold;
  const teamCompleted = !!myProgress?.[roundIndex]?.completed;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [myLevel, setMyLevel] = useState(0);
  const [modelReady, setModelReady] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [completeSent, setCompleteSent] = useState(false);

  const lastLevelRef = useRef(0);
  const lastPublishRef = useRef(0);
  const sustainedStartRef = useRef<number | null>(null);

  // Acquire the camera, attach to <video>, and run the detection loop.
  useEffect(() => {
    if (!myTeamId) return;
    let cancelled = false;
    let raf: number | null = null;
    let lastInferTs = 0;

    (async () => {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: 320, height: 240 },
          audio: false,
        });
      } catch (err) {
        if (!cancelled)
          setModelError(
            "Couldn't open the camera. Check Settings → Safari → Camera.",
          );
        return;
      }
      if (cancelled) {
        for (const t of stream.getTracks()) t.stop();
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        // iOS requires these flags + a play() inside the gesture chain that
        // produced the stream — we already ran inside one because the
        // PermissionGate flow set requireUserGesture.
        (video as any).playsInline = true;
        video.muted = true;
        try {
          await video.play();
        } catch {
          /* iOS sometimes rejects; metadata loaded is good enough for inference */
        }
      }

      let landmarker;
      try {
        landmarker = await getFaceLandmarker();
      } catch (err) {
        if (!cancelled)
          setModelError(
            "Couldn't load the face model. Check your connection and reload.",
          );
        return;
      }
      if (cancelled) return;
      setModelReady(true);

      const loop = (ts: number) => {
        if (cancelled) return;
        const v = videoRef.current;
        if (
          !v ||
          v.readyState < 2 ||
          v.videoWidth === 0 ||
          v.videoHeight === 0
        ) {
          raf = requestAnimationFrame(loop);
          return;
        }
        // Throttle to ~20 FPS — the model is the heavy part on iOS.
        if (ts - lastInferTs < 50) {
          raf = requestAnimationFrame(loop);
          return;
        }
        lastInferTs = ts;

        try {
          const result = landmarker!.detectForVideo(v, ts);
          const blends = blendshapesByName(result);
          const match = expression.score(blends);
          lastLevelRef.current = match;
          setMyLevel(match);

          const now = Date.now();
          if (now - lastPublishRef.current >= PUBLISH_INTERVAL_MS) {
            lastPublishRef.current = now;
            publisher({
              kind: "live",
              playerId: myPlayerId,
              teamId: myTeamId,
              roundIndex,
              challenge: "selfie-sync",
              level: match,
              ts: now,
            }).catch(() => {});
          }
        } catch {
          // Inference can occasionally throw on iOS; ignore single-frame errors.
        }

        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    })();

    return () => {
      cancelled = true;
      if (raf !== null) cancelAnimationFrame(raf);
      const s = streamRef.current;
      if (s) {
        for (const t of s.getTracks()) t.stop();
      }
      streamRef.current = null;
    };
  }, [myPlayerId, myTeamId, roundIndex, publisher, expression]);

  // Detect "all teammates above MATCH_THRESHOLD sustained for `threshold` sec".
  useEffect(() => {
    if (!myTeamId || teamCompleted || completeSent) return;
    const interval = setInterval(() => {
      const now = Date.now();
      const recentOk = (lvl?: { level: number; ts: number }) =>
        !!lvl && now - lvl.ts < 1500 && lvl.level >= MATCH_THRESHOLD;

      const me = lastLevelRef.current >= MATCH_THRESHOLD;
      const others = teammates.filter((p) => p.id !== myPlayerId);
      const allOthers = others.every((p) =>
        recentOk(liveLevels[p.id]?.["selfie-sync"]),
      );
      const allMatch = me && (others.length === 0 || allOthers);

      if (allMatch) {
        if (sustainedStartRef.current === null) {
          sustainedStartRef.current = now;
        } else if (now - sustainedStartRef.current >= threshold * 1000) {
          if (!completeSent) {
            setCompleteSent(true);
            publisher({
              kind: "complete",
              teamId: myTeamId,
              roundIndex,
              challenge: "selfie-sync",
              ts: now,
            }).catch(() => {});
          }
        }
      } else {
        sustainedStartRef.current = null;
      }
    }, 200);
    return () => clearInterval(interval);
  }, [
    myTeamId,
    teammates,
    liveLevels,
    myPlayerId,
    threshold,
    teamCompleted,
    completeSent,
    publisher,
    roundIndex,
  ]);

  const others = teammates.filter((p) => p.id !== myPlayerId);
  const meAbove = myLevel >= MATCH_THRESHOLD;
  const othersInfo = others.map((p) => {
    const lvl = liveLevels[p.id]?.["selfie-sync"];
    const recent = !!lvl && Date.now() - lvl.ts < 1500;
    const v = recent ? lvl?.level ?? 0 : 0;
    return { player: p, level: v, ok: recent && v >= MATCH_THRESHOLD };
  });
  const allMatch =
    meAbove && (others.length === 0 || othersInfo.every((o) => o.ok));
  const sustainedSecs = sustainedStartRef.current
    ? (Date.now() - sustainedStartRef.current) / 1000
    : 0;

  return (
    <div
      className={`flex flex-col flex-1 p-3 transition-colors ${
        allMatch ? "bg-accent-pink/30 animate-pulse" : ""
      }`}
    >
      <div className="text-center mb-2">
        <div className="text-[11px] uppercase tracking-widest opacity-60">
          target expression
        </div>
        <div className="font-display text-2xl font-extrabold flex items-center justify-center gap-2">
          <span className="text-3xl">{expression.emoji}</span>
          <span className="text-accent-orange">{expression.label}</span>
        </div>
        <div className="text-[11px] opacity-70 mt-0.5">{expression.hint}</div>
        <div className="text-xs mt-1 font-bold">
          {teamCompleted
            ? "PERFECT FACES, ALL OF YOU 💋"
            : allMatch
              ? `HOLD IT! ${sustainedSecs.toFixed(1)}s / ${threshold}s`
              : `all ${teammates.length || 1} teammates · ${threshold}s sustained`}
        </div>
      </div>

      <div className="relative mx-auto w-full max-w-xs aspect-[4/3] rounded-2xl overflow-hidden bg-bg-deep">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="absolute inset-0 w-full h-full object-cover"
          style={{ transform: "scaleX(-1)" }} // mirror so it feels natural
        />
        {!modelReady && !modelError && (
          <div className="absolute inset-0 flex items-center justify-center bg-bg-deep/80 text-xs font-bold opacity-90">
            loading face model…
          </div>
        )}
        {modelError && (
          <div className="absolute inset-0 flex items-center justify-center text-center bg-bg-deep/95 text-xs font-bold p-4 text-accent-pink">
            {modelError}
          </div>
        )}
        <div
          className={`absolute inset-0 ring-4 ring-inset transition-colors ${
            meAbove ? "ring-accent-orange" : "ring-transparent"
          }`}
        />
      </div>

      <div className="mt-3">
        <MatchBar
          label="YOU"
          level={myLevel}
          big
          highlight={meAbove}
        />
      </div>

      {others.length > 0 && (
        <div className="flex justify-around items-end gap-2 mt-2">
          {othersInfo.map((o) => (
            <MatchBar
              key={o.player.id}
              label={o.player.name}
              level={o.level}
              highlight={o.ok}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MatchBar({
  label,
  level,
  big,
  highlight,
}: {
  label: string;
  level: number;
  big?: boolean;
  highlight?: boolean;
}) {
  // level is 0..1
  const pct = Math.min(100, Math.max(0, level * 100));
  return (
    <div className={`flex flex-col items-center ${big ? "w-full" : "flex-1"}`}>
      <div
        className={`relative w-full bg-bg-card rounded-2xl overflow-hidden ${
          big ? "h-10" : "h-20"
        }`}
      >
        <div
          className={`absolute bottom-0 left-0 ${
            big ? "top-0" : ""
          } ${
            highlight ? "bg-gradient-done" : "bg-gradient-party"
          } transition-all`}
          style={
            big
              ? { width: `${pct}%` }
              : { height: `${pct}%`, left: 0, right: 0 }
          }
        />
        <div className="absolute inset-0 flex items-center justify-center text-[10px] font-extrabold tracking-wider opacity-90">
          {Math.round(pct)}%
        </div>
      </div>
      <div className="mt-1 text-[11px] font-bold truncate max-w-full">
        {label}
      </div>
    </div>
  );
}
