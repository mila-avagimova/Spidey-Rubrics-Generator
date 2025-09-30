// tests/run-rubric-tests.mjs
// Runs rubric-generation tests in-process (no HTTP). Prints ONLY the final rubric.

import handler from "../api/generateRubrics.js";

// Minimal mock req/res for calling the Next/Express-style handler directly.
function callHandler(body) {
  return new Promise((resolve) => {
    const req = { method: "POST", body };
    const res = {
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        resolve({ status: this.statusCode || 200, payload });
      },
      setHeader() {},
    };
    handler(req, res);
  });
}

// ---------- Tests ----------
// 1) “video-game store snapshot for 2021” Mongo test
const testMongoSnapshot = {
  name: "Mongo Snapshot 2021 — revenue, member customers, avg delivery time",
  body: {
    taskPrompt:
      "I just left a meeting with my boss, and I need to make a report about a snapshot from our video-game store data. Our company needs to pivot the strategy, so we will evaluate some data from 2021, which was the year we started a new plan. So, I need the revenue, member customers, and the average delivery time for that year.",
    tool_calls: [
      {
        name: "mongodb.mongodb_list",
        purpose: "discover the proper database",
        params: [],
      },
      {
        name: "mongodb.mongodb_collection-schema",
        purpose: "enumerate collections in the video_game_store database",
        params: [
          { key: "database", example: "video_game_store" },
          { key: "collection", example: "Purchase History" },
        ],
      },
      {
        name: "mongodb.mongodb_collection-schema",
        purpose: "inspect the Purchase History collection",
        params: [
          { key: "database", example: "video_game_store" },
          { key: "collection", example: "Purchase History" },
        ],
      },
      {
        name: "mongodb.mongodb_collection-schema",
        purpose: "inspect the Customers collection",
        params: [
          { key: "database", example: "video_game_store" },
          { key: "collection", example: "Customers" },
        ],
      },
    ],
  },
};

// 2) India First Amendment — which articles + years to 106th
const testIndiaFirstAmendment = {
  name:
    "India First Constitutional Amendment — list altered articles + years until 106th",
  body: {
    taskPrompt:
      "I came across a reference that the first constitutional amendment in India introduced changes related to land reform laws. Could you tell me which articles were altered in that amendment, and then calculate how many years later the 106th amendment was enacted?",
    tool_calls: [
      {
        name: "oxylabs.oxylabs_google_search_scraper",
        purpose: "Find information on first constitutional amendment of India",
        params: [{ key: "query", example: "first constitutional amendment of India" }],
      },
      {
        name: "oxylabs.oxylabs_google_search_scraper",
        purpose:
          "Scrape a website to find the articles which were modified during the first constitutional amendment of India",
        params: [
          {
            key: "url",
            example:
              "https://en.wikipedia.org/wiki/First_Amendment_of_the_Constitution_of_India",
          },
        ],
      },
    ],
  },
};

async function runOne(test) {
  const { status, payload } = await callHandler(test.body);
  if (status !== 200) {
    console.error(`\n[${test.name}] ERROR (${status})`);
    console.error(payload);
    return;
  }
  const { rubrics, modelUsed } = payload || {};
  console.log(`\n===== ${test.name} =====`);
  if (modelUsed) console.log(`(model: ${modelUsed})`);
  console.log(rubrics || "(no rubric text)");
}

async function main() {
  const tests = [testMongoSnapshot, testIndiaFirstAmendment];
  for (const t of tests) {
    await runOne(t);
  }
}

main().catch((e) => {
  console.error("Test runner crashed:", e);
  process.exit(1);
});
