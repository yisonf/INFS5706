import Anthropic from "@anthropic-ai/sdk";

/**
 * Thin wrapper around the Claude API that always asks for a JSON object and
 * parses it. Every agent in the pipeline goes through here so the model,
 * temperature and parsing behaviour are consistent and easy to swap.
 */

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to .env.local (locally) or the Vercel project environment variables.",
    );
  }
  if (!client) client = new Anthropic();
  return client;
}

export const MODELS = {
  // Heavier reasoning for extraction and consolidation.
  primary: process.env.PRIMARY_MODEL ?? "claude-sonnet-5-5",
  // Cheaper/faster model for the narrower specialist analyses.
  specialist: process.env.SPECIALIST_MODEL ?? "claude-haiku-5-5",
};

export async function askForJson<T>(opts: {
  model: string;
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<T> {
  const res = await getClient().messages.create({
    model: opts.model,
    max_tokens: opts.maxTokens ?? 2048,
    system:
      opts.system +
      "\n\nRespond with a single JSON object and nothing else — no prose, no markdown fences.",
    messages: [{ role: "user", content: opts.user }],
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  // Be tolerant of stray fences or leading text.
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error(`Model did not return JSON: ${text.slice(0, 200)}`);
  }
  return JSON.parse(text.slice(start, end + 1)) as T;
}
