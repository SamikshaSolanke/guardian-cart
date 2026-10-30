"use client";

import { useEffect, useState } from "react";

type Result = {
  requestId: number;
  status: "blocked" | "needs_approval" | "ready_to_pay" | "no_results" | "approved" | "denied";
  message: string;
  recommendation: null | {
    title: string;
    brand: string | null;
    imageUrl: string | null;
    merchantDomain: string;
    priceCents: number;
    explanation: string;
  };
  alternatives: { productId: string; title: string; priceCents: number; merchantDomain: string }[];
  decision: { verdict: string; reasons: string[] };
};

type Banner = { kind: "success" | "info" | "error"; text: string } | null;

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

const STYLES = {
  ready_to_pay: { box: "border-green-600 bg-green-50", label: "Good to go", text: "text-green-800" },
  needs_approval: { box: "border-amber-500 bg-amber-50", label: "Waiting for approval", text: "text-amber-800" },
  blocked: { box: "border-red-600 bg-red-50", label: "Stopped for your safety", text: "text-red-800" },
  no_results: { box: "border-gray-400 bg-gray-50", label: "Let's try again", text: "text-gray-800" },
  approved: { box: "border-green-600 bg-green-50", label: "Approved", text: "text-green-800" },
  denied: { box: "border-gray-500 bg-gray-50", label: "Not approved", text: "text-gray-800" },
} as const;

const BANNER_STYLES = {
  success: "border-green-600 bg-green-50 text-green-900",
  info: "border-blue-500 bg-blue-50 text-blue-900",
  error: "border-red-600 bg-red-50 text-red-900",
} as const;

const EXAMPLES = [
  "I need a warm blanket under $40",
  "I need reading glasses",
  "I'd like a kitchen knife set",
];

export default function ParentPage() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [paying, setPaying] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<Banner>(null);

  // Handle the redirect back from PayPal (?paid=ID, ?cancelled=ID, ?error=...)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const paid = q.get("paid");
    const cancelled = q.get("cancelled");
    const err = q.get("error");
    if (!paid && !cancelled && !err) return;
    window.history.replaceState({}, "", "/");

    if (paid) {
      fetch(`/api/status?requestId=${paid}`)
        .then((r) => r.json())
        .then((d) =>
          setBanner({
            kind: "success",
            text: d.title
              ? `Payment complete! You bought ${d.title} for ${usd(d.priceCents)}.`
              : "Payment complete!",
          })
        )
        .catch(() => setBanner({ kind: "success", text: "Payment complete!" }));
    } else if (cancelled) {
      setBanner({ kind: "info", text: "No problem, you didn't pay. Nothing was charged." });
    } else {
      setBanner({ kind: "error", text: "The payment didn't go through. Nothing was charged. Please try again." });
    }
  }, []);

  // While waiting for the caregiver, check for their decision every 3 seconds.
  useEffect(() => {
    if (!result || result.status !== "needs_approval") return;
    const id = setInterval(async () => {
      try {
        const r = await fetch(`/api/status?requestId=${result.requestId}`, { cache: "no-store" });
        const d = await r.json();
        if (d.status === "approved") {
          setResult((p) => p && { ...p, status: "approved", message: "Good news! Alex said yes. You can pay now." });
        } else if (d.status === "denied") {
          setResult((p) => p && { ...p, status: "denied", message: "Alex wasn't able to approve this one. You can ask for something else." });
        }
      } catch {}
    }, 3000);
    return () => clearInterval(id);
  }, [result]);

  async function submit(value: string) {
    if (value.trim().length < 3) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setBanner(null);
    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      setResult(data);
    } catch (e: any) {
      setError(e.message ?? "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function pay(requestId: number) {
    setPaying(true);
    setError(null);
    try {
      const res = await fetch("/api/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't start the payment.");
      window.location.href = data.approveUrl; // off to PayPal
    } catch (e: any) {
      setError(e.message ?? "Couldn't start the payment.");
      setPaying(false);
    }
  }

  const s = result ? STYLES[result.status] : null;

  return (
    <div className="min-h-screen w-full bg-white">
      <main className="mx-auto max-w-2xl px-5 py-8 text-gray-900">
        <h1 className="text-4xl font-bold">Hello, Margaret</h1>
        <p className="mt-2 text-xl text-gray-600">What would you like to buy today?</p>

        {banner && (
          <p className={`mt-6 rounded-xl border-2 p-4 text-xl ${BANNER_STYLES[banner.kind]}`}>{banner.text}</p>
        )}

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="For example: I need a warm blanket under $40"
          rows={3}
          className="mt-6 w-full rounded-xl border-2 border-gray-300 bg-white p-4 text-xl text-gray-900 focus:border-blue-600 focus:outline-none"
        />

        <button
          onClick={() => submit(text)}
          disabled={loading || text.trim().length < 3}
          className="mt-3 w-full rounded-xl bg-blue-700 px-6 py-4 text-2xl font-semibold text-white disabled:opacity-50"
        >
          {loading ? "Looking for you..." : "Find it for me"}
        </button>

        <div className="mt-4 flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => {
                setText(ex);
                submit(ex);
              }}
              className="rounded-full border border-gray-300 px-4 py-2 text-lg text-gray-700 hover:bg-gray-100"
            >
              {ex}
            </button>
          ))}
        </div>

        {error && <p className="mt-6 text-xl text-red-700">{error}</p>}

        {result && s && (
          <section className={`mt-8 rounded-2xl border-2 p-5 ${s.box}`}>
            <p className={`text-lg font-semibold uppercase tracking-wide ${s.text}`}>{s.label}</p>
            <p className="mt-2 text-2xl">{result.message}</p>

            {result.recommendation && (
              <div className="mt-5 flex gap-4 rounded-xl bg-white p-4">
                {result.recommendation.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={result.recommendation.imageUrl}
                    alt={result.recommendation.title}
                    className="h-28 w-28 shrink-0 rounded-lg object-cover"
                  />
                )}
                <div>
                  <h2 className="text-2xl font-semibold">{result.recommendation.title}</h2>
                  <p className="text-lg text-gray-600">
                    {result.recommendation.brand ? `${result.recommendation.brand} · ` : ""}
                    {result.recommendation.merchantDomain}
                  </p>
                  <p className="mt-1 text-3xl font-bold">{usd(result.recommendation.priceCents)}</p>
                </div>
              </div>
            )}

            {result.recommendation && (
              <p className="mt-4 text-xl text-gray-800">{result.recommendation.explanation}</p>
            )}

            {(result.status === "needs_approval" || result.status === "blocked" || result.status === "denied") &&
              result.decision.reasons.length > 0 && (
                <ul className="mt-4 list-disc pl-6 text-lg text-gray-800">
                  {result.decision.reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              )}

            {(result.status === "ready_to_pay" || result.status === "approved") && (
              <button
                onClick={() => pay(result.requestId)}
                disabled={paying}
                className="mt-5 w-full rounded-xl bg-yellow-400 px-6 py-4 text-2xl font-semibold text-gray-900 disabled:opacity-60"
              >
                {paying ? "Taking you to PayPal..." : "Pay with PayPal"}
              </button>
            )}

            {result.alternatives.length > 0 && result.status !== "blocked" && (
              <div className="mt-5">
                <p className="text-lg font-semibold text-gray-700">Other choices</p>
                <ul className="mt-1 text-lg text-gray-700">
                  {result.alternatives.map((a) => (
                    <li key={a.productId}>
                      {a.title} · {usd(a.priceCents)} · {a.merchantDomain}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}