import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <div className="text-6xl mb-4">🍕</div>
      <h1 className="font-display text-4xl font-extrabold tracking-wider mb-2">TOASTY PIZZA</h1>
      <p className="opacity-70 mb-8 max-w-xs">Bachelor party team race. Players join via QR code. Hosts spin up events from the host panel.</p>
      <Link
        href="/host"
        className="px-6 py-3 rounded-2xl bg-gradient-party font-bold text-white"
      >
        Host panel →
      </Link>
    </main>
  );
}
