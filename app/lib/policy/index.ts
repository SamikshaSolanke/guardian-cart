export type Verdict = "ALLOW" | "NEEDS_APPROVAL" | "BLOCK";
export type AlertType =
  | "SCAM_SUSPECTED"
  | "OVER_BUDGET"
  | "BLOCKED_MERCHANT"
  | "PRICE_ANOMALY"
  | "UNFAMILIAR_MERCHANT"
  | "REPEAT_PURCHASE"
  | "RAPID_REQUESTS"
  | "AI_RISK";

export type Rules = {
  monthlyBudgetCents: number;
  perPurchaseLimitCents: number;
  approvalThresholdCents: number;
  allowedCategories: string[]; // Channel3 slugs, e.g. "home-garden"
  blockedMerchants: string[]; // domains, e.g. "example.com"
};

export type LlmRisk = { level: "low" | "medium" | "high"; reasons: string[] };

export type PolicyInput = {
  priceCents: number;
  currency: string;
  merchantDomain: string;
  title: string;
  topCategorySlug: string | null;
  categoryPath: string[];
  spentThisMonthCents: number;
  scamSignals: string[];
  // Extra signals. All optional, and a missing value means "no concern".
  otherOfferPricesCents?: number[]; // same product at other stores
  merchantIsFamiliar?: boolean;
  boughtSameProductRecently?: boolean;
  recentRequestCount?: number;
  llmRisk?: LlmRisk | null;
};

export type Check = {
  rule: string;
  passed: boolean;
  effect: Verdict; // what happens if this check fails
  detail: string;
  alert?: AlertType; // raise this alert if the check fails
};

export type PolicyDecision = {
  verdict: Verdict;
  reasons: string[];
  checks: Check[];
  alertTypes: AlertType[];
};

// Tunable thresholds
export const PRICE_OUTLIER_RATIO = 1.5; // offer must be 1.5x the median of other stores...
export const PRICE_OUTLIER_MIN_GAP_CENTS = 500; // ...and at least $5 higher
export const RAPID_REQUEST_LIMIT = 10;
export const RAPID_WINDOW_MINUTES = 10;
export const REPEAT_WINDOW_DAYS = 30;

export const TRUSTED_MERCHANTS = [
  "amazon.com", "walmart.com", "target.com", "wayfair.com", "walgreens.com", "cvs.com",
  "costco.com", "bestbuy.com", "homedepot.com", "lowes.com", "kohls.com", "macys.com",
  "nordstrom.com", "barnesandnoble.com", "ikea.com", "chewy.com", "staples.com",
];

const RANK: Record<Verdict, number> = { ALLOW: 0, NEEDS_APPROVAL: 1, BLOCK: 2 };

const GIFT_RE = /gift\s*card|e-?gift|prepaid|gift\s*certificate|\bvoucher\b|reload\s*card/i;

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

function normDomain(d: string) {
  return d.toLowerCase().replace(/^www\./, "");
}

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function isTrustedMerchant(domain: string) {
  const d = normDomain(domain);
  return TRUSTED_MERCHANTS.some((t) => d === t || d.endsWith("." + t));
}

export function looksLikeGiftCard(i: Pick<PolicyInput, "title" | "categoryPath">) {
  return GIFT_RE.test(i.title) || i.categoryPath.includes("gift-giving");
}

export function evaluatePolicy(input: PolicyInput, rules: Rules): PolicyDecision {
  const checks: Check[] = [];
  const add = (rule: string, passed: boolean, effect: Verdict, detail: string, alert?: AlertType) =>
    checks.push({ rule, passed, effect, detail, alert });

  // --- BLOCK-level rules ---
  add(
    "scam_signals",
    input.scamSignals.length === 0,
    "BLOCK",
    `The request shows signs of pressure or a possible scam: "${input.scamSignals.join("; ")}".`,
    "SCAM_SUSPECTED"
  );

  add(
    "gift_card",
    !looksLikeGiftCard(input),
    "BLOCK",
    "Gift cards and prepaid cards are never allowed. They are a common scam payment method.",
    "SCAM_SUSPECTED"
  );

  const domain = normDomain(input.merchantDomain);
  const blocked = rules.blockedMerchants.map(normDomain).some((b) => domain === b || domain.endsWith("." + b));
  add("blocked_merchant", !blocked, "BLOCK", `${input.merchantDomain} is on the blocked merchants list.`, "BLOCKED_MERCHANT");

  add(
    "per_purchase_limit",
    input.priceCents <= rules.perPurchaseLimitCents,
    "BLOCK",
    `${usd(input.priceCents)} is above the ${usd(rules.perPurchaseLimitCents)} limit for a single purchase.`,
    "OVER_BUDGET"
  );

  // --- NEEDS_APPROVAL rules ---
  add(
    "monthly_budget",
    input.spentThisMonthCents + input.priceCents <= rules.monthlyBudgetCents,
    "NEEDS_APPROVAL",
    `This would bring this month's spending to ${usd(input.spentThisMonthCents + input.priceCents)}, above the ${usd(rules.monthlyBudgetCents)} monthly budget.`
  );

  add(
    "approval_threshold",
    input.priceCents <= rules.approvalThresholdCents,
    "NEEDS_APPROVAL",
    `${usd(input.priceCents)} is above ${usd(rules.approvalThresholdCents)}, so a caregiver needs to approve it.`
  );

  const inAllowed =
    input.topCategorySlug !== null &&
    (rules.allowedCategories.includes(input.topCategorySlug) ||
      input.categoryPath.some((s) => rules.allowedCategories.includes(s)));
  add(
    "category",
    inAllowed,
    "NEEDS_APPROVAL",
    `The category "${input.topCategorySlug ?? "unknown"}" is not on the allowed list.`
  );

  add("currency", input.currency === "USD", "NEEDS_APPROVAL", `The price is in ${input.currency}, not US dollars.`);

  // --- Extra safety signals (all NEEDS_APPROVAL: a human takes a look) ---
  const others = input.otherOfferPricesCents ?? [];
  let priceOk = true;
  let priceDetail = "";
  if (others.length >= 1) {
    const med = median(others);
    priceOk = !(
      input.priceCents > med * PRICE_OUTLIER_RATIO && input.priceCents - med >= PRICE_OUTLIER_MIN_GAP_CENTS
    );
    priceDetail = `Other stores sell this item for about ${usd(med)}, but this offer is ${usd(input.priceCents)}.`;
  }
  add("price_anomaly", priceOk, "NEEDS_APPROVAL", priceDetail, "PRICE_ANOMALY");

  add(
    "unfamiliar_merchant",
    input.merchantIsFamiliar !== false,
    "NEEDS_APPROVAL",
    `${input.merchantDomain} is a store we don't recognise, and nothing has been bought there before.`,
    "UNFAMILIAR_MERCHANT"
  );

  add(
    "repeat_purchase",
    !input.boughtSameProductRecently,
    "NEEDS_APPROVAL",
    `This same item was already bought in the last ${REPEAT_WINDOW_DAYS} days.`,
    "REPEAT_PURCHASE"
  );

  add(
    "rapid_requests",
    (input.recentRequestCount ?? 0) <= RAPID_REQUEST_LIMIT,
    "NEEDS_APPROVAL",
    `There have been more than ${RAPID_REQUEST_LIMIT} requests in the last ${RAPID_WINDOW_MINUTES} minutes.`,
    "RAPID_REQUESTS"
  );

  add(
    "ai_risk",
    input.llmRisk?.level !== "high",
    "NEEDS_APPROVAL",
    `An AI safety check flagged this purchase: ${(input.llmRisk?.reasons ?? []).join(" ") || "possible risk."}`,
    "AI_RISK"
  );

  // --- Combine: the worst failing effect wins ---
  const failed = checks.filter((c) => !c.passed);
  const verdict = failed.reduce<Verdict>((v, c) => (RANK[c.effect] > RANK[v] ? c.effect : v), "ALLOW");

  const alertTypes = [...new Set(failed.map((c) => c.alert).filter((a): a is AlertType => !!a))];

  return {
    verdict,
    reasons: failed.length ? failed.map((c) => c.detail) : ["Within all of the caregiver's rules."],
    checks,
    alertTypes,
  };
}

// Words that commonly show up in phone/email scams. A backstop for the LLM:
// even if the model misses the pressure, this still catches it.
const PRESSURE_RE =
  /\b(irs|arrest(ed)?|warrant|fined|lottery|prize|bitcoin|western union|wire transfer|remote access|tech support)\b/i;

/** Returns a BLOCK decision if the raw request itself looks like a scam, else null. */
export function screenRequest(rawText: string, searchQuery: string, llmSignals: string[]): PolicyDecision | null {
  const reasons: string[] = [];

  if (llmSignals.length > 0) {
    reasons.push(`The request shows signs of pressure from someone else: "${llmSignals.join("; ")}".`);
  }
  if (PRESSURE_RE.test(rawText)) {
    reasons.push("The request contains wording commonly used in scams.");
  }
  if (GIFT_RE.test(rawText) || GIFT_RE.test(searchQuery)) {
    reasons.push("Gift cards and prepaid cards are never allowed. They are a common scam payment method.");
  }

  if (reasons.length === 0) return null;
  return { verdict: "BLOCK", reasons, checks: [], alertTypes: ["SCAM_SUSPECTED"] };
}