import { NextResponse } from "next/server";
import { db } from "../../../../lib/db";

export async function GET(req: Request) {
  const parentId = Number(new URL(req.url).searchParams.get("parentId") ?? 1);

  const activity = db
    .prepare(
      `SELECT r.id AS requestId, r.raw_text AS rawText, r.status, r.created_at AS createdAt,
              rec.title, rec.price_cents AS priceCents, rec.merchant_domain AS merchantDomain,
              (SELECT reasons FROM policy_decisions d WHERE d.request_id = r.id ORDER BY d.id DESC LIMIT 1) AS reasons
       FROM requests r
       LEFT JOIN recommendations rec
         ON rec.id = (SELECT MAX(id) FROM recommendations WHERE request_id = r.id)
       WHERE r.parent_id = ?
       ORDER BY r.id DESC
       LIMIT 20`
    )
    .all(parentId) as any[];

  const alerts = db
    .prepare(
      `SELECT id, type, evidence, created_at AS createdAt, resolved
       FROM alerts WHERE parent_id = ?
       ORDER BY resolved ASC, id DESC
       LIMIT 30`
    )
    .all(parentId) as any[];

  return NextResponse.json({
    activity: activity.map((a) => ({ ...a, reasons: a.reasons ? JSON.parse(a.reasons) : [] })),
    alerts: alerts.map((a) => ({
      ...a,
      evidence: a.evidence ? JSON.parse(a.evidence) : null,
      resolved: !!a.resolved,
    })),
  });
}