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

* **Format:** ONLY a numbered list. No headings, no markdown, no explanations.
* **Atomicity:** One check per item, no overlaps, no bundled conditions.
* **Specificity:** Always use exact values, labels, names, categories, or ranges from the prompt, model response, or corrections. Avoid vague wording.
* **Outcome-focused:** Evaluate only final outputs (artefacts: numbers, names, plots, lists, comparisons). Do not grade thought processes unless the prompt explicitly requires the model to output reasoning.
* **Self-contained:** Each item must stand alone; do not reference other items (no “see above”).
* **Comprehensive:** Cover all explicit asks, implicit requirements (e.g., exclusions, constraints), and observed model failures.
* **Non-redundant:** Do not duplicate criteria. Each requirement appears once only.
* **Stacked rubrics:**

  * If the prompt asks for a list of 10+ items, create spot-check criteria covering ~20% of the list.
  * Spot checks must be randomly distributed (beginning, middle, end).
  * If all spot checks pass, assume the full list is correct.
* **Plots:**

  * Include a criterion for semantic equivalence to the reference plot.
  * Add separate criteria for axes, labels, variables, and categories.
  * Style differences (color, font, line thickness) are not failures unless explicitly required.

* **Weights:**

  * Critical factual correctness (numeric values, named entities, categorical results) → 30–40 points.
  * Major structural requirements (plots present, comparisons, inclusion/exclusion rules) → 20–30 points.
  * Stylistic or labeling requirements (legends, axis titles, formatting) → 10–20 points.
  * Nice-to-have depth/insight → 5–15 points.
  * Process criteria (only if prompt explicitly asks for reasoning steps) → 1–5 points.
* **Phrasing:** Each criterion must begin with: “States…”, “Identifies…”, “Reports…”, “Provides…”, “Includes…”
* **Scoring:** Every item must end with one of the following:

  * “<points> points · must have criteria”
  * “<points> points · nice to have criteria”
nice to haves are optional
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
