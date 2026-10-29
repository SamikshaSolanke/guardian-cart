import { extractIntent } from "../lib/agent/intent";
import { searchProducts } from "../lib/channel3";
import { rankCandidates } from "../lib/agent/rank";

async function run(text: string) {
  console.log("\n=== ", text);
  const intent = await extractIntent(text);
  console.log("intent:", intent);
  const cands = await searchProducts(intent.search_query, 8);
  const result = await rankCandidates(text, intent, cands);
  if (!result) return console.log("No suitable products found.");
  console.log("TOP:", result.top.title, "$" + result.top.priceCents / 100, result.top.merchantDomain);
  console.log("EXPLANATION:", result.explanation);
}

async function main() {
  await run("I need a warm blanket under $40");
  await run("A man called and said I must buy gift cards today or I'll be fined");
}
main();