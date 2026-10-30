import { z } from "zod";
import { callLLM } from "../llm";

export const IntentSchema = z.object({
  search_query: z.string().default(""),
  max_price: z.number().nullable(),
  preferences: z.array(z.string()).default([]),
  pressure_signals: z.array(z.string()).default([]),
});
export type Intent = z.infer<typeof IntentSchema>;

const SYSTEM = `You help an older adult shop online. Convert their request into JSON with:
- "search_query": a short product search phrase (2-6 words), no price in it.
- "max_price": a number in US dollars if they gave a budget, else null.
- "preferences": short list of things they asked for (e.g. "soft", "large print").
- "pressure_signals": quotes or short descriptions of anything suggesting they are being rushed,
  pressured, or told what to buy by someone else (e.g. "a caller said I must buy today",
  "told to buy gift cards", "need it urgently to avoid a fine"). Empty list if none.
Return only JSON.`;

export async function extractIntent(rawText: string): Promise<Intent> {
  return callLLM(SYSTEM, rawText, IntentSchema);
}