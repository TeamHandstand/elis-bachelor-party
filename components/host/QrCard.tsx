"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";

interface Props {
  code: string;
  /** Override base URL. Defaults to NEXT_PUBLIC_APP_URL or window.location.origin. */
  baseUrl?: string;
}

export default function QrCard({ code, baseUrl }: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const resolvedBase =
    baseUrl ??
    process.env.NEXT_PUBLIC_APP_URL ??
    (typeof window !== "undefined" ? window.location.origin : "");
  const joinUrl = `${resolvedBase}/e/${code}`;

  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(joinUrl, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 512,
      color: { dark: "#1a0d20", light: "#ffffff" },
    })
      .then((url) => {
        if (alive) setDataUrl(url);
      })
      .catch(() => {
        if (alive) setDataUrl(null);
      });
    return () => {
      alive = false;
    };
  }, [joinUrl]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="bg-bg-card rounded-xl2 p-6 flex flex-col items-center text-center">
      <h2 className="font-display text-xl font-bold mb-1">📱 Scan to join</h2>
      <p className="opacity-60 text-xs mb-4 break-all">{joinUrl}</p>

      <div className="bg-white p-3 rounded-2xl shadow-xl">
        {dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={dataUrl}
            alt={`QR code for ${joinUrl}`}
            className="w-64 h-64 block"
          />
        ) : (
          <div className="w-64 h-64 grid place-items-center text-gray-500 text-sm">
            Generating…
          </div>
        )}
      </div>

      <div className="mt-5">
        <div className="text-xs uppercase tracking-widest opacity-50">
          Event code
        </div>
        <div className="font-display text-5xl font-extrabold tracking-[0.25em] mt-1 bg-gradient-party bg-clip-text text-transparent">
          {code}
        </div>
      </div>

      <button
        onClick={copy}
        className="mt-4 px-4 py-2 rounded-xl border border-white/10 text-sm hover:bg-white/5"
      >
        {copied ? "✅ Copied!" : "📋 Copy URL"}
      </button>
    </div>
  );
}
