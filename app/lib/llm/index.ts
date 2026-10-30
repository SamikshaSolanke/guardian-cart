import { z } from "zod";

const URL = "https://api.groq.com/openai/v1/chat/completions";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function rawCall(system: string, user: string): Promise<string> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile",
        response_format: { type: "json_object" },
        temperature: 0.2,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });

    if (res.status === 429) {
      const body = await res.text();
      if (attempt === 3) throw new Error(`LLM rate limited: ${body}`);
      // Wait as long as Groq asks (header or message), capped at 15 seconds.
      const header = Number(res.headers.get("retry-after"));
      const m = body.match(/try again in ([\d.]+)s/i);
      const seconds = header || (m ? parseFloat(m[1]) : 5);
      await sleep(Math.min(15000, Math.ceil((seconds + 0.5) * 1000)));
      continue;
    }

    if (!res.ok) throw new Error(`LLM HTTP ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? "";
  }
  throw new Error("LLM call failed");
}

/** Calls the LLM, parses JSON, validates with Zod. Retries once on invalid output, and waits out rate limits. */
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