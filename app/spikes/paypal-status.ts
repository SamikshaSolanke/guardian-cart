const BASE = "https://api-m.sandbox.paypal.com";

async function main() {
  const auth = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString("base64");
  const t = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  const token = (await t.json()).access_token;

  const r = await fetch(`${BASE}/v2/checkout/orders/${process.argv[2]}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const o = await r.json();
  console.log("Order status:", o.status);
}

main();