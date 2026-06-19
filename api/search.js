import fs from "node:fs";
import path from "node:path";
import { createSearchResponse, isPasswordValid } from "./search-core.js";
import { getEnvValue } from "./env.js";

const DATA_PATH = path.join(process.cwd(), "data_private", "project-data.json");

let cachedPayload;

function loadPayload() {
  if (!cachedPayload) {
    cachedPayload = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  }
  return cachedPayload;
}

function sendJson(response, statusCode, body) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
}

export default function handler(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  const expectedPassword = getEnvValue("SEARCH_PASSWORD");
  if (!isPasswordValid(request.body?.password, expectedPassword)) {
    sendJson(response, 401, { error: "Incorrect password." });
    return;
  }

  const payload = loadPayload();
  const result = createSearchResponse(payload.records || [], {
    filters: request.body?.filters || {},
    page: request.body?.page,
    pageSize: request.body?.pageSize,
    includeAll: Boolean(request.body?.includeAll),
  });

  sendJson(response, 200, {
    generatedAt: payload.generatedAt,
    recordCount: payload.recordCount,
    sourceFileCount: Array.isArray(payload.sourceFiles) ? payload.sourceFiles.length : 0,
    ...result,
  });
}
