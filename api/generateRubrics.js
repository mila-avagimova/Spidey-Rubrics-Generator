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

// Helper for ES Modules to get __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- 1. Multer Configuration ---
// Configure Multer to store the file in memory (as a buffer)
// This is required for the 'xlsx' library to read the file data directly.
const upload = multer({ storage: multer.memoryStorage() });

// --- 2. OpenAI Client & XLSX Parser ---
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

// --- 3. The API Handler Logic ---
async function generateRubricsHandler(req, res) {
  try {
    // req.body holds text fields; req.file holds the file buffer
    const { taskPrompt, systemPrompt } = req.body;
    const fileBuffer = req.file ? req.file.buffer : null; 

    if (!taskPrompt || !systemPrompt || !fileBuffer) {
         return res.status(400).json({ error: "Missing Task Prompt, Custom Instructions, or Golden Solution File." });
    }
    
    const goldenSolutionText = parseXlsxContent(fileBuffer);
    
    // --- LLM Prompts Setup ---
    // NOTE: Replace this placeholder with the COMPLETE System Prompt you provided earlier
    const rubricArchitectSystemPrompt = `
You are an **expert rubric architect**.
Your task is to generate a **flat, numbered list of rubric criteria** that grades whether a model’s response satisfies the requirements of a given prompt.
... (PASTE YOUR FULL 14-RULE SYSTEM PROMPT HERE) ...
`.trim(); 
    
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

// --- 4. Express Server Setup ---
const app = express();
const PORT = 3000;

// Serve the static HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Define the API route
// 'goldenSolutionFile' must match the name used in your HTML/JS FormData
app.post(
  '/api/generateRubricsFromXlsx', 
  upload.single('goldenSolutionFile'), // Multer middleware processes the file first
  generateRubricsHandler 
); 

// Start the server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log("Ensure you have replaced the placeholder with your full system prompt in server.js!");
});