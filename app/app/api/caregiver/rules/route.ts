import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "../../../../lib/db";
import { getRules } from "../../../../lib/policy/queries";

export async function GET(req: Request) {
  const parentId = Number(new URL(req.url).searchParams.get("parentId") ?? 1);
  const r = getRules(parentId);
  return NextResponse.json({
    monthlyBudget: r.monthlyBudgetCents / 100,
    perPurchaseLimit: r.perPurchaseLimitCents / 100,
    approvalThreshold: r.approvalThresholdCents / 100,
    allowedCategories: r.allowedCategories,
    blockedMerchants: r.blockedMerchants,
  });
}

const Body = z
  .object({
    parentId: z.number().int().positive().default(1),
    monthlyBudget: z.number().min(0).max(100000),
    perPurchaseLimit: z.number().min(0).max(100000),
    approvalThreshold: z.number().min(0).max(100000),
    allowedCategories: z.array(z.string().min(1).max(60)).max(30),
    blockedMerchants: z.array(z.string().min(1).max(100)).max(50),
  })
  .refine((b) => b.approvalThreshold <= b.perPurchaseLimit, {
    message: "The approval threshold can't be higher than the per-purchase limit.",
  })
  .refine((b) => b.perPurchaseLimit <= b.monthlyBudget, {
    message: "The per-purchase limit can't be higher than the monthly budget.",
  });

function cleanDomain(d: string) {
  return d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
}

export async function PUT(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Please check the numbers." },
      { status: 400 }
    );
  }
  const b = parsed.data;
  const blocked = [...new Set(b.blockedMerchants.map(cleanDomain).filter(Boolean))];

  db.prepare(
    `UPDATE rules SET monthly_budget_cents = ?, per_purchase_limit_cents = ?, approval_threshold_cents = ?,
       allowed_categories = ?, blocked_merchants = ? WHERE parent_id = ?`
  ).run(
    Math.round(b.monthlyBudget * 100),
    Math.round(b.perPurchaseLimit * 100),
    Math.round(b.approvalThreshold * 100),
    JSON.stringify(b.allowedCategories),
    JSON.stringify(blocked),
    b.parentId
  );
  return NextResponse.json({ ok: true });
}