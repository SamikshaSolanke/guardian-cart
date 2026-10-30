"use client";

import { useCallback, useEffect, useState } from "react";

type Pending = {
  requestId: number;
  rawText: string;
  title: string;
  merchantDomain: string;
  priceCents: number;
  reasons: string[];
};
type Activity = {
  requestId: number;
  rawText: string;
  status: string;
  createdAt: string;
  title: string | null;
  priceCents: number | null;
  merchantDomain: string | null;
  reasons: string[];
};
type AlertRow = {
  id: number;
  type: string;
  createdAt: string;
  resolved: boolean;
  evidence: {
    request?: string;
    product?: string;
    merchant?: string;
    price_cents?: number;
    reasons?: string[];
    pressure_signals?: string[];
  } | null;
};
type RulesForm = {
  monthlyBudget: string;
  perPurchaseLimit: string;
  approvalThreshold: string;
  allowedCategories: string[];
  blockedMerchants: string;
};

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
const when = (s: string) => new Date(s.replace(" ", "T") + "Z").toLocaleString();

const ALERT_LABELS: Record<string, string> = {
  SCAM_SUSPECTED: "Possible scam",
  OVER_BUDGET: "Over the purchase limit",
  BLOCKED_MERCHANT: "Blocked store",
  PRICE_ANOMALY: "Unusually high price",
  UNFAMILIAR_MERCHANT: "Unfamiliar store",
  REPEAT_PURCHASE: "Repeat purchase",
  RAPID_REQUESTS: "Many requests quickly",
  AI_RISK: "AI safety check",
};

const STATUS_LABELS: Record<string, { text: string; cls: string }> = {
  paid: { text: "Paid", cls: "bg-green-100 text-green-800" },
  ready_to_pay: { text: "Ready to pay", cls: "bg-green-100 text-green-800" },
  approved: { text: "Approved", cls: "bg-green-100 text-green-800" },
  needs_approval: { text: "Needs your OK", cls: "bg-amber-100 text-amber-800" },
  blocked: { text: "Blocked", cls: "bg-red-100 text-red-800" },
  denied: { text: "Denied", cls: "bg-gray-200 text-gray-800" },
  no_results: { text: "No match", cls: "bg-gray-100 text-gray-700" },
  new: { text: "In progress", cls: "bg-gray-100 text-gray-700" },
};

// Channel3's top-level category slugs we've seen. Edit this list as you find more.
const CATEGORY_OPTIONS = [
  { slug: "home-garden", label: "Home & Garden" },
  { slug: "health-beauty", label: "Health & Beauty" },
  { slug: "media", label: "Books & Media" },
  { slug: "apparel-accessories", label: "Clothing & Accessories" },
  { slug: "arts-entertainment", label: "Arts & Entertainment (includes gift cards)" },
];

export default function CaregiverPage() {
  const [pending, setPending] = useState<Pending[]>([]);
  const [budget, setBudget] = useState<{ spentCents: number; monthlyBudgetCents: number } | null>(null);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<RulesForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [p, o] = await Promise.all([
        fetch("/api/caregiver/pending?parentId=1", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/caregiver/overview?parentId=1", { cache: "no-store" }).then((r) => r.json()),
      ]);
      setPending(p.pending ?? []);
      setBudget(p.budget ?? null);
      setActivity(o.activity ?? []);
      setAlerts(o.alerts ?? []);
    } catch {
      setError("Couldn't load the latest information.");
    }
  }, []);

  // Rules are loaded once so polling never overwrites what you are typing.
  useEffect(() => {
    fetch("/api/caregiver/rules?parentId=1", { cache: "no-store" })
      .then((r) => r.json())
      .then((r) =>
        setForm({
          monthlyBudget: String(r.monthlyBudget),
          perPurchaseLimit: String(r.perPurchaseLimit),
          approvalThreshold: String(r.approvalThreshold),
          allowedCategories: r.allowedCategories,
          blockedMerchants: (r.blockedMerchants as string[]).join(", "),
        })
      )
      .catch(() => setError("Couldn't load the rules."));
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
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusyId(null);
      await load();
    }
  }

  async function resolveAlert(alertId: number) {
    await fetch("/api/caregiver/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alertId }),
    });
    await load();
  }

  async function saveRules() {
    if (!form) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const r = await fetch("/api/caregiver/rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentId: 1,
          monthlyBudget: Number(form.monthlyBudget),
          perPurchaseLimit: Number(form.perPurchaseLimit),
          approvalThreshold: Number(form.approvalThreshold),
          allowedCategories: form.allowedCategories,
          blockedMerchants: form.blockedMerchants
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Couldn't save.");
      setSaveMsg({ ok: true, text: "Rules saved. They apply to the next request." });
      await load();
    } catch (e: any) {
      setSaveMsg({ ok: false, text: e.message });
    } finally {
      setSaving(false);
    }
  }

  const pct = budget ? Math.min(100, Math.round((budget.spentCents / budget.monthlyBudgetCents) * 100)) : 0;
  const openAlerts = alerts.filter((a) => !a.resolved);
  const input = "mt-1 w-full rounded-lg border-2 border-gray-300 bg-white p-2 text-lg text-gray-900";

  return (
    <div className="min-h-screen w-full bg-gray-50">
      <main className="mx-auto max-w-3xl space-y-8 px-5 py-8 text-gray-900">
        <header>
          <h1 className="text-3xl font-bold">Hi Alex 👋</h1>
          <p className="mt-1 text-lg text-gray-600">Here's what Margaret has been shopping for.</p>
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
          {error && <p className="mt-3 text-lg text-red-700">{error}</p>}
        </header>

        {/* Waiting for approval */}
        <section>
          <h2 className="text-2xl font-bold">Waiting for your OK ({pending.length})</h2>
          {pending.length === 0 && <p className="mt-2 text-lg text-gray-600">Nothing is waiting for you right now. 🎉</p>}
          <ul className="mt-3 space-y-4">
            {pending.map((p) => (
              <li key={p.requestId} className="rounded-2xl border-2 border-amber-500 bg-white p-5">
                <p className="text-lg text-gray-600">Margaret asked: “{p.rawText}”</p>
                <h3 className="mt-2 text-2xl font-semibold">{p.title}</h3>
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
        </section>

        {/* Alerts */}
        <section>
          <h2 className="text-2xl font-bold">Alerts ({openAlerts.length} open)</h2>
          {alerts.length === 0 && <p className="mt-2 text-lg text-gray-600">No alerts. All quiet.</p>}
          <ul className="mt-3 space-y-3">
            {alerts.map((a) => (
              <li
                key={a.id}
                className={`rounded-xl border-2 p-4 ${a.resolved ? "border-gray-200 bg-gray-100 opacity-70" : "border-red-500 bg-white"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold">
                      {ALERT_LABELS[a.type] ?? a.type}
                      {a.resolved && <span className="ml-2 text-base font-normal text-gray-600">(resolved)</span>}
                    </p>
                    <p className="text-base text-gray-600">{when(a.createdAt)}</p>
                  </div>
                  {!a.resolved && (
                    <button
                      onClick={() => resolveAlert(a.id)}
                      className="shrink-0 rounded-lg border-2 border-gray-400 px-3 py-1 text-lg"
                    >
                      Mark as handled
                    </button>
                  )}
                </div>
                {a.evidence && (
                  <div className="mt-2 text-lg text-gray-800">
                    {a.evidence.request && <p>Margaret said: “{a.evidence.request}”</p>}
                    {a.evidence.product && (
                      <p>
                        Item: {a.evidence.product}
                        {a.evidence.merchant ? ` · ${a.evidence.merchant}` : ""}
                        {typeof a.evidence.price_cents === "number" ? ` · ${usd(a.evidence.price_cents)}` : ""}
                      </p>
                    )}
                    {a.evidence.reasons && a.evidence.reasons.length > 0 && (
                      <ul className="mt-1 list-disc pl-6">
                        {a.evidence.reasons.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>

        {/* Activity */}
        <section>
          <h2 className="text-2xl font-bold">Recent activity</h2>
          {activity.length === 0 && <p className="mt-2 text-lg text-gray-600">No requests yet.</p>}
          <ul className="mt-3 divide-y divide-gray-200 rounded-xl border border-gray-200 bg-white">
            {activity.map((a) => {
              const st = STATUS_LABELS[a.status] ?? STATUS_LABELS.new;
              return (
                <li key={a.requestId} className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-lg font-medium">“{a.rawText}”</p>
                    <span className={`shrink-0 rounded-full px-3 py-1 text-base font-semibold ${st.cls}`}>{st.text}</span>
                  </div>
                  <p className="text-base text-gray-600">
                    {a.title ? `${a.title} · ${a.priceCents !== null ? usd(a.priceCents) : ""} · ${a.merchantDomain}` : "No product chosen"}
                    {" · "}
                    {when(a.createdAt)}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Rules */}
        <section>
          <h2 className="text-2xl font-bold">Spending rules</h2>
          {!form && <p className="mt-2 text-lg text-gray-600">Loading…</p>}
          {form && (
            <div className="mt-3 space-y-4 rounded-xl border border-gray-200 bg-white p-5">
              <div className="grid gap-4 sm:grid-cols-3">
                <label className="text-lg">
                  Monthly budget ($)
                  <input
                    className={input}
                    type="number"
                    min="0"
                    value={form.monthlyBudget}
                    onChange={(e) => setForm({ ...form, monthlyBudget: e.target.value })}
                  />
                </label>
                <label className="text-lg">
                  Most for one purchase ($)
                  <input
                    className={input}
                    type="number"
                    min="0"
                    value={form.perPurchaseLimit}
                    onChange={(e) => setForm({ ...form, perPurchaseLimit: e.target.value })}
                  />
                </label>
                <label className="text-lg">
                  Ask me above ($)
                  <input
                    className={input}
                    type="number"
                    min="0"
                    value={form.approvalThreshold}
                    onChange={(e) => setForm({ ...form, approvalThreshold: e.target.value })}
                  />
                </label>
              </div>

              <div>
                <p className="text-lg">Categories Margaret can buy without asking</p>
                <div className="mt-1 grid gap-1 sm:grid-cols-2">
                  {CATEGORY_OPTIONS.map((c) => (
                    <label key={c.slug} className="flex items-center gap-2 text-lg">
                      <input
                        type="checkbox"
                        className="h-5 w-5"
                        checked={form.allowedCategories.includes(c.slug)}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            allowedCategories: e.target.checked
                              ? [...form.allowedCategories, c.slug]
                              : form.allowedCategories.filter((s) => s !== c.slug),
                          })
                        }
                      />
                      {c.label}
                    </label>
                  ))}
                </div>
              </div>

              <label className="block text-lg">
                Blocked stores (separate with commas)
                <input
                  className={input}
                  placeholder="example.com, anothershop.com"
                  value={form.blockedMerchants}
                  onChange={(e) => setForm({ ...form, blockedMerchants: e.target.value })}
                />
              </label>

              <button
                onClick={saveRules}
                disabled={saving}
                className="rounded-xl bg-blue-700 px-6 py-3 text-xl font-semibold text-white disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save rules"}
              </button>
              {saveMsg && (
                <p className={`text-lg ${saveMsg.ok ? "text-green-800" : "text-red-700"}`}>{saveMsg.text}</p>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}