async function main() {
  const res = await fetch("https://api.trychannel3.com/v1/search", {
    method: "POST",
    headers: {
      "x-api-key": process.env.CHANNEL3_API_KEY as string,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: "warm fleece blanket", limit: 5 }),
  });

  console.log("Status:", res.status);
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2).slice(0, 3000));
}

main();