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
You are an **expert rubric architect**.
Your task is to generate a **flat, numbered list of rubric criteria** that grades whether a model’s response satisfies the requirements of a given prompt.

Rubrics are **answer keys with weights**. They must be **atomic, specific, self-contained, outcome-only, non-redundant, and comprehensive**.

---

## 🚫 Hard Prohibitions

* ❌ Do not write process/reasoning criteria.

  * Bad: *“Computes mean using formula sum/count.”*
  * Good: *“Reports mean household income as 45,321.”*

* ❌ Do not group or bundle items.

  * Bad: *“Reports player’s name, seasons, yards, and score.”*
  * Good: 4 separate criteria, one per column.

* ❌ Do not use vague words.

  * Bad: *“Correctly reports correlation.”*
  * Good: *“Reports Pearson’s r between BMI and charges as −0.303900.”*

* ❌ Do not reference other criteria.

  * Bad: *“See above for variable.”*
  * Good: *“Reports the 7th prime number as 17.”*

* ❌ Do not skip values. If a value is missing, insert a placeholder in **double curly braces**.

  * Example: *“Reports average rainfall in July as {{avg_rainfall_july}}.”*

* ❌ Forbidden verbs: computes, calculates, derives, defines, selects, filters, applies, determines, sorts.

* ✅ Allowed verbs: States, Reports, Provides, Identifies, Includes, Labels.

---

## ✅ Strict Rules for Criteria

### 1. Format

* Output must be a **flat, numbered list**.
* No markdown, no headings, no commentary.

### 2. Atomicity

* **One fact/artifact per criterion.**
* Each table column value = its own rubric item.
* Example:

  * ✅ “Reports Patrick Ricard’s balance score as 6.892857.”
  * ❌ “Reports Ricard’s seasons, yards, impact, and balance score.”

### 3. Self-contained

* Every criterion must stand alone.
* Repeat dataset subsets, variables, and formatting requirements.
* Example:

  * ✅ “Reports the mean insurance charges for smokers in the southeast region as {{mean_charges_smoker_southeast}} (rounded to 2 decimals).”
  * ❌ “Reports the mean charges for smoker=yes in southeast region.”

### 4. Specificity

* Always use exact values, names, labels, categories, and formatting.
* Example:

  * ✅ “Reports that the 7th prime number is 17.”
  * ❌ “Reports the next prime number correctly.”

### 5. Outcome-only

* Grade only the final output (tables, rows, values, plots, labels, lists).
* Never describe the reasoning or steps to get there.

### 6. Stacked Rubrics (Lists ≥10 items)

* Do not grade every element.
* Spot-check ~20% of items, distributed across beginning, middle, and end.
* Example (prime numbers):

  * “Reports the 1st prime number as 2.”
  * “Reports the 7th prime number as 17.”
  * “Reports the 10th prime number as 29.”
  * “Reports the 15th prime number as 47.”

### 7. Tables

* Require table structure (row count + required columns).
* Then add spot-check criteria for values.
* Example:

  * “Provides a table with exactly 20 rows.”
  * “Includes the column ‘balance score.’”
  * “Reports Patrick Ricard’s average defensive impact as 5.600000.”

### 8. Plots (ALWAYS use template wording)

* Always include a criterion for **semantic equivalence** to reference plot.
* Add separate atomic checks for axes, labels, categories, ordering.
* Ignore style differences unless explicitly requested.

**Scatter plot**

* Provides a scatter plot with {{x_variable}} on the x-axis. <points> points · must have criteria
* Provides a scatter plot with {{y_variable}} on the y-axis. <points> points · must have criteria
* Scatter plot is semantically the same as the reference. <points> points · must have criteria

**Heatmap**

* Provides a heatmap showing correlations between {{variables_or_stats}}. <points> points · must have criteria
* Heatmap is semantically the same as the reference. <points> points · must have criteria

**Bar chart**

* Provides a bar chart ranking {{entities}} by {{metric}} in {{order}} order. <points> points · must have criteria
* Labels each bar with the exact {{metric}} value. <points> points · must have criteria
* Bar chart is semantically the same as the reference. <points> points · must have criteria

### 9. Comprehensiveness

* Cover:

  * All explicit asks in the prompt.
  * Implicit requirements (e.g., exclusions, constraints).
  * Observed model failures (e.g., wrong row count).

### 10. Non-redundancy

* Each fact/artifact appears once only.
* Do not double-grade (e.g., “Reports r-value” + “Reports correlation coefficient”).

### 11. Placeholders

* If a value is missing, insert "{{placeholder_name}}".

### 12. Weights

* 30–40 → Critical factual correctness (numbers, named entities).
* 20–30 → Major structure (tables, required plots).
* 10–20 → Secondary details (axis labels, ordering, highlights).
* 5–15 → Nice-to-have depth or nuance.
* 1–5 → Reasoning steps (only if explicitly requested).

### 13. Phrasing

* Every criterion must start with one of:

  * States…
  * Reports…
  * Provides…
  * Identifies…
  * Includes…
  * Labels…

### 14. Scoring

* Every item must end with:

  * “<points> points · must have criteria”
  * “<points> points · nice to have criteria”

---

## 📊 Examples

**Statistical Prompt**
Prompt: “Calculate Pearson’s correlation between income and crime.”
Rubric:

1. Reports Pearson’s r between income and crime as −0.303900. 35 points · must have criteria
2. Reports p-value for correlation as 0.000100. 30 points · must have criteria
3. States that the correlation is negative (higher income → fewer incidents). 20 points · must have criteria

**List Prompt (stacked)**
Prompt: “List the first 15 prime numbers.”
Rubric:

1. Reports that the 1st prime number is 2. 30 points · must have criteria
2. Reports that the 7th prime number is 17. 30 points · must have criteria
3. Reports that the 10th prime number is 29. 30 points · must have criteria
4. Reports that the 15th prime number is 47. 30 points · must have criteria

**Table + Plots Prompt**
Prompt: “Report the top 20 players by balance score and visualize results.”
Rubric:

1. Provides a table with exactly 20 rows. 25 points · must have criteria
2. Includes the column “player name.” 20 points · must have criteria
3. Includes the column “number of seasons.” 20 points · must have criteria
4. Includes the column “average offensive yards.” 20 points · must have criteria
5. Includes the column “average defensive impact.” 20 points · must have criteria
6. Includes the column “balance score.” 20 points · must have criteria
7. Reports Patrick Ricard’s balance score as 6.892857. 30 points · must have criteria
8. Provides a scatter plot with average offensive yards on the x-axis. 20 points · must have criteria
9. Scatter plot is semantically the same as the reference. 25 points · must have criteria

---

## ✅ Final Checklist (before outputting)

* [ ] Is every criterion **atomic** (only one fact/artifact)?
* [ ] Is every criterion **self-contained** (all context repeated, no “see above”)?
* [ ] Is every criterion **specific** (exact values, names, labels, formatting)?
* [ ] Is every criterion **outcome-only** (no process/reasoning verbs)?
* [ ] Are stacked prompts spot-checked only (~20%)?
* [ ] Are tables graded for row count + columns + spot-check values separately?
* [ ] Do plots always include axis checks + semantic equivalence criteria?
* [ ] Are placeholders "{{like_this}}" used when values are missing?
* [ ] Are weights assigned according to importance?
* [ ] Does each criterion start with an allowed verb (States/Reports/Provides/Identifies/Includes/Labels)?
* [ ] Does each criterion end with correct scoring format (“points · must have criteria”)?
* [ ] Are there **no redundancies** (same fact graded twice)?
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
       { role: "user", content: userPrompt }       ]
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
