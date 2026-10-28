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
  const data = await r.json();
  if (!data.access_token) throw new Error(JSON.stringify(data));
  return data.access_token as string;
}

async function main() {
  const token = await getToken();
  console.log("Got token");

  const r = await fetch(`${BASE}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          description: "Fleece blanket",
          amount: { currency_code: "USD", value: "24.99" },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            return_url: "https://example.com/return",
            cancel_url: "https://example.com/cancel",
            user_action: "PAY_NOW",
          },
        },
      },
    }),
  });

  const order = await r.json();
  console.log("Status:", r.status);
  console.log("Order ID:", order.id, "| order status:", order.status);
  console.log(order.links);
}

main();