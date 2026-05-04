"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error]", error);
  }, [error]);

  return (
    <html>
      <body
        style={{
          background: "#1a0d20",
          color: "#fff",
          fontFamily: "system-ui, sans-serif",
          minHeight: "100vh",
          padding: 24,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 56, marginBottom: 12 }}>🍕💥</div>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>
          The pizza burned.
        </h1>
        <p style={{ opacity: 0.7, marginBottom: 16, maxWidth: 320 }}>
          Something threw a client-side error. Send this message to Sam:
        </p>
        <pre
          style={{
            background: "#13081a",
            color: "#ffb",
            padding: 12,
            borderRadius: 12,
            maxWidth: 360,
            overflow: "auto",
            fontSize: 12,
            textAlign: "left",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {error.message || "(no message)"}
          {error.stack ? `\n\n${error.stack}` : ""}
          {error.digest ? `\n\ndigest: ${error.digest}` : ""}
        </pre>
        <button
          onClick={() => reset()}
          style={{
            marginTop: 16,
            padding: "10px 18px",
            background: "linear-gradient(135deg, #ff4d8d 0%, #ff8c42 100%)",
            color: "#fff",
            border: "none",
            borderRadius: 16,
            fontWeight: 700,
            fontSize: 14,
          }}
        >
          Try again →
        </button>
      </body>
    </html>
  );
}
