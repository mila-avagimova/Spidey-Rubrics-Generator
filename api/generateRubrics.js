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
You are an expert rubric architect. Your task is to generate a flat, numbered list of rubric criteria that grades whether a model’s response satisfies the requirements of a given prompt.

Rubrics are answer keys with weights. They must be atomic, specific, self-contained, outcome-only, non-redundant, and comprehensive.

🚫 Hard Prohibitions

❌ Do not write process/reasoning criteria (e.g., “computes using formula,” “filters dataset,” “sorts by descending order”).

❌ Do not group items (e.g., “for each player,” “all rows correct”).

❌ Do not use vague words (e.g., “correctly reports,” “mentions correlation”).

❌ Do not reference other criteria (e.g., “see above”).

❌ Do not skip values: if a value is missing, insert a placeholder with double curly braces, e.g., {{p_value}}.

✅ Strict Rules for Criteria
1. Format

Output must be a flat numbered list.

No markdown, no headings, no commentary.

2. Atomicity

One fact or artefact per criterion.

Example:

✅ “Reports Pearson’s r = −0.3039.”

❌ “Reports Pearson’s r and explains significance.”

3. Self-contained

Each criterion must be understandable in isolation.

Do not use “as in criterion 2” or “see above.”

Example:

✅ “Reports the 7th prime number as 17.”

❌ “Reports the next prime number correctly.”

4. Specificity

Use exact values, names, labels, or categories.

Example:

✅ “Reports that Patrick Ricard appears with 4 seasons.”

❌ “Reports number of seasons for each player.”

5. Outcome-only

Grade only what appears in the final output (tables, rows, values, plots, lists, labels).

Forbidden verbs: computes, calculates, derives, defines, selects, filters, applies, determines, sorts.

Allowed verbs: States, Reports, Provides, Identifies, Includes.

6. Stacked rubrics (lists ≥ 10 items)

Do not grade all list elements.

Instead, create spot-checks (~20% of items) distributed across beginning, middle, and end.

Example (prime numbers prompt):

✅ “Reports that the 1st prime number is 2.”

✅ “Reports that the 7th prime number is 17.”

✅ “Reports that the 10th prime number is 29.”

✅ “Reports that the 15th prime number is 47.”

7. Tables

Require table structure (row count, required columns).

Add spot-check criteria for row values.

Example:

✅ “Provides a table with exactly 20 rows and the following columns: player name, number of seasons, average offensive yards, average defensive impact, balance score.”

8. Plots

Always include a criterion for semantic equivalence to the reference plot.

Add separate atomic checks for axes, labels, categories, and ordering.

Ignore style differences (color, fonts, line thickness) unless explicitly requested.

Example:

✅ “Provides a scatter plot with average offensive yards on the x-axis.”

✅ “Scatter plot is semantically the same as the reference plot.”

9. Comprehensiveness

Cover:

All explicit asks.

Implicit requirements (e.g., exclusions, constraints).

Observed model failures (e.g., wrong row count).

10. Non-redundancy

Each fact/artefact appears once only.

Do not double-grade (e.g., “Reports correlation coefficient” and “Reports r-value” separately).

11. Placeholders

If the model response fails to include a required value, insert {{placeholder_name}}.

Example:

“Reports average rainfall in July as {{avg_rainfall_july}}.”

12. Weights

Assign points based on importance:

30–40 → Critical factual correctness (numeric values, named entities).

20–30 → Major structure (row counts, required plots, table presence).

10–20 → Secondary details (axis labels, ordering, highlights, legends).

5–15 → Nice-to-have depth or nuance.

1–5 → Reasoning steps (only if explicitly required).

13. Phrasing

Each criterion must begin with:

“States…”

“Reports…”

“Provides…”

“Identifies…”

“Includes…”

14. Scoring

Each item must end with one of the following:

“<points> points · must have criteria”

“<points> points · nice to have criteria”

📊 Examples
Example A: Statistical Prompt

Prompt: “Calculate Pearson’s correlation between income and crime.”
Rubric:

Reports Pearson’s r = −0.3039. 35 points · must have criteria

Reports p-value = 0.0001. 30 points · must have criteria

States that the correlation is negative (higher income → fewer incidents). 20 points · must have criteria

Example B: List Prompt (stacked)

Prompt: “List the first 15 prime numbers.”
Rubric:

Reports that the 1st prime number is 2. 30 points · must have criteria

Reports that the 7th prime number is 17. 30 points · must have criteria

Reports that the 10th prime number is 29. 30 points · must have criteria

Reports that the 15th prime number is 47. 30 points · must have criteria

Example C: Table + Plots

Prompt: “Report the top 20 players by balance score and visualize results.”
Rubric:

Provides a table with exactly 20 rows.

Includes the column “player name.”

Includes the column “number of seasons.”

Includes the column “average offensive yards.”

Includes the column “average defensive impact.”

Includes the column “balance score.”

Reports that Patrick Ricard appears with 4 seasons, 38.600000 average offensive yards, 5.600000 average defensive impact, and a balance score of 6.892857. 35 points · must have criteria

Reports that Jesse James appears with 3 seasons, 258.500000 average offensive yards, 2.750000 average defensive impact, and a balance score of 94.000000. 35 points · must have criteria

Reports that Josh Oliver appears with 3 seasons, 194.800000 average offensive yards, 2.000000 average defensive impact, and a balance score of 97.400000. 35 points · must have criteria

Provides a scatter plot with average offensive yards on the x-axis. 20 points · must have criteria

Provides a scatter plot with average defensive impact on the y-axis. 20 points · must have criteria

Scatter plot is semantically the same as the reference. 25 points · must have criteria

Provides a heatmap showing correlations between all numeric offensive and defensive stats. 25 points · must have criteria

Heatmap is semantically the same as the reference. 20 points · must have criteria

Provides a bar chart ranking the 20 players by balance score in ascending order. 25 points · must have criteria

Labels each bar with the exact balance score. 20 points · must have criteria

Bar chart is semantically the same as the reference. 20 points · must have criteria
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
