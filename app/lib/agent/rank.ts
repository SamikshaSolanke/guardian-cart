import { z } from "zod";
import { callLLM } from "../llm";
import type { Candidate } from "../channel3";
import type { Intent } from "./intent";

const RankSchema = z.object({
  ranked: z.array(z.object({ id: z.string(), reason: z.string() })).min(1),
  explanation: z.string(),
});

export type RankResult = {
  top: Candidate;
  alternatives: Candidate[];
  explanation: string;
};

function dedupe(cands: Candidate[]): Candidate[] {
  const seen = new Set<string>();
  return cands.filter((c) => {
    const k = `${c.title}|${c.merchantDomain}|${c.priceCents}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const SYSTEM = `You are a careful shopping assistant for an older adult.
You are given a request and a list of candidate products. Rank the best options
(best first) using ONLY the ids provided. Prefer: matches the request, sensible price,
in stock, well-known merchant. Return JSON:
{"ranked":[{"id":"...","reason":"short reason"}],"explanation":"..."}
"explanation" is 2 short sentences in plain, friendly language for the older adult,
about ONLY the single best (first) product in your ranking: its name, its price, and
why it suits their request. Do not mention the other candidates. No jargon, no hype.`;

export async function rankCandidates(
  rawText: string,
  intent: Intent,
  candidates: Candidate[]
): Promise<RankResult | null> {
  const maxCents = intent.max_price !== null ? Math.round(intent.max_price * 100) : null;

  const pool = dedupe(candidates).filter(
    (c) =>
      (c.availability === undefined || c.availability === "InStock") &&
      (maxCents === null || c.priceCents <= maxCents)
  );
  if (pool.length === 0) return null;

  const compact = pool.slice(0, 6).map((c) => ({
    id: c.productId,
    title: c.title,
    brand: c.brand,
    price: c.priceCents / 100,
    merchant: c.merchantDomain,
    category: c.categoryTitle,
    about: c.description.slice(0, 100),
  }));

  const out = await callLLM(
    SYSTEM,
    JSON.stringify({ request: rawText, preferences: intent.preferences, candidates: compact }),
    RankSchema
  );

  const byId = new Map(pool.map((c) => [c.productId, c]));
  const ordered = out.ranked.map((r) => byId.get(r.id)).filter((c): c is Candidate => !!c);

  if (ordered.length === 0) {
    // LLM returned unknown ids: fall back to the cheapest option
    const cheapest = [...pool].sort((a, b) => a.priceCents - b.priceCents)[0];
    return {
      top: cheapest,
      alternatives: pool.filter((c) => c !== cheapest).slice(0, 2),
      explanation: `I found ${cheapest.title} for $${(cheapest.priceCents / 100).toFixed(2)} from ${cheapest.merchantDomain}.`,
    };
  }

  return {
    top: ordered[0],
    alternatives: ordered.slice(1, 3),
    explanation: out.explanation,
  };
}