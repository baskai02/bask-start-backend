import type { KaiAgentContext, KaiAgentResponse } from "./agent-types.js";
import {
  KAI_SYSTEM_PROMPT,
  KAI_USER_PROMPT_TEMPLATE
} from "./agent-prompt.js";

const DEFAULT_OPENAI_MODEL = "gpt-5-mini";
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

export async function generateKaiAgentResponse(
  context: KaiAgentContext
): Promise<KaiAgentResponse> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set.");
  }

  const model = process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL;
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      input: buildKaiAgentInput(context)
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${errorText}`);
  }

  const data = (await response.json()) as { output_text?: string };
  const outputText = data.output_text;

  if (!outputText) {
    throw new Error("OpenAI response did not include output_text.");
  }

  return parseKaiAgentResponse(outputText);
}

function buildKaiAgentInput(context: KaiAgentContext): string {
  return [
    KAI_SYSTEM_PROMPT,
    "",
    KAI_USER_PROMPT_TEMPLATE,
    "",
    "App context:",
    JSON.stringify(context, null, 2)
  ].join("\n");
}

function parseKaiAgentResponse(outputText: string): KaiAgentResponse {
  const normalized = outputText.trim().replace(/^```json\s*/i, "").replace(/```$/, "");
  const parsed = JSON.parse(normalized) as Partial<KaiAgentResponse>;

  if (!parsed.message || !parsed.reason || !parsed.nextStep) {
    throw new Error("Kai agent response was missing required fields.");
  }

  return {
    message: parsed.message,
    reason: parsed.reason,
    nextStep: parsed.nextStep
  };
}
