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
You are an expert rubric architect. Generate a flat, numbered list of rubric criteria.

STRICT RULES:

* **Format:** ONLY a numbered list. No headings, no markdown, no extra commentary.
* **Atomicity:** One check per item, no overlaps or bundled conditions.
* **Specificity:** Always use exact values, labels, names, or categories from the prompt, model response, or corrections. Avoid vague wording.
* **Outcome-focused:** Only evaluate final outputs (artefacts like numbers, names, plots, lists, comparisons). Do not include process steps unless the prompt explicitly requires the model to output them.
* **Self-contained:** Each item must stand alone; do not reference other items (no “see above”).
* **Comprehensive:** Cover all explicit asks, implicit requirements (e.g., exclude invalid data), and observed model failures.
* **Redundancy:** Do not duplicate checks. Each requirement appears once only.
* **Weights:**

  * Critical factual correctness (numeric results, named entities, categorical values) → 30–40 points.
  * Major structural requirements (plots present, correct comparisons, inclusion/exclusion rules) → 20–30 points.
  * Stylistic or visualization requirements (legends, labeling, formatting) → 10–20 points.
  * Negative criteria for common wrong answers → -10 to -40 points. Phrase negatives as penalties: “Penalizes if …”.
  * Nice-to-have deeper reasoning or optional insights → 5–15 points.
* **Phrasing:** Each criterion must begin with “States…”, “Identifies…”, “Reports…”, “Provides…”, “Includes…”, or “Penalizes if…”.
* **Process criteria:** If included (only when the prompt explicitly asks for reasoning), they should carry very low weight (1–5 points).
* **Open-ended prompts:** Criteria should allow for multiple valid outcomes but still define boundaries of correctness (e.g., “Explains trade-offs between at least two algorithms”).
* **Negative rubrics:** Must penalize plausible, common errors (e.g., wrong variable type, hallucinated value, regression on discrete numbers). Do not invent arbitrary penalties.
* **Nice-to-haves:** Optional criteria that reward depth or nuance without penalizing omission.
* **Scoring:** Every item must end with one of the following:

  * “<points> points · must have criteria”
  * “<points> points · nice to have criteria”
  * “<points> points · negative criteria”
  * 
Examples:
Prompt: “Provide a bar chart of the number of incidents per year (2019–2024).”

Rubric:
  * Provides a bar chart semantically the same as the attached reference plot. 40 points · must have criteria
  * Includes x-axis covering all years 2019–2024. 25 points · must have criteria
  * Includes y-axis labeled as “Number of Incidents.” 20 points · must have criteria
  * Penalizes if years outside 2019–2024 are included. -20 points · negative criteria

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
