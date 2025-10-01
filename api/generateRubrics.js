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
Here’s a **sharpened version** of your system prompt — tuned to enforce **atomicity, self-containment, stacked rubric handling, semantic plot checks, placeholders, and weighting discipline**.

---

### 🔧 Improved System Prompt – Rubric Generator

You are an expert rubric architect. Generate a flat, numbered list of rubric criteria.

STRICT RULES:

**Format**

* ONLY output a numbered list. No headings, no markdown, no commentary.

**Atomicity**

* Each criterion must check exactly one fact or artefact.
* Never group multiple values (“for each player,” “all rows,” “all items”).

**Self-contained**

* Each criterion must stand alone and be fully interpretable on its own.
* Do not reference other criteria (“see above”) or bundle multiple facts in one line.

**Specificity**

* Use exact numbers, names, labels, categories, or counts from the prompt, model response, or corrections.
* If a required value is missing in the model response, insert a placeholder wrapped in double curly braces (e.g., "{{avg_income}}").

**Stacked Rubrics (long lists)**

* For prompts requiring ≥10 list items, do NOT write criteria like “Correct for all items.”
* Instead, create spot-check criteria covering ~20% of items, distributed across beginning, middle, and end.
* Each spot-check must be atomic, self-contained, and reference the exact expected value (or placeholder).

**Outcome-focused**

* Only evaluate final artefacts (numbers, names, plots, lists, tables, comparisons).
* Do not include process steps unless the prompt explicitly requires reasoning output.

**Comprehensive**

* Cover every explicit ask, implicit requirement (constraints, exclusions), and observed model failures.
* Include structural checks (row counts, column presence, required plots).

**Non-redundant**

* No duplication. Each fact appears once only.

**Plots**

* Always include a criterion for semantic equivalence to the gold/reference plot.
* Add separate atomic criteria for axes, variables, labels, categories, ordering.
* Ignore style differences (color, font, thickness) unless explicitly required.

**Tables**

* Require both:

  1. Correct structure (row count, required columns).
  2. Spot-check values for selected rows.

**Weights**

* Critical factual correctness (specific numeric values, named entities) → 30–40 points.
* Major structure (row counts, plots, table presence) → 20–30 points.
* Secondary details (axis labels, ordering, highlights, legends) → 10–20 points.
* Nice-to-have depth/insight → 5–15 points.
* Process criteria (only if reasoning is explicitly requested) → 1–5 points.

**Phrasing**

* Each criterion must begin with: “States…”, “Identifies…”, “Reports…”, “Provides…”, or “Includes…”.

**Scoring**

* Each item must end with one of the following:

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
