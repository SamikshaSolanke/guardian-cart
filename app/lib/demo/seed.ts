import { db, seedIfEmpty } from "../db";

/** Wipes all data and recreates the demo caregiver, parent, rules, and a little history. */
export function resetDemoData() {
  db.exec(`
    DELETE FROM alerts;
    DELETE FROM orders;
    DELETE FROM policy_decisions;
    DELETE FROM recommendations;
    DELETE FROM requests;
    DELETE FROM rules;
    DELETE FROM parents;
    DELETE FROM caregivers;
    DELETE FROM sqlite_sequence;
  `);
  seedIfEmpty();

  // A little history so the dashboard doesn't look empty.
  // Product ids start with "seed-" so they never trigger the repeat-purchase rule.
  const history = [
    { text: "I need a pack of tea towels", title: "Cotton Tea Towels (4 pack)", merchant: "target.com", cents: 1899, hoursAgo: 52 },
    { text: "A large print crossword book please", title: "Large Print Crossword Puzzles", merchant: "barnesandnoble.com", cents: 1250, hoursAgo: 30 },
    { text: "I need some vitamin D", title: "Vitamin D3 Softgels", merchant: "walgreens.com", cents: 2149, hoursAgo: 8 },
  ];

  history.forEach((h, i) => {
    const ago = `-${h.hoursAgo} hours`;
    const req = db
      .prepare("INSERT INTO requests (parent_id, raw_text, status, created_at) VALUES (1, ?, 'paid', datetime('now', ?))")
      .run(h.text, ago);
    const requestId = Number(req.lastInsertRowid);
    db.prepare(
      `INSERT INTO recommendations (request_id, product_id, title, merchant_domain, price_cents, currency, offer_url, explanation)
       VALUES (?, ?, ?, ?, ?, 'USD', '', '')`
    ).run(requestId, `seed-${i + 1}`, h.title, h.merchant, h.cents);
    db.prepare(
      `INSERT INTO orders (request_id, paypal_order_id, status, amount_cents, currency, created_at, captured_at)
       VALUES (?, ?, 'COMPLETED', ?, 'USD', datetime('now', ?), datetime('now', ?))`
    ).run(requestId, `SEED-ORDER-${i + 1}`, h.cents, ago, ago);
  });

  // One old, already-handled alert, so the Alerts section shows what "resolved" looks like.
  db.prepare(
    `INSERT INTO alerts (parent_id, type, evidence, created_at, resolved)
     VALUES (1, 'UNFAMILIAR_MERCHANT', ?, datetime('now', '-26 hours'), 1)`
  ).run(
    JSON.stringify({
      request: "A scarf for my sister",
      product: "Wool Scarf",
      merchant: "tiny-scarf-shop.example",
      price_cents: 2800,
      reasons: ["tiny-scarf-shop.example is a store we don't recognise, and nothing has been bought there before."],
    })
  );
}