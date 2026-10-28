# Guardian Cart: Design Notes

## Problem
Older adults are targeted by scams and can overspend online, and their adult
children can't safely hand over a card. Guardian Cart lets a caregiver set
spending rules; an AI agent shops within them for the parent, and PayPal
handles checkout.

## Users
- **Parent:** types or speaks what they need. Sees a simple recommendation
  with a plain-language explanation.
- **Caregiver:** sets rules, approves exceptions, sees activity and alerts.

## Core principle
The LLM never makes the allow/block decision. It parses requests, ranks
products, explains choices, and flags suspicious language. A deterministic
policy engine decides: ALLOW, NEEDS_APPROVAL, or BLOCK.

## Flow
1. Parent submits a request ("I need a warm blanket under $40").
2. LLM (Groq) extracts intent: item, max_price, category.
3. Channel3 search returns candidate products with offers.
4. LLM ranks candidates and writes a short explanation for the top pick.
5. Scam check runs on the request text and the chosen offer.
6. Policy engine returns a decision with a reason.
7. ALLOW: create PayPal order, parent approves in PayPal, order is captured.
   NEEDS_APPROVAL: caregiver gets an approval request, approves or denies,
   then the order is created. BLOCK: no order, caregiver gets an alert.
8. PayPal webhooks update order status; dashboard refreshes.

## Entities
- **Caregiver:** id, name, email
- **Parent:** id, name, caregiver_id
- **Rules:** parent_id, monthly_budget, per_purchase_limit,
  approval_threshold, allowed_categories[], blocked_merchants[]
- **Request:** id, parent_id, raw_text, parsed_intent (json), status, created_at
- **Recommendation:** id, request_id, product_id, title, merchant_domain,
  price, currency, offer_url, explanation
- **PolicyDecision:** id, request_id, verdict (ALLOW | NEEDS_APPROVAL | BLOCK),
  reasons[], rule_checks (json)
- **Order:** id, request_id, paypal_order_id, status, amount, currency,
  created_at, captured_at
- **Alert:** id, parent_id, type (SCAM_SUSPECTED | OVER_BUDGET | BLOCKED_MERCHANT),
  evidence (json), created_at, resolved

## Policy rules (v1)
- Total spend this month + price must not exceed monthly_budget
- price must not exceed per_purchase_limit (else BLOCK)
- price above approval_threshold needs caregiver approval
- category must be in allowed_categories (else NEEDS_APPROVAL)
- merchant must not be in blocked_merchants (else BLOCK)
- Gift cards / prepaid cards: always BLOCK
- Scam flag raised: BLOCK and create an Alert

## Scam signals (v1)
- Gift card or prepaid card purchase
- Pressure or urgency language in the request ("must buy today", "a man called")
- Price much higher than other offers for the same product
- Unfamiliar merchant domain

## Stack
- Next.js (TypeScript), SQLite
- Groq (LLM), Channel3 (product search), PayPal Orders v2 + webhooks (sandbox)
- Deployed on Render

## Known limitations
- Sandbox only: PayPal payments are simulated and the merchant isn't actually
  paid or shipped to. Fulfillment is out of scope.
- Parent completes the PayPal approval step for each order.

## Stretch goals
- PayPal Vault for pre-approved purchases
- Voice input
- Caregiver Q&A via the PayPal MCP server