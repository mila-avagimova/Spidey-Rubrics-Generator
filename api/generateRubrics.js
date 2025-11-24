// generateRubrics.js

import OpenAI from "openai";
import * as XLSX from "xlsx"; 
import multer from 'multer'; // Required for file uploads

// --- Configuration and Setup ---

// Load environment variables (Vercel loads these automatically, but this is good practice)
// Note: Vercel requires environment variables (API_KEY) to be set in the project settings.

const client = new OpenAI({
  apiKey: process.env.API_KEY, // Reads from environment variables
  baseURL: process.env.BASE_URL
});

// Configure Multer to store the uploaded file in memory (buffer)
// Multer is instantiated here, but the middleware application is done in the handler.
const upload = multer({ storage: multer.memoryStorage() });

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

// --- The Core API Handler ---

// To handle file uploads in a serverless function, we wrap the handler
// with Multer's middleware to process the incoming request stream.
// We then execute the core logic with the processed req object.

export default async function handler(req, res) {
  
  // 1. Method Check
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  
  // 2. File Upload Handling (The Multer middleware execution)
  // This is the critical part to fix the 'req.body is undefined' error.
  // We explicitly run the Multer single file handler here.
  const uploadSingle = upload.single('goldenSolutionFile');
  
  await new Promise((resolve, reject) => {
    uploadSingle(req, res, (err) => {
      if (err) {
        // Handle Multer errors (e.g., file size limits)
        console.error("Multer Error:", err);
        return reject(err);
      }
      resolve();
    });
  });

  // 3. Core Logic Execution
  try {
    // req.body and req.file are now populated by Multer
    const { taskPrompt, systemPrompt } = req.body;
    const fileBuffer = req.file ? req.file.buffer : null; 

    if (!taskPrompt || !systemPrompt || !fileBuffer) {
         return res.status(400).json({ 
             error: "Missing required inputs (Task Prompt, Custom Instructions, or File). Please check the file input." 
         });
    }
    
    const goldenSolutionText = parseXlsxContent(fileBuffer);
    
    // --- LLM Prompts Setup ---
    const rubricArchitectSystemPrompt = `
You are an **expert rubric architect**.
Your task is to generate a **flat, numbered list of rubric criteria** that grades whether a model’s response satisfies the requirements of a given prompt.
... (Your full 14 rules, prohibitions, and examples here) ...
`.trim(); 
    
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
    // Return 500 status with a detailed error message
    res.status(500).json({ error: e.message || "Internal server error during LLM call." });
  }
}