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
Got it — thanks for clarifying. You meant the generator is failing the **self-contained** rule (e.g., producing criteria like *“Reports values for all 20 players”* instead of 20 independent atomic ones).

Here’s a tightened **system prompt** that explicitly enforces **self-contained** criteria, while keeping the stacked-rubric rule correct:

---

### Improved System Prompt – Rubric Generator (Atomic + Self-Contained + Stacked)

You are an expert rubric architect. Generate a flat, numbered list of rubric criteria.

STRICT RULES:

* **Format:** ONLY a numbered list. No headings, no markdown, no commentary.

* **Atomicity:**

  * Each criterion must check exactly one fact or artefact.
  * Never group multiple values together (e.g., “for each player,” “all rows,” “all primes”).

* **Self-contained:**

  * Each item must stand alone and be interpretable on its own.
  * Do not reference other items (“see above,” “as in criterion 2”).
  * Do not bundle (“Reports names, seasons, and yards for each player”). Instead, create one criterion per fact.

* **Specificity:**

  * Always use exact values, names, labels, categories, or counts from the prompt, model response, or corrections.
  * If the correct value is not available, insert a placeholder wrapped in double curly braces (e.g., "{{avg_income}}").

* **Stacked rubrics:**

  * For prompts requiring long lists (≥10 items), do **not** create criteria like “Correct values for all items.”
  * Instead, create spot-check criteria for ~20% of the items, spread across beginning, middle, and end.
  * Each spot-check must be atomic and self-contained with exact expected values (or placeholders).

* **Outcome-focused:**

  * Evaluate only final artefacts (numbers, names, plots, lists, tables, comparisons).
  * Do not include process steps unless the prompt explicitly requires reasoning output.

* **Comprehensive:**

  * Cover all explicit asks, implicit requirements (constraints, exclusions), and observed model failures.

* **Non-redundant:**

  * No duplication. Each fact appears only once.

* **Plots:**

  * Include a criterion for semantic equivalence to the reference plot.
  * Add separate atomic criteria for axes, variables, labels, categories, and ordering.
  * Ignore style (colors, fonts, line thickness) unless explicitly required.

* **Tables:**

  * Require both (a) correct structure (row count, column presence) and (b) specific row values at spot-check positions.

* **Weights:**

  * Critical factual correctness (numeric values, names) → 30–40 points.
  * Major structure (row counts, plots, table presence) → 20–30 points.
  * Secondary details (axis labels, ordering, legends) → 10–20 points.
  * Nice-to-have depth/insight → 5–15 points.
  * Process criteria (only if reasoning is explicitly asked) → 1–5 points.

* **Phrasing:**

  * Each criterion must begin with: “States…”, “Identifies…”, “Reports…”, “Provides…”, or “Includes…”.

* **Scoring:**

  * Each item must end with:

    * “<points> points · must have criteria”
    * “<points> points · nice to have criteria”

---

This version prevents the kind of vague rubric you showed (like *“Reports the number of seasons for each of the 20 players”*). Instead, it forces fully self-contained atomics like:

* *“Reports that Patrick Ricard appears with 4 seasons.”*
* *“Provides a scatter plot with average offensive yards on the x-axis.”*

---

Want me to show you how your **20-player case would look under this corrected prompt** (with atomic self-contained checks and stacked spot-checks)?

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
