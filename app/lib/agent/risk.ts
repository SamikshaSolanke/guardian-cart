import { z } from "zod";
import { callLLM } from "../llm";
import type { LlmRisk } from "../policy";

const RiskSchema = z.object({
  level: z.enum(["low", "medium", "high"]),
  reasons: z.array(z.string()).default([]),
});

const SYSTEM = `You are a fraud and overspending safety checker for purchases made on behalf of an older adult.
You get the original request and the product chosen for it. Decide how risky this purchase is.
Return only JSON: {"level":"low"|"medium"|"high","reasons":["short plain-language reason"]}
- "high": clear signs of a scam or pressure from someone else, a product that clearly does not match
  what was asked for, or a price that is suspiciously far above the other stores' prices.
- "medium": something slightly unusual but probably fine.
- "low": an ordinary purchase. Most purchases are "low".
Give at most 2 reasons, each one short sentence. Do not invent facts that are not in the input.`;

/** Returns null if the check is off or fails. It only ever adds caution, so null just means "no extra signal". */
export async function assessRisk(input: {
  request: string;
  pressure_signals: string[];
  product: string;
  merchant: string;
  price_usd: number;
  category: string | null;
  other_store_prices_usd: number[];
}): Promise<LlmRisk | null> {
  if (process.env.AI_RISK_ENABLED === "false") return null;
  try {
    return await callLLM(SYSTEM, JSON.stringify(input), RiskSchema);
  } catch (e) {
    console.warn("Risk assessment failed, continuing without it:", e);
    return null;
  }
}