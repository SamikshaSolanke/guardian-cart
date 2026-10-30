import { db } from "../db";
import type { Rules } from "./index";

export function getRules(parentId: number): Rules {
  const r = db.prepare("SELECT * FROM rules WHERE parent_id = ?").get(parentId) as any;
  if (!r) throw new Error(`No rules found for parent ${parentId}`);
  return {
    monthlyBudgetCents: r.monthly_budget_cents,
    perPurchaseLimitCents: r.per_purchase_limit_cents,
    approvalThresholdCents: r.approval_threshold_cents,
    allowedCategories: JSON.parse(r.allowed_categories),
    blockedMerchants: JSON.parse(r.blocked_merchants),
  };
}

export function getSpentThisMonthCents(parentId: number): number {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(o.amount_cents), 0) AS total
       FROM orders o JOIN requests r ON r.id = o.request_id
       WHERE r.parent_id = ?
         AND o.status IN ('APPROVED', 'COMPLETED')
         AND strftime('%Y-%m', o.created_at) = strftime('%Y-%m', 'now')`
    )
    .get(parentId) as { total: number };
  return row.total;
}

export function getRecentRequestCount(parentId: number, minutes: number): number {
  const row = db
    .prepare(
      "SELECT COUNT(*) AS n FROM requests WHERE parent_id = ? AND created_at >= datetime('now', ?)"
    )
    .get(parentId, `-${minutes} minutes`) as { n: number };
  return row.n;
}

export function hasBoughtFromMerchant(parentId: number, domain: string): boolean {
  const row = db
    .prepare(
      `SELECT 1 FROM orders o
       JOIN requests r ON r.id = o.request_id
       JOIN recommendations rec ON rec.request_id = r.id
       WHERE r.parent_id = ? AND o.status = 'COMPLETED' AND rec.merchant_domain = ?
       LIMIT 1`
    )
    .get(parentId, domain);
  return !!row;
}

export function boughtProductRecently(parentId: number, productId: string, days: number): boolean {
  if (!productId) return false;
  const row = db
    .prepare(
      `SELECT 1 FROM orders o
       JOIN requests r ON r.id = o.request_id
       JOIN recommendations rec ON rec.request_id = r.id
       WHERE r.parent_id = ? AND o.status = 'COMPLETED' AND rec.product_id = ?
         AND o.created_at >= datetime('now', ?)
       LIMIT 1`
    )
    .get(parentId, productId, `-${days} days`);
  return !!row;
}