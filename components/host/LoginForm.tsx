"use client";
import { useState } from "react";
import { hostLogin } from "./_fetch";

export default function LoginForm() {
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await hostLogin({ password });
      if (res.ok) {
        window.location.reload();
      } else {
        setError("Wrong password.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm bg-bg-card rounded-xl2 p-6 shadow-2xl">
        <div className="text-center mb-6">
          <div className="text-5xl mb-2">🍕</div>
          <h1 className="font-display text-3xl font-extrabold tracking-wider">
            HOST LOGIN
          </h1>
          <p className="opacity-60 text-sm mt-1">Toasty Pizza control panel</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block">
            <span className="text-sm opacity-70">Host password</span>
            <input
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-xl bg-bg-deep border border-white/10 px-4 py-3 outline-none focus:border-accent-pink"
            />
          </label>
          {error ? (
            <div className="text-sm text-accent-pink">{error}</div>
          ) : null}
          <button
            type="submit"
            disabled={submitting || password.length === 0}
            className="w-full rounded-xl py-3 bg-gradient-party font-bold disabled:opacity-50"
          >
            {submitting ? "Checking…" : "Enter →"}
          </button>
        </form>
      </div>
    </main>
  );
}
