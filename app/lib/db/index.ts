import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

const dataDir = path.join(process.cwd(), "data");
fs.mkdirSync(dataDir, { recursive: true });

export const db = new Database(path.join(dataDir, "guardian.db"));
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 5000");

db.exec(`
CREATE TABLE IF NOT EXISTS caregivers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS parents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  caregiver_id INTEGER NOT NULL REFERENCES caregivers(id)
);

CREATE TABLE IF NOT EXISTS rules (
  parent_id INTEGER PRIMARY KEY REFERENCES parents(id),
  monthly_budget_cents INTEGER NOT NULL,
  per_purchase_limit_cents INTEGER NOT NULL,
  approval_threshold_cents INTEGER NOT NULL,
  allowed_categories TEXT NOT NULL,   -- JSON array
  blocked_merchants TEXT NOT NULL     -- JSON array
);

CREATE TABLE IF NOT EXISTS requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id INTEGER NOT NULL REFERENCES parents(id),
  raw_text TEXT NOT NULL,
  parsed_intent TEXT,                 -- JSON
  status TEXT NOT NULL DEFAULT 'new',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS recommendations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL REFERENCES requests(id),
  product_id TEXT,
  title TEXT NOT NULL,
  merchant_domain TEXT,
  price_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  offer_url TEXT,
  explanation TEXT
);

CREATE TABLE IF NOT EXISTS policy_decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL REFERENCES requests(id),
  verdict TEXT NOT NULL,              -- ALLOW | NEEDS_APPROVAL | BLOCK
  reasons TEXT NOT NULL,              -- JSON array
  rule_checks TEXT                    -- JSON
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL REFERENCES requests(id),
  paypal_order_id TEXT,
  status TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  captured_at TEXT
);

CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id INTEGER NOT NULL REFERENCES parents(id),
  type TEXT NOT NULL,
  evidence TEXT,                      -- JSON
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved INTEGER NOT NULL DEFAULT 0
);
`);

export function seedIfEmpty() {
  // One immediate transaction, so two processes starting together can't both insert.
  const run = db.transaction(() => {
    const row = db.prepare("SELECT COUNT(*) AS n FROM caregivers").get() as { n: number };
    if (row.n > 0) return;

    const cg = db
      .prepare("INSERT INTO caregivers (name, email) VALUES (?, ?)")
      .run("Alex", "alex@example.com");
    const parent = db
      .prepare("INSERT INTO parents (name, caregiver_id) VALUES (?, ?)")
      .run("Margaret", cg.lastInsertRowid);

    db.prepare(
      `INSERT INTO rules (parent_id, monthly_budget_cents, per_purchase_limit_cents,
         approval_threshold_cents, allowed_categories, blocked_merchants)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      parent.lastInsertRowid,
      15000, // $150 monthly budget
      8000, // $80 hard limit per purchase
      4000, // above $40 needs caregiver approval
      JSON.stringify(["home-garden", "health-beauty", "media", "apparel-accessories"]),
      JSON.stringify([])
    );
  });
  run.immediate();
}

// Seed on startup, so a fresh (or wiped) database is always usable.
seedIfEmpty();