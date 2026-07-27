import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
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

const SYSTEM = `You are a UK GCSE/A-Level examiner. You mark a student's spoken "blurt" (active recall) against their revision notes.
Score how much of the key content in the notes the student successfully recalled. Return STRICT JSON only.
- accuracy: integer 0-100, the percentage of key points from the notes that the student clearly covered in the transcript.
- summary: one short sentence overall verdict.
- matched: 3-6 specific points from the notes the student DID say (short bullets).
- missed: 3-6 specific points from the notes the student did NOT say but should have (short bullets).
- feedback: 1-3 items flagging factual errors, vague wording, or mix-ups in the transcript. Each has title (3-6 words) and body (one sentence).
If the notes are empty or the transcript is empty/nonsense, set accuracy to 0 and explain in summary.`;

export const analyzeBlurt = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }): Promise<AnalyzeResult> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY missing");

    const userText = `Exam board: ${data.board}

STUDENT'S NOTES (source of truth):
"""
${data.notes || "(no text notes provided — OCR the attached image)"}
"""

STUDENT'S SPOKEN TRANSCRIPT:
"""
${data.transcript || "(empty)"}
"""

Mark the transcript against the notes. Return JSON only.`;

    const content: Array<Record<string, unknown>> = [
      { type: "text", text: userText },
    ];
    if (data.imageDataUrl) {
      content.push({
        type: "image_url",
        image_url: { url: data.imageDataUrl },
      });
    }

    const res = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: "openai/gpt-5.5",
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "blurt_analysis",
              strict: true,
              schema: {
                type: "object",
                additionalProperties: false,
                properties: {
                  accuracy: { type: "integer", minimum: 0, maximum: 100 },
                  summary: { type: "string" },
                  matched: { type: "array", items: { type: "string" } },
                  missed: { type: "array", items: { type: "string" } },
                  feedback: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        title: { type: "string" },
                        body: { type: "string" },
                      },
                      required: ["title", "body"],
                    },
                  },
                },
                required: [
                  "accuracy",
                  "summary",
                  "matched",
                  "missed",
                  "feedback",
                ],
              },
            },
          },
        }),
      },
    );

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (res.status === 429)
        throw new Error("Rate limited by AI gateway — try again shortly.");
      if (res.status === 402)
        throw new Error("AI credits exhausted for this workspace.");
      throw new Error(`AI request failed: ${res.status} ${body}`);
    }

    const json = (await res.json()) as {
      choices: { message: { content: string } }[];
    };
    const text = json.choices?.[0]?.message?.content ?? "{}";
    return JSON.parse(text) as AnalyzeResult;
  });