async function main() {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openai/gpt-oss-120b", // check console.groq.com for current model names
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            'Extract a shopping request as JSON with keys: "item" (string), "max_price" (number or null), "category" (string). Return only JSON.',
        },
        { role: "user", content: "I need a warm blanket under $40" },
      ],
    }),
  });

  console.log("Status:", res.status);
  const data = await res.json();
  console.log(data.choices?.[0]?.message?.content ?? JSON.stringify(data));
}

main();