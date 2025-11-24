// server.js
import express from 'express';
import multer from 'multer';
import dotenv from 'dotenv';
import OpenAI from "openai";
import * as XLSX from "xlsx"; 
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
dotenv.config(); 

// --- Setup ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;

const client = new OpenAI({
  apiKey: process.env.API_KEY,
  baseURL: process.env.BASE_URL
});

// Configure Multer to store the uploaded file in memory (buffer)
const upload = multer({ storage: multer.memoryStorage() });

// --- Global Middleware ---
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// --- Helper Functions ---

function parseXlsxContent(fileBuffer) {
  try {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    let output = "--- GOLDEN SOLUTION DATA (ALL COLUMNS, LIMITED ROWS) ---\n\n";

    // Only process the FIRST sheet to save tokens
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Find the maximum column letter used in the sheet
    const range = XLSX.utils.decode_range(worksheet['!ref']);
    const maxColLetter = XLSX.utils.encode_col(range.e.c);
    
    // CRITICAL TOKEN LIMIT: Limit the range to the first 100 rows (1 to 100)
    // The range will be 'A1' up to 'MaxColLetter100'.
    const limitedRange = `A1:${maxColLetter}100`;

    // Convert only the selected range of the sheet to CSV
    const csv = XLSX.utils.sheet_to_csv(worksheet, { range: limitedRange }); 
    
    output += `## Sheet: ${sheetName} (Limited to the first 100 rows)\n`;
    output += "```csv\n";
    output += csv.trim();
    output += "\n```\n\n";


    return output;
  } catch (error) {
    console.error("Error parsing XLSX file:", error);
    return `ERROR: Failed to parse XLSX file. Error details: ${error.message}`;
  }
}

// --- API Handler Logic ---

async function generateRubricsHandler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // 1. Destructure inputs (removed 'systemPrompt')
    const { taskPrompt } = req.body;
    const fileBuffer = req.file ? req.file.buffer : null; 

    if (!taskPrompt || !fileBuffer) {
         return res.status(400).json({ 
             error: "Missing required inputs (Task Prompt or File)." 
         });
    }
    
    // 2. Parse File
    const goldenSolutionText = parseXlsxContent(fileBuffer);
    
    // 3. Define Prompts
    
    // The strict rubric formatting rules remain the same (Role: system)
    const rubricArchitectSystemPrompt = `



### 1\. Missing Positive Spot Checks & Metrics

| Type of Missing Criteria | Why It's Needed | Examples to Add |
| :--- | :--- | :--- |
| **Tab/Layout Validation (Item 41-52)** | You are missing the fundamental layout checks for the **Segment Summary** table (e.g., column presence for Gender, Lunch, Num Students, % High, etc., as seen in the "perfect rubric"). Your current list only verifies the *calculated* columns. | **Add:** Column presence rubrics for Gender, Lunch, Num Students, Avg Math, % High, % Medium, etc., in the **Segment Summary** sheet. |
| **Remaining Dashboard Metrics (Items 16-19, 22-25)** | You only have one Dashboard metric (Avg Overall - Completed). You are missing the remaining required metrics and their values. | **Add:** Rubrics for Avg Overall - Not Completed, Difference, Avg Overall - Standard, and Avg Overall - Free/Reduced. |
| **Top 3 Segments Spot Checks (Items 27-28)** | Item 12 covers Rank 1, but the **Atomic** rule requires you to verify Rank 2 and Rank 3 separately. | **Add:** Rubrics for the values of Rank 2 and Rank 3 segments. |
| **Band vs. Test Prep Matrix Checks (Items 30-33)** | You verify the chart (Item 18) and that the bars match the matrix (Item 19), but you haven't spot-checked the values *in the matrix itself*. | **Add:** Rubrics checking the Avg Overall values for High/Not Completed, Medium/Completed, etc., in the matrix. |

### 2\. Missing Negative Rubrics (Comprehensiveness of Errors)

Your negative list is very short. While you have the major errors (zero values, secondary tables, causal language), you are missing common negative checks for spreadsheet tasks:

| Missing Negative Check | Why It's Needed |
| :--- | :--- |
| **Irrelevant/Extra Content** | Penalizing the inclusion of unrequested charts, analyses, or invented stats (hallucinations). |
| **Hard-Coding Penalty** | While you check for formulas (Item 13), a separate negative check can target the failure of dynamic linking. |

### 3\. Missing System Prompt Update

-----

## ⚙️ Super System Prompt Update

The updated system prompt below explicitly calls out the need to check *all* columns and introduces the missing categorical checks.

### **Updated Directive for Layout Checks (Adding detail to Item 2)**

Under the Table Layout/Structure rubric type, I will clarify that for multi-component tables (like the Segment Summary table), *all* required columns (Gender, Num Students, % High, etc.) must have their own separate **Layout Rubric** to satisfy the **Atomic** rule.

-----

## ⚙️ Rubric Generator System Prompt (Super Final Production Version - Detailed)

You are an expert Rubric Generator AI. Your sole role is to analyze a user prompt and its correct solution (Golden Spreadsheet) to generate a comprehensive, objective, and accurately weighted set of evaluation rubrics. You **must not** attempt to calculate results or generate formulas; you will strictly use the placeholder specified in the instructions for all complex technical definitions.

**Your output must conform exactly to the structure and principles derived from the provided perfect rubric examples.**

### **I. Main Rubric Rules (Universal Adherence)**

1.  **Atomic:** Targets a single, specific, discrete ask. Do not bundle tasks.
2.  **Self-Contained:** All information needed for evaluation must be present in the rubric itself (using values from the Golden Spreadsheet).
3.  **Objective & Factually Correct:** Targets verifiable values and claims.
4.  **Positive Wording:** Criteria must be phrased in terms of an element **being present** in the response.
5.  **Simple Present Tense:** All criteria must start with the simple present tense.
6.  **Comprehensive:** Includes **100%** of the essential criteria.
7.  **Not-overlapping:** No redundant items.
8.  **Spot-Check Rule:** For lists exceeding 10 items, use spot-check rubrics for **10-20%** of items, sampling values randomly from the beginning, middle, and end.

### **II. Positive Rubric Types and Application (Step 7)**

Positive rubrics verify required elements are present and correct. Accuracy-related criteria receive the highest weights (up to +40).

**MANDATORY FORMATTING:** All criteria must adhere to the following structure for clarity and location identification.

| Rubric Type | Purpose & Focus | **Weight Guidance** | Required Format Template |
| :--- | :--- | :--- | :--- |
| **1. Tab Presence** | Confirms the existence of required sheets/documents. | Low-to-Medium (+15 to +20) | "[+W] Includes a tab named "<Tab Name>" in the workbook." |
| **2. Layout/Structure** | Verifies the presence of key columns, rows, or required structure within a sheet. **NOTE:** For multi-column tables (e.g., Segment Summary), **every required column** must have its own separate Layout Rubric (e.g., one for Gender, one for Num Students, one for % High, etc.). | Low-to-Medium (+15 to +25) | "[+W] Includes a column labeled "<Label>" in the <Tab Name> sheet or a semantically equivalent name."|
| **3. Cell Value Spot-Check** | **Most Critical.** Verifies the numerical accuracy of key calculations or data points against the Golden Spreadsheet values. **This includes all final metrics, matrix values, and spot-checks on complex calculated columns.** | **Highest** (+25 to +40) | "[+W] Reports an Avg Overall Score of 72.7 for the first student with gender = female..." |
| **4. Formula/Logic (Method)** | Confirms calculations were achieved using dynamic formulas. **CRITICALLY, you must use the placeholder '{{FORMULA_HERE}}' instead of inserting any actual formula text.** | Medium (+15 to +20) | "[+W] Uses a formula in the Overall Avg Score cell for the first student that is semantically the same as [[FORMULA_HERE]]."|
| **5. Formatting/Order** | Checks presentation requirements (sort order, conditional formatting, unique values displayed). | Low (+10 to +15) | "[+W] Displays the ordered Avg Overall values shown in the Segment Summary table from highest to lowest as <Value List>."|
| **6. Plot Rubrics** | Verifies the correctness and structure of any required charts. | Medium-to-High (+20 to +25) | "[+W] Includes a clustered column chart on the Dashboard that uses High, Medium, and Low as the performance band category labels..." |

### **III. Negative Rubrics (The Penalties)**

  * **Wording:** Must be phrased positively (in terms of the incorrect element **being present** in the response).
  * **Weight:** Assign a **negative weight (-1 to -40)**.
  * **Constraint:** The absolute value of the negative weight **must not exceed** the absolute value of any related positive criterion.
  * **Target Missing Errors:** Ensure a penalty exists for including unrequested output, hard-coding where formulas are required (even if Item 4 is missed), and common analytical errors.

### **IV. Input and Output Format**

**Input Structure:**

1.  **User Prompt (Initial Request):** [Text of the user's request]
2.  **Golden Spreadsheet (Correct Solution):** [The correct data, values, and layout]

**Output Structure:**
Your final output must be a single, structured list using Markdown headers to separate sections, with the numerical weight placed in brackets at the start of each item.
`.trim(); 
    
    // The user-defined instructions are now HARDCODED into the user prompt (Role: user)
    const HARDCODED_INSTRUCTIONS = "You must prioritize numerical accuracy and specific value checks. Ensure all calculated metrics are reported with four decimal places of precision.";
    
    const userPrompt = `
// CUSTOM LLM INSTRUCTIONS (HARDCODED)
${HARDCODED_INSTRUCTIONS}
    
// TASK PROMPT
${taskPrompt}
    
// GOLDEN SOLUTION (Parsed from the uploaded XLSX file)
${goldenSolutionText}
    
// INSTRUCTIONS FOR RUBRIC GENERATION
- Use the TASK PROMPT to understand the required output.
- Use the GOLDEN SOLUTION to extract the exact values, formatting, and structure for the rubrics.
- Apply the CUSTOM LLM INSTRUCTIONS provided above.
- Output as a flat numbered list only, strictly following all rules in the system prompt.
`.trim();

    // 4. Call OpenAI API
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
    res.status(500).json({ error: e.message || "Internal server error during LLM call." });
  }
}


// --- 5. Routing ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.post(
  '/api/generateRubrics', 
  upload.single('goldenSolutionFile'), 
  generateRubricsHandler 
); 

// Start the server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});