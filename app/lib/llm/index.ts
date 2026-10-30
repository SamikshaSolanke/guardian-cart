import { z } from "zod";

const URL = "https://api.groq.com/openai/v1/chat/completions";

async function rawCall(system: string, user: string): Promise<string> {
  const res = await fetch(URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL ?? "openai/gpt-oss-120b",
      response_format: { type: "json_object" },
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`LLM HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

/** Calls the LLM, parses JSON, validates with Zod. Retries once on failure. */
export async function callLLM<T extends z.ZodTypeAny>(
  system: string,
  user: string,
  schema: T
): Promise<z.infer<T>> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const text = await rawCall(system, user);
      return schema.parse(JSON.parse(text));
    } catch (e) {
      lastError = e;
    }
  }
  throw new Error(`LLM output invalid after retry: ${String(lastError)}`);
}