import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { jsonrepair } from "jsonrepair";

const Input = z.object({
  apiKey: z.string().optional(),
  notes: z.string().default(""),
  imageDataUrl: z.string().optional().nullable(),
  transcript: z.string(),
  board: z.string(),
});

export type AnalyzeResult = {
  accuracy: number;
  summary: string;
  matched: string[];
  missed: string[];
  feedback: { title: string; body: string }[];
};

const SYSTEM = `You are a strict UK GCSE/A-Level examiner for the specified exam board. You mark a student's spoken/typed "blurt" (active recall) against their revision notes.
Score how much of the key content in the notes the student successfully recalled, taking into account specific exam board terminology rules.

You MUST reply with ONLY a valid raw JSON object. Do NOT include markdown blocks or extra text.
JSON Structure:
{
  "accuracy": 85,
  "summary": "One sentence summary verdict.",
  "matched": ["point 1", "point 2"],
  "missed": ["point 1", "point 2"],
  "feedback": [{"title": "3-6 words error", "body": "one sentence explanation"}]
}

- feedback: flag any factual errors, vague wording, or mix-ups in the transcript. Include as many items as necessary (or an empty array [] if there are no errors).
If the notes are empty or transcript is empty/nonsense, set accuracy to 0 and explain in summary.`;

export const analyzeBlurt = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }): Promise<AnalyzeResult> => {
    const key =
      data.apiKey ||
      process.env.OPENROUTER_API_KEY ||
      process.env.LOVABLE_API_KEY;
    if (!key)
      throw new Error(
        "API Key missing! Please enter your key in the box at the top of the page."
      );

    // Dynamic model selection: Nemotron 120B for text grading, Gemma 4 for vision/OCR
    const selectedModel = data.imageDataUrl
      ? "google/gemma-4-26b-a4b-it:free"
      : "nvidia/nemotron-3-super-120b-a12b:free";

    const userText = `Exam Board: ${data.board}

STUDENT'S NOTES (source of truth):
"""
${data.notes || "(no text notes provided — OCR the attached image)"}
"""

STUDENT'S SPOKEN/TYPED TRANSCRIPT:
"""
${data.transcript || "(empty)"}
"""

Mark the transcript against the notes. Return raw JSON only.`;

    const content: Array<Record<string, unknown>> = [
      { type: "text", text: userText },
    ];

    if (data.imageDataUrl) {
      content.push({
        type: "image_url",
        image_url: { url: data.imageDataUrl },
      });
    }

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: selectedModel,
        temperature: 0.2, // Keeps scores steady across re-tests
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (res.status === 429)
        throw new Error("Rate limited by free AI gateway — try again shortly.");
      if (res.status === 402)
        throw new Error("AI credits exhausted or limit reached for this key.");
      throw new Error(`AI request failed: ${res.status} ${body}`);
    }

    const json = (await res.json()) as {
      choices: { message: { content: string } }[];
    };
    const rawText = json.choices?.[0]?.message?.content ?? "{}";

    try {
      return JSON.parse(jsonrepair(rawText)) as AnalyzeResult;
    } catch {
      throw new Error("Failed to parse analysis results. Please try again.");
    }
  });