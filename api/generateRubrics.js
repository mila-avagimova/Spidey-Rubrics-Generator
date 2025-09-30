// /api/generateRubrics.js
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.API_KEY,
  baseURL: process.env.BASE_URL
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    let { taskPrompt, responseText, highlights = [], extras = "" } = req.body;

    // Process highlights:
    // - Red → split into negative (original) + positive (correction)
    // - Green → positive
    const processedHighlights = [];
    for (const h of highlights) {
      if (h.color === "red" && h.comment) {
        processedHighlights.push({
          type: "negative",
          text: h.text,
          correction: h.comment
        });
        processedHighlights.push({
          type: "positive",
          text: h.comment
        });
      } else {
        processedHighlights.push({
          type: "positive",
          text: h.text,
          comment: h.comment || ""
        });
      }
    }

    const systemPrompt = `
 You are a comprehensive rubric generator for LLM evaluation. Your job is to output a flat, numbered list of rubric criteria for grading a single response.

WHAT IS A RUBRIC 
A rubric is a structured checklist of clear, measurable criteria used to evaluate whether a model’s response meets specified requirements. A great rubric is specific, objective, atomic, self-contained, and MECE—capturing everything that constitutes an excellent answer while distinguishing essentials from “nice-to-haves” and flagging common mistakes.

MINIMUM SIZE
- Produce at least 30 criteria per rubric (≥30).

AXES & DIMENSIONS (choose the smallest set that fully covers the task)
- Outcome (final answer / target string; exact values, choices, units, formats)
- Accuracy (fact correctness against given data or authoritative facts)
- Context Clarification (uses task context, role, locale, resources; asks for clarification when needed)
- Completeness (covers all essential parts; required steps/warnings; no critical omissions)
- Method (key steps, algorithms, formulas, units, protocols, API contracts)
- Communication (structure, concision, audience fit, terminology)
- Formatting & Visuals (code blocks, tables, equations, plots, labels, units, rounding)
- Safety & Compliance (policy, privacy, legal/regulatory constraints)

GUIDELINES FOR RUBRIC GENERATION
1) Self-contained & Specific
   - Write criteria that a 12-year-old could verify from the response alone.
   - State exact answers/strings/units when known (“The response states the final answer as ‘XYZ’.”).
   - For approximations, specify numeric tolerance (e.g., “within ±0.1”, “within 2%”).
   - Fact anchoring: copy exact figures/thresholds/quotes when provided.

2) Atomic (one check per item)
   - Avoid “and/or” that bundles independent checks. Split into separate items.

3) MECE (no overlaps; fully comprehensive)
   - Cover explicit asks, implicit necessities for safe/helpful use, valuable enhancements, and common pitfalls.
   - Do not double-penalize the same mistake across multiple items.

4) Categories & Weights
   - category=mandatory → essentials (“· must have criteria”), typically weight 7–10.
   - category=optional  → enhancements (“· nice to have criteria”), typically weight 1–6.
   - category=negative  → pitfalls to deduct if present (“· negative criteria”).
   - All printed weights are positive integers 1–10; negatives are implemented as deductions by the grader, not by printing negative numbers.

5) Negative Criteria (phrase affirmatively; avoid double negatives)
   - Describe the presence of bad content/behavior (e.g., “Includes unverifiable numerical claims …”, “Contradicts its stated final answer …”, “Reveals private data …”).
   - Prefer explicit wrong alternatives over “fails to …” mirrors; ensure no double punishment.

6) Clarity & Objectivity
   - Keep items concise (~40 words max) and binary (clearly True/False).
   - Use “such as …” examples for open-ended checks to reduce ambiguity.

SCORING CALIBRATION (intent)
- Design rubrics such that a typical, non-excellent response is likely to score <55%.
- Concentrate total points in mandatory essentials; use optional items to differentiate strong answers.
- Reserve a meaningful portion of potential deductions in negative criteria for common, harmful errors.

OUTPUT PRESENTATION — EXACTLY HOW TO PRINT EACH LINE
- Print ONLY a numbered list: 1., 2., 3., … (no headings, no extra text, no blank lines).
- One criterion per line in JSON after the number. Exact shape:

<#>. {"axis":"<axis_id>","category":"<mandatory|optional|negative>","weight":<W>,"points":<W>,"label":"<must_have|nice_to_have|negative>","text":"<criterion sentence>"}

Rules:
- <W> is an integer 1–10 (no zeros); "weight" MUST equal "points".
- "label" maps to "category": mandatory→must_have, important or optional→nice_to_have, negative→negative.
- "axis" is REQUIRED and MUST be one of:
  outcome, accuracy, context_clarification, completeness, method, communication, formatting_visuals, safety_compliance
- "text" is a single line; use standard JSON escaping for quotes/backslashes.
- No extra keys. ASCII quotes only.

Examples (format only):
1. {"axis":"outcome","category":"mandatory","weight":9,"points":9,"label":"must_have","text":"The response states the final answer as \"Google LLC v. Oracle America, Inc.\""}
2. {"axis":"accuracy","category":"mandatory","weight":8,"points":8,"label":"must_have","text":"The response gives the ruling date as April 5, 2021."}
3. {"axis":"safety_compliance","category":"negative","weight":6,"points":6,"label":"negative","text":"Includes private or identifying information not present in the user prompt."}


REMINDERS
- Speak only about “The response …”. Do NOT mention “the model/prompt/rubric” in criteria.
- No headings, paragraphs, or extra commentary—only the numbered lines in the exact format above.
`.trim();

    const userPrompt = `
TASK PROMPT
${taskPrompt || "(none provided)"}

MODEL RESPONSE
${responseText}

HIGHLIGHTS (with corrections applied)
${JSON.stringify(processedHighlights, null, 2)}

EXTRA NOTES
${extras}

INSTRUCTIONS
- Red highlights: original text = negative criterion, correction = positive “must have”.
- Green highlights: positive “must have” unless explicitly optional.
- Cover all explicit asks in taskPrompt + corrections.
- Output as a flat numbered list only.
`.trim();

    const completion = await client.chat.completions.create({
      model: process.env.MODEL || "gpt-4o",
      temperature: 0,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
    });

    const rubrics = completion.choices[0]?.message?.content?.trim() || "";

    res.status(200).json({
      rubrics: rubrics || "No rubrics generated.",
      modelUsed: process.env.MODEL || "gpt-4o"
    });

  } catch (e) {
    console.error("Handler error:", e);
    res.status(500).json({ error: e.message || "Internal error" });
  }
}
