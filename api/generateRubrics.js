// generateRubrics.js
import OpenAI from "openai";
import * as XLSX from "xlsx"; 

// NOTE: This file contains only the handler logic. 
// It relies on server.js to handle environment variables, Express setup, and Multer.

const client = new OpenAI({
  apiKey: process.env.API_KEY,
  baseURL: process.env.BASE_URL
});

/**
 * Converts an Excel file buffer into a structured, LLM-readable text string.
 */
function parseXlsxContent(fileBuffer) {
  try {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    let output = "--- GOLDEN SOLUTION DATA (PARSED XLSX) ---\n\n";

    workbook.SheetNames.forEach(sheetName => {
      const worksheet = workbook.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(worksheet);
      
      output += `## Sheet: ${sheetName}\n`;
      output += "```csv\n";
      output += csv.trim();
      output += "\n```\n\n";
    });

    return output;
  } catch (error) {
    console.error("Error parsing XLSX file:", error);
    return `ERROR: Failed to parse XLSX file. Error details: ${error.message}`;
  }
}

// --- The API Handler ---

export default async function generateRubricsHandler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { taskPrompt, systemPrompt } = req.body;
    // Multer places the file buffer here:
    const fileBuffer = req.file ? req.file.buffer : null; 

    if (!taskPrompt || !systemPrompt || !fileBuffer) {
         // Return 400 Bad Request if mandatory inputs are missing
         return res.status(400).json({ error: "Missing Task Prompt, Custom Instructions, or Golden Solution File." });
    }
    
    // 1. Parse the XLSX file buffer
    const goldenSolutionText = parseXlsxContent(fileBuffer);
    
    // 2. Setup LLM Prompts
    // --- The Fixed, Detailed Rubric Rules System Prompt ---
    const rubricArchitectSystemPrompt = `
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

### 3. Self-contained

* Every criterion must stand alone.
* Repeat dataset subsets, variables, and formatting requirements.

### 4. Specificity

* Always use exact values, names, labels, categories, and formatting.

### 5. Outcome-only

* Grade only the final output (tables, rows, values, plots, labels, lists).
* Never describe the reasoning or steps to get there.

### 6. Stacked Rubrics (Lists ≥10 items)

* Do not grade every element.
* Spot-check ~20% of items, distributed across beginning, middle, and end.

### 7. Tables

* Require table structure (row count + required columns).
* Then add spot-check criteria for values.

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

* Cover: All explicit asks in the prompt. Implicit requirements (e.g., exclusions, constraints).

### 10. Non-redundancy

* Each fact/artifact appears once only.

### 11. Placeholders

* If a value is missing, insert "{{placeholder_name}}".

### 12. Weights

* 30–40 → Critical factual correctness (numbers, named entities).
* 20–30 → Major structure (tables, required plots).
* 10–20 → Secondary details (axis labels, ordering, highlights).
* 5–15 → Nice-to-have depth or nuance.
* 1–5 → Reasoning steps (only if explicitly requested).

### 13. Phrasing

* Every criterion must start with one of: States…, Reports…, Provides…, Identifies…, Includes…, Labels….

### 14. Scoring

* Every item must end with: “<points> points · must have criteria” or “<points> points · nice to have criteria”

---

## ✅ Final Checklist (before outputting)

* [ ] Is every criterion **atomic**?
* [ ] Is every criterion **self-contained**?
* [ ] Is every criterion **specific**?
* [ ] Is every criterion **outcome-only**?
* [ ] Are placeholders "{{like_this}}" used when values are missing?
* [ ] Does each criterion start with an allowed verb?
* [ ] Does each criterion end with correct scoring format?
* [ ] Are there **no redundancies**?
`.trim(); 
    
    // --- User Prompt (Contextual instructions and data) ---
    const userPrompt = `
// CUSTOM LLM INSTRUCTIONS (provided by the user in the UI)
${systemPrompt}
    
---
    
// TASK PROMPT (The original question/request)
${taskPrompt}
    
---
    
// GOLDEN SOLUTION (Parsed from the uploaded XLSX file)
${goldenSolutionText}
    
---
    
// INSTRUCTIONS FOR RUBRIC GENERATION
- Use the TASK PROMPT to understand the required output.
- Use the GOLDEN SOLUTION to extract the exact values, formatting, and structure for the rubrics.
- Apply the CUSTOM LLM INSTRUCTIONS provided above.
- Output as a flat numbered list only, strictly following all rules in the system prompt.
`.trim();

    // 3. Call OpenAI API
    const completion = await client.chat.completions.create({
      model: process.env.MODEL || "gpt-4o",
      temperature: 0,
      messages: [
        { role: "system", content: rubricArchitectSystemPrompt },
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