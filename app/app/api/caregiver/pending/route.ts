import { NextResponse } from "next/server";
import { db } from "../../../../lib/db";
import { getRules, getSpentThisMonthCents } from "../../../../lib/policy/queries";

export async function GET(req: Request) {
  const parentId = Number(new URL(req.url).searchParams.get("parentId") ?? 1);

  const rows = db
    .prepare(
      `SELECT r.id AS requestId, r.raw_text AS rawText, r.created_at AS createdAt,
              rec.title, rec.merchant_domain AS merchantDomain, rec.price_cents AS priceCents,
              rec.explanation,
              (SELECT reasons FROM policy_decisions d WHERE d.request_id = r.id ORDER BY d.id DESC LIMIT 1) AS reasons
       FROM requests r
       JOIN recommendations rec
         ON rec.id = (SELECT MAX(id) FROM recommendations WHERE request_id = r.id)
       WHERE r.parent_id = ? AND r.status = 'needs_approval'
       ORDER BY r.id DESC`
    )
    .all(parentId) as any[];

  const rules = getRules(parentId);
  return NextResponse.json({
    pending: rows.map((r) => ({ ...r, reasons: r.reasons ? JSON.parse(r.reasons) : [] })),
    budget: {
      spentCents: getSpentThisMonthCents(parentId),
      monthlyBudgetCents: rules.monthlyBudgetCents,
    },
  });
}