import { db, seedIfEmpty } from "../db";
import { extractIntent, type Intent } from "./intent";
import { rankCandidates } from "./rank";
import { searchProducts, type Candidate } from "../channel3";
import { evaluatePolicy, screenRequest, isTrustedMerchant, RAPID_WINDOW_MINUTES, REPEAT_WINDOW_DAYS, type PolicyDecision, type AlertType } from "../policy";
import { getRules, getSpentThisMonthCents, getRecentRequestCount, hasBoughtFromMerchant, boughtProductRecently } from "../policy/queries";
import { assessRisk } from "./risk";

export type PipelineStatus = "blocked" | "needs_approval" | "ready_to_pay" | "no_results";

export type PipelineResult = {
  requestId: number;
  status: PipelineStatus;
  message: string; // what the parent sees
  intent: Intent;
  recommendation: null | {
    productId: string;
    title: string;
    brand: string | null;
    imageUrl: string | null;
    merchantDomain: string;
    priceCents: number;
    currency: string;
    offerUrl: string;
    explanation: string;
  };
  alternatives: { productId: string; title: string; priceCents: number; merchantDomain: string }[];
  decision: { verdict: PolicyDecision["verdict"]; reasons: string[] };
};

function saveDecision(requestId: number, d: PolicyDecision) {
  db.prepare(
    "INSERT INTO policy_decisions (request_id, verdict, reasons, rule_checks) VALUES (?,?,?,?)"
  ).run(requestId, d.verdict, JSON.stringify(d.reasons), JSON.stringify(d.checks));
}

function saveAlerts(parentId: number, types: AlertType[], evidence: unknown) {
  const stmt = db.prepare("INSERT INTO alerts (parent_id, type, evidence) VALUES (?,?,?)");
  for (const t of types) stmt.run(parentId, t, JSON.stringify(evidence));
}

function setStatus(requestId: number, status: string) {
  db.prepare("UPDATE requests SET status = ? WHERE id = ?").run(status, requestId);
}

export async function processRequest(parentId: number, rawText: string): Promise<PipelineResult> {
  seedIfEmpty();

  const people = db
    .prepare(
      `SELECT p.name AS parent_name, c.name AS caregiver_name
       FROM parents p JOIN caregivers c ON c.id = p.caregiver_id WHERE p.id = ?`
    )
    .get(parentId) as { parent_name: string; caregiver_name: string } | undefined;
  if (!people) throw new Error(`Unknown parent ${parentId}`);

  const requestId = Number(
    db.prepare("INSERT INTO requests (parent_id, raw_text) VALUES (?, ?)").run(parentId, rawText)
      .lastInsertRowid
  );

    const blockedResult = (d: PolicyDecision, intent: Intent): PipelineResult => {
    saveDecision(requestId, d);
    saveAlerts(parentId, d.alertTypes, {
      request: rawText,
      pressure_signals: intent.pressure_signals,
      reasons: d.reasons,
    });
    setStatus(requestId, "blocked");
    return {
      requestId,
      intent,
      recommendation: null,
      alternatives: [],
      status: "blocked",
      message: `I can't help with that one. Requests like this are often scams, so I've let ${people.caregiver_name} know. Please check with them first.`,
      decision: { verdict: "BLOCK", reasons: d.reasons },
    };
  };

  const emptyIntent: Intent = { search_query: "", max_price: null, preferences: [], pressure_signals: [] };

  // 0. Rule-based screen on the raw text. No LLM involved, so it can't be skipped by an LLM failure.
  const preScreen = screenRequest(rawText, "", []);
  if (preScreen) return blockedResult(preScreen, emptyIntent);

  // 1. Understand the request. If the LLM fails, ask the parent to rephrase.
  let intent: Intent;
  try {
    intent = await extractIntent(rawText);
  } catch (e) {
    console.error("Intent extraction failed:", e);
    setStatus(requestId, "no_results");
    return {
      requestId,
      intent: emptyIntent,
      recommendation: null,
      alternatives: [],
      status: "no_results",
      message: "Sorry, I didn't quite understand. Could you say what you'd like to buy in a different way?",
      decision: { verdict: "ALLOW", reasons: [] },
    };
  }
  db.prepare("UPDATE requests SET parsed_intent = ? WHERE id = ?").run(JSON.stringify(intent), requestId);

  const base = { requestId, intent, recommendation: null, alternatives: [] };

  // 1b. Screen again using what the LLM understood (pressure signals, gift cards in the query).
  const early = screenRequest(rawText, intent.search_query, intent.pressure_signals);
  if (early) return blockedResult(early, intent);

    if (!intent.search_query.trim()) {
    setStatus(requestId, "no_results");
    return {
      ...base,
      status: "no_results",
      message: "I didn't catch what you'd like to buy. Could you tell me the item?",
      decision: { verdict: "ALLOW", reasons: [] },
    };
  }

  // 2. Search and rank.
  const candidates = await searchProducts(intent.search_query, 8);
  const ranked = await rankCandidates(rawText, intent, candidates);
  if (!ranked) {
    setStatus(requestId, "no_results");
    return {
      ...base,
      status: "no_results",
      message: "I couldn't find a good match. Could you try describing it a different way?",
      decision: { verdict: "ALLOW", reasons: [] },
    };
  }

    // 3. Gather extra signals, then let the policy engine decide. The LLM can only add caution.
  const top: Candidate = ranked.top;
  const otherOffers = top.allOffers.slice(1).map((o) => o.priceCents);

  const llmRisk = await assessRisk({
    request: rawText,
    pressure_signals: intent.pressure_signals,
    product: top.title,
    merchant: top.merchantDomain,
    price_usd: top.priceCents / 100,
    category: top.categoryTitle,
    other_store_prices_usd: otherOffers.map((c) => c / 100),
  });

  const decision = evaluatePolicy(
    {
      priceCents: top.priceCents,
      currency: top.currency,
      merchantDomain: top.merchantDomain,
      title: top.title,
      topCategorySlug: top.topCategorySlug,
      categoryPath: top.categoryPath,
      spentThisMonthCents: getSpentThisMonthCents(parentId),
      scamSignals: intent.pressure_signals,
      otherOfferPricesCents: otherOffers,
      merchantIsFamiliar:
        isTrustedMerchant(top.merchantDomain) || hasBoughtFromMerchant(parentId, top.merchantDomain),
      boughtSameProductRecently: boughtProductRecently(parentId, top.productId, REPEAT_WINDOW_DAYS),
      recentRequestCount: getRecentRequestCount(parentId, RAPID_WINDOW_MINUTES),
      llmRisk,
    },
    getRules(parentId)
  );

  // 4. Persist.
  db.prepare(
    `INSERT INTO recommendations
       (request_id, product_id, title, merchant_domain, price_cents, currency, offer_url, explanation)
     VALUES (?,?,?,?,?,?,?,?)`
  ).run(requestId, top.productId, top.title, top.merchantDomain, top.priceCents, top.currency, top.offerUrl, ranked.explanation);
  saveDecision(requestId, decision);

  // Any flagged signal becomes an alert for the caregiver, whatever the verdict.
  if (decision.alertTypes.length > 0) {
    saveAlerts(parentId, decision.alertTypes, {
      request: rawText,
      product: top.title,
      merchant: top.merchantDomain,
      price_cents: top.priceCents,
      verdict: decision.verdict,
      reasons: decision.reasons,
    });
  }

  let status: PipelineStatus;
  let message: string;
  if (decision.verdict === "BLOCK") {
    status = "blocked";
    message = `I can't buy this one. ${decision.reasons[0]} I've let ${people.caregiver_name} know.`;
  } else if (decision.verdict === "NEEDS_APPROVAL") {
    status = "needs_approval";
    message = `This one needs ${people.caregiver_name}'s OK first. I've asked them, and you'll be able to pay once they say yes.`;
  } else {
    status = "ready_to_pay";
    message = "This is within your limits. You can go ahead and pay when you're ready.";
  }
  setStatus(requestId, status);

  return {
    ...base,
    status,
    message,
    recommendation: {
      productId: top.productId,
      title: top.title,
      brand: top.brand,
      imageUrl: top.imageUrl,
      merchantDomain: top.merchantDomain,
      priceCents: top.priceCents,
      currency: top.currency,
      offerUrl: top.offerUrl,
      explanation: ranked.explanation,
    },
    alternatives: ranked.alternatives.map((a) => ({
      productId: a.productId,
      title: a.title,
      priceCents: a.priceCents,
      merchantDomain: a.merchantDomain,
    })),
    decision: { verdict: decision.verdict, reasons: decision.reasons },
  };
}