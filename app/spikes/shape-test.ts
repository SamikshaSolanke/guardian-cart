import fs from "node:fs";

async function main() {
  const res = await fetch("https://api.trychannel3.com/v1/search", {
    method: "POST",
    headers: {
      "x-api-key": process.env.CHANNEL3_API_KEY as string,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: "warm fleece blanket", limit: 3 }),
  });
  console.log("Status:", res.status);
  const data = await res.json();
  console.log("Top-level keys:", Object.keys(data));
  console.log("Product count:", data.products?.length);
  console.log(JSON.stringify(data.products?.[0], null, 2)?.slice(0, 2500));
  fs.writeFileSync("spikes/channel3-sample.json", JSON.stringify(data, null, 2));
}

main();