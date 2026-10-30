"use client";

import { useCallback, useEffect, useState } from "react";

type Pending = {
  requestId: number;
  rawText: string;
  createdAt: string;
  title: string;
  merchantDomain: string;
  priceCents: number;
  explanation: string;
  reasons: string[];
};

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

export default function CaregiverPage() {
  const [pending, setPending] = useState<Pending[]>([]);
  const [budget, setBudget] = useState<{ spentCents: number; monthlyBudgetCents: number } | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/caregiver/pending?parentId=1", { cache: "no-store" });
      const d = await r.json();
      setPending(d.pending ?? []);
      setBudget(d.budget ?? null);
    } catch {
      setError("Couldn't load requests.");
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
  }, [load]);

  async function decide(requestId: number, action: "approve" | "deny") {
    setBusyId(requestId);
    setError(null);
    try {
      const r = await fetch("/api/caregiver/decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, action }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Something went wrong.");
      await load();
    } catch (e: any) {
      setError(e.message);
      await load();
    } finally {
      setBusyId(null);
    }
  }

  const pct = budget ? Math.min(100, Math.round((budget.spentCents / budget.monthlyBudgetCents) * 100)) : 0;

  return (
    <div className="min-h-screen w-full bg-gray-50">
      <main className="mx-auto max-w-2xl px-5 py-8 text-gray-900">
        <h1 className="text-3xl font-bold">Hi Alex, Margaret needs your OK</h1>

        {budget && (
          <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-lg">
              This month: <b>{usd(budget.spentCents)}</b> of {usd(budget.monthlyBudgetCents)}
            </p>
            <div className="mt-2 h-3 w-full rounded-full bg-gray-200">
              <div className="h-3 rounded-full bg-blue-600" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}

        {error && <p className="mt-4 text-lg text-red-700">{error}</p>}

        {pending.length === 0 && (
          <p className="mt-8 text-xl text-gray-600">Nothing is waiting for you right now. 🎉</p>
        )}

        <ul className="mt-6 space-y-4">
          {pending.map((p) => (
            <li key={p.requestId} className="rounded-2xl border-2 border-amber-500 bg-white p-5">
              <p className="text-lg text-gray-600">Margaret asked: “{p.rawText}”</p>
              <h2 className="mt-2 text-2xl font-semibold">{p.title}</h2>
              <p className="text-lg text-gray-600">{p.merchantDomain}</p>
              <p className="mt-1 text-3xl font-bold">{usd(p.priceCents)}</p>

              <p className="mt-3 text-lg font-semibold text-amber-800">Why it needs your OK</p>
              <ul className="list-disc pl-6 text-lg text-gray-800">
                {p.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>

              <div className="mt-4 flex gap-3">
                <button
                  onClick={() => decide(p.requestId, "approve")}
                  disabled={busyId === p.requestId}
                  className="flex-1 rounded-xl bg-green-700 px-4 py-3 text-xl font-semibold text-white disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  onClick={() => decide(p.requestId, "deny")}
                  disabled={busyId === p.requestId}
                  className="flex-1 rounded-xl bg-red-700 px-4 py-3 text-xl font-semibold text-white disabled:opacity-50"
                >
                  Deny
                </button>
              </div>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}