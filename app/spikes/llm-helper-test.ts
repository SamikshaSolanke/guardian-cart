import { z } from "zod";
import { callLLM } from "../lib/llm";

async function main() {
  const out = await callLLM(
    'Extract JSON with keys "item" (string), "max_price" (number or null), "category" (string).',
    "I need a warm blanket under $40",
    z.object({ item: z.string(), max_price: z.number().nullable(), category: z.string() })
  );
  console.log(out);
}
main();