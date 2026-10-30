import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluatePolicy, isTrustedMerchant, type PolicyInput, type Rules } from "./index";

const rules: Rules = {
  monthlyBudgetCents: 15000,
  perPurchaseLimitCents: 8000,
  approvalThresholdCents: 4000,
  allowedCategories: ["home-garden", "health-beauty", "media", "apparel-accessories"],
  blockedMerchants: ["badshop.com"],
};

const base = (over: Partial<PolicyInput> = {}): PolicyInput => ({
  priceCents: 2000,
  currency: "USD",
  merchantDomain: "wayfair.com",
  title: "Fleece Blanket",
  topCategorySlug: "home-garden",
  categoryPath: ["home-garden", "linens-bedding", "throw-blankets"],
  spentThisMonthCents: 0,
  scamSignals: [],
  ...over,
});

test("ordinary purchase is allowed", () => {
  const d = evaluatePolicy(base(), rules);
  assert.equal(d.verdict, "ALLOW");
  assert.equal(d.alertTypes.length, 0);
});

test("exactly at the approval threshold is still allowed", () => {
  assert.equal(evaluatePolicy(base({ priceCents: 4000 }), rules).verdict, "ALLOW");
});

test("one cent over the threshold needs approval", () => {
  assert.equal(evaluatePolicy(base({ priceCents: 4001 }), rules).verdict, "NEEDS_APPROVAL");
});

test("over the per-purchase limit is blocked", () => {
  const d = evaluatePolicy(base({ priceCents: 8001 }), rules);
  assert.equal(d.verdict, "BLOCK");
  assert.ok(d.alertTypes.includes("OVER_BUDGET"));
});

test("exactly at the monthly budget is allowed, over it needs approval", () => {
  assert.equal(evaluatePolicy(base({ priceCents: 2000, spentThisMonthCents: 13000 }), rules).verdict, "ALLOW");
  assert.equal(evaluatePolicy(base({ priceCents: 2000, spentThisMonthCents: 13001 }), rules).verdict, "NEEDS_APPROVAL");
});

test("category outside the allowed list needs approval", () => {
  const d = evaluatePolicy(base({ topCategorySlug: "electronics", categoryPath: ["electronics"] }), rules);
  assert.equal(d.verdict, "NEEDS_APPROVAL");
});

test("unknown category needs approval", () => {
  assert.equal(evaluatePolicy(base({ topCategorySlug: null, categoryPath: [] }), rules).verdict, "NEEDS_APPROVAL");
});

test("gift card detected by title is blocked", () => {
  const d = evaluatePolicy(base({ title: "Spafinder Gift Card $25", topCategorySlug: "home-garden" }), rules);
  assert.equal(d.verdict, "BLOCK");
  assert.ok(d.alertTypes.includes("SCAM_SUSPECTED"));
});

test("gift card detected by category is blocked", () => {
  const d = evaluatePolicy(
    base({ title: "LEGO", topCategorySlug: "arts-entertainment", categoryPath: ["arts-entertainment", "gift-giving"] }),
    rules
  );
  assert.equal(d.verdict, "BLOCK");
});

test("prepaid cards are blocked", () => {
  assert.equal(evaluatePolicy(base({ title: "Visa Prepaid Card" }), rules).verdict, "BLOCK");
});

test("blocked merchant is blocked, including www and subdomains", () => {
  assert.equal(evaluatePolicy(base({ merchantDomain: "www.badshop.com" }), rules).verdict, "BLOCK");
  assert.equal(evaluatePolicy(base({ merchantDomain: "store.badshop.com" }), rules).verdict, "BLOCK");
  assert.equal(evaluatePolicy(base({ merchantDomain: "notbadshop.com" }), rules).verdict, "ALLOW");
});

test("scam signals block an otherwise fine purchase", () => {
  const d = evaluatePolicy(base({ scamSignals: ["a caller said I must buy today"] }), rules);
  assert.equal(d.verdict, "BLOCK");
  assert.ok(d.alertTypes.includes("SCAM_SUSPECTED"));
});

test("BLOCK outranks NEEDS_APPROVAL and all reasons are kept", () => {
  const d = evaluatePolicy(base({ priceCents: 9000, topCategorySlug: "electronics", categoryPath: ["electronics"] }), rules);
  assert.equal(d.verdict, "BLOCK");
  assert.ok(d.reasons.length >= 3);
});

test("non-USD needs approval", () => {
  assert.equal(evaluatePolicy(base({ currency: "EUR" }), rules).verdict, "NEEDS_APPROVAL");
});

test("price far above other stores needs approval and raises PRICE_ANOMALY", () => {
  const d = evaluatePolicy(base({ priceCents: 3000, otherOfferPricesCents: [1500, 1800] }), rules);
  assert.equal(d.verdict, "NEEDS_APPROVAL");
  assert.ok(d.alertTypes.includes("PRICE_ANOMALY"));
});

test("price in line with other stores is allowed", () => {
  assert.equal(evaluatePolicy(base({ priceCents: 1700, otherOfferPricesCents: [1500, 1800] }), rules).verdict, "ALLOW");
});

test("a big ratio but tiny dollar gap is not flagged", () => {
  assert.equal(evaluatePolicy(base({ priceCents: 600, otherOfferPricesCents: [300] }), rules).verdict, "ALLOW");
});

test("no other offers means no price flag", () => {
  assert.equal(evaluatePolicy(base({ priceCents: 3500, otherOfferPricesCents: [] }), rules).verdict, "ALLOW");
});

test("unfamiliar merchant needs approval", () => {
  const d = evaluatePolicy(base({ merchantIsFamiliar: false }), rules);
  assert.equal(d.verdict, "NEEDS_APPROVAL");
  assert.ok(d.alertTypes.includes("UNFAMILIAR_MERCHANT"));
});

test("trusted merchant list handles www and subdomains", () => {
  assert.ok(isTrustedMerchant("www.wayfair.com"));
  assert.ok(isTrustedMerchant("shop.target.com"));
  assert.ok(!isTrustedMerchant("nottarget.com"));
});

test("buying the same product again recently needs approval", () => {
  const d = evaluatePolicy(base({ boughtSameProductRecently: true }), rules);
  assert.equal(d.verdict, "NEEDS_APPROVAL");
  assert.ok(d.alertTypes.includes("REPEAT_PURCHASE"));
});

test("rapid requests: 10 is fine, 11 needs approval", () => {
  assert.equal(evaluatePolicy(base({ recentRequestCount: 10 }), rules).verdict, "ALLOW");
  const d = evaluatePolicy(base({ recentRequestCount: 11 }), rules);
  assert.equal(d.verdict, "NEEDS_APPROVAL");
  assert.ok(d.alertTypes.includes("RAPID_REQUESTS"));
});

test("AI high risk escalates, low/medium/null do not", () => {
  const high = evaluatePolicy(base({ llmRisk: { level: "high", reasons: ["Product doesn't match the request."] } }), rules);
  assert.equal(high.verdict, "NEEDS_APPROVAL");
  assert.ok(high.alertTypes.includes("AI_RISK"));
  assert.equal(evaluatePolicy(base({ llmRisk: { level: "medium", reasons: [] } }), rules).verdict, "ALLOW");
  assert.equal(evaluatePolicy(base({ llmRisk: { level: "low", reasons: [] } }), rules).verdict, "ALLOW");
  assert.equal(evaluatePolicy(base({ llmRisk: null }), rules).verdict, "ALLOW");
});

test("the AI can never loosen a block", () => {
  const d = evaluatePolicy(base({ priceCents: 9000, llmRisk: { level: "low", reasons: [] } }), rules);
  assert.equal(d.verdict, "BLOCK");
});

test("an ordinary purchase raises no alerts", () => {
  assert.deepEqual(evaluatePolicy(base(), rules).alertTypes, []);
});