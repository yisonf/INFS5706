import Anthropic from "@anthropic-ai/sdk";
import type { ZodType } from "zod";

/**
 * Thin wrapper around the Claude API that asks for a JSON object, validates
 * it against a zod schema, and retries once if the model's output is
 * malformed or fails validation (DEF-08). A refusal or an empty response is
 * NOT retried: it is surfaced as an InvalidReportError so the UI can tell
 * the employee the submission could not be processed as a scam report.
 */

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new ConfigError(
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

/** The model declined to process the input, or returned nothing usable. */
export class InvalidReportError extends Error {
  readonly kind = "invalid_report";
  constructor(message: string) {
    super(message);
    this.name = "InvalidReportError";
  }
}

/** The model's output could not be made to fit the expected shape. */
export class ModelOutputError extends Error {
  readonly kind = "model_output";
  constructor(message: string) {
    super(message);
    this.name = "ModelOutputError";
  }
}

export class ConfigError extends Error {
  readonly kind = "config";
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

const JSON_INSTRUCTION =
  "\n\nRespond with a single JSON object and nothing else — no prose, no markdown fences. Keep each string concise (one or two sentences); prefer more short items over fewer long ones.";

export async function askForJson<T>(opts: {
  model: string;
  system: string;
  user: string;
  schema: ZodType<T>;
  maxTokens?: number;
  stage: string;
}): Promise<{ data: T; usage: Usage; attempts: number }> {
  const maxTokens = opts.maxTokens ?? 6000;
  let lastError: Error | null = null;
  const usage: Usage = { inputTokens: 0, outputTokens: 0 };

  for (let attempt = 1; attempt <= 2; attempt++) {
    const res: Anthropic.Message = await getClient().messages.create({
      model: opts.model,
      max_tokens: maxTokens,
      system:
        opts.system +
        JSON_INSTRUCTION +
        (attempt > 1 && lastError
          ? `\n\nYour previous response was rejected: ${lastError.message.slice(0, 300)}. Return ONLY the JSON object, matching the shape exactly.`
          : ""),
      messages: [{ role: "user", content: opts.user }],
    });

    usage.inputTokens += res.usage.input_tokens;
    usage.outputTokens += res.usage.output_tokens;

    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    // Refusal (safety classifier) or nothing usable: do not retry.
    if (res.stop_reason === "refusal" || text.length === 0) {
      throw new InvalidReportError(
        `The ${opts.stage} stage could not process this submission. It does not appear to be a scam report that this tool can assist with. Please check the description and try again, or escalate to a supervisor.`,
      );
    }

    if (res.stop_reason === "max_tokens") {
      lastError = new ModelOutputError(
        `Response was truncated at ${maxTokens} output tokens.`,
      );
      continue;
    }

    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) {
      lastError = new ModelOutputError(
        `No JSON object found. Response began: ${text.slice(0, 120)}`,
      );
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text.slice(start, end + 1));
    } catch (err) {
      lastError = new ModelOutputError(
        `Malformed JSON: ${err instanceof Error ? err.message : String(err)}`,
      );
      continue;
    }

    const result = opts.schema.safeParse(parsed);
    if (!result.success) {
      const issues = result.error.issues
        .slice(0, 5)
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ");
      lastError = new ModelOutputError(`Failed validation: ${issues}`);
      continue;
    }

    return { data: result.data, usage, attempts: attempt };
  }

  throw new ModelOutputError(
    `The ${opts.stage} stage did not return a usable result after 2 attempts (${lastError?.message ?? "unknown"}). Please try again.`,
  );
}
