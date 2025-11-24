// server.js
import express from 'express';
import multer from 'multer';
import dotenv from 'dotenv';
import OpenAI from "openai";
import * as XLSX from "xlsx"; 
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables from .env file
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

// Configure Multer to store the file in memory (buffer)
const upload = multer({ storage: multer.memoryStorage() });

// --- Middleware ---
// CRITICAL FIX: Explicitly parse URL-encoded bodies for text fields, 
// even if Multer is also running. This is a common solution for 'req.body is undefined' errors.
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// --- Helper Functions ---

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

// --- API Handler Logic ---

async function generateRubricsHandler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // req.body should now be populated by Multer (and checked by express.urlencoded)
    const { taskPrompt, systemPrompt } = req.body;
    const fileBuffer = req.file ? req.file.buffer : null; 

    // Error check 
    if (!taskPrompt || !systemPrompt || !fileBuffer) {
         return res.status(400).json({ 
             error: "Missing required inputs (Task Prompt, Custom Instructions, or File)." 
         });
    }
    
    const goldenSolutionText = parseXlsxContent(fileBuffer);
    
    // --- LLM Prompts Setup (Complete System Prompt) ---
    const rubricArchitectSystemPrompt = `
You are an **expert rubric architect**.
Your task is to generate a **flat, numbered list of rubric criteria** that grades whether a model’s response satisfies the requirements of a given prompt.

Rubrics are **answer keys with weights**. They must be **atomic, specific, self-contained, outcome-only, non-redundant, and comprehensive**.

---

## 🚫 Hard Prohibitions
* ❌ Do not write process/reasoning criteria.
* ❌ Do not group or bundle items.
* ❌ Do not use vague words.
* ❌ Do not reference other criteria.
* ❌ Do not skip values. If a value is missing, insert a placeholder in **double curly braces**.
* ❌ Forbidden verbs: computes, calculates, derives, defines, selects, filters, applies, determines, sorts.
* ✅ Allowed verbs: States, Reports, Provides, Identifies, Includes, Labels.

---

## ✅ Strict Rules for Criteria
... (Your full 14 rules, including examples, here) ...
---
## ✅ Final Checklist (before outputting)
...
`.trim(); // Ensure this is the full, robust prompt text

    
    const userPrompt = `
// CUSTOM LLM INSTRUCTIONS (provided by the user in the UI)
${systemPrompt}
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
    // Return 500 status with an error message for the frontend
    res.status(500).json({ error: e.message || "Internal server error" });
  }
}


// --- 5. Routing ---

// Serve the static HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Define the API route
// This must be the last middleware chain for this path
app.post(
  '/api/generateRubrics', 
  upload.single('goldenSolutionFile'), 
  generateRubricsHandler 
); 

// Start the server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});