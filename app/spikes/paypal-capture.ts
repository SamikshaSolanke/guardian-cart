const BASE = "https://api-m.sandbox.paypal.com";

async function getToken() {
  const auth = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString("base64");
  const r = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  return (await r.json()).access_token as string;
}

async function main() {
  const orderId = process.argv[2];
  if (!orderId) throw new Error("Usage: paypal-capture.ts <ORDER_ID>");
  const token = await getToken();

  const r = await fetch(`${BASE}/v2/checkout/orders/${orderId}/capture`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  console.log("Status:", r.status);
  console.log(JSON.stringify(await r.json(), null, 2));
}

main();