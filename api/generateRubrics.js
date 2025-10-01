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

* **Format:** ONLY a numbered list. No headings, no markdown, no commentary.
* **Atomicity:** One check per item, no overlaps or bundled conditions.
* **Specificity:** Always use exact values, names, labels, numeric results, categories, or counts from the prompt, response, or corrections. Do not write “calculates,” “computes,” or “defines.” Always phrase as what the model **states/reports/provides** in the output.
* **Outcome-focused:** Evaluate only final artefacts (numbers, rows, tables, plots, lists, comparisons). Never grade intermediate methods or operations.
* **Self-contained:** Each item must stand alone. No “see above.”
* **Comprehensive:** Cover every explicit ask, implicit requirement (exclusions, constraints), and observed model failures.
* **Non-redundant:** No duplicate checks. Each requirement appears once only.
* **Missing values:** If a value is requested in the prompt but not present in the model response, use a placeholder in double curly braces (e.g., `{{average_income}}`, `{{player_name}}`) instead of skipping.
* **Stacked rubrics:** For prompts with 10+ list items, create random spot-check criteria (~20% of items, spread beginning/middle/end). Each spot-check must reference the **exact expected value** (or a placeholder if missing).
* **Plots:**

  * Always include a criterion that the chart is semantically the same as the gold/reference.
  * Add separate atomic criteria for axes, variables, labels, categories, and ordering.
  * Ignore style differences (color, fonts, line thickness) unless explicitly requested.
* **Tables:** If the output is a table, require both (a) correct structure (row count, column presence) and (b) specific row values at spot-check positions.
* **Weights:**

  * Critical factual correctness (specific numeric values, exact names) → 30–40 points.
  * Major structure (row counts, plot presence, table columns) → 20–30 points.
  * Secondary details (axis labels, ordering, legends) → 10–20 points.
  * Nice-to-have depth → 5–15 points.
  * Process criteria (only if the prompt explicitly asks for reasoning steps) → 1–5 points.
* **Phrasing:** Each criterion must begin with “States…”, “Identifies…”, “Reports…”, “Provides…”, or “Includes…”.
* **Scoring:** Every item must end with:

  * “<points> points · must have criteria”
  * “<points> points · nice to have criteria”

---
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
