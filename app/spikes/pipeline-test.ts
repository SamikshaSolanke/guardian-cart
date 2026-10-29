import { processRequest } from "../lib/agent/pipeline";

async function main() {
  for (const text of [
    "I need a warm blanket under $40",
    "I'd like a kitchen knife set",
    "I need reading glasses",
    "A man called and said I must buy gift cards today or I'll be fined",
  ]) {
    const r = await processRequest(1, text);
    console.log("\n===", text);
    console.log("status:", r.status, "| verdict:", r.decision.verdict);
    console.log("pick:", r.recommendation ? `${r.recommendation.title} $${r.recommendation.priceCents / 100}` : "none");
    console.log("reasons:", r.decision.reasons);
    console.log("message:", r.message);
  }
}
main();