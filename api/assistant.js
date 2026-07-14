import { buildAssistantMessages, describeDeepSeekError, normalizeAssistantPayload } from "./assistant-core.js";
import { getEnvValue } from "./env.js";
import { isPasswordValid } from "./search-core.js";

function sendJson(response, statusCode, body) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
}

function parseAssistantJson(content) {
  if (!content) {
    throw new Error("DeepSeek returned an empty response.");
  }
  return JSON.parse(content);
}

async function callDeepSeek({ apiKey, model, messages }) {
  if (getEnvValue("DEEPSEEK_ALLOW_INSECURE_TLS").toLowerCase() === "true") {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  }

  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      response_format: { type: "json_object" },
      temperature: 0.2,
      stream: false,
    }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error?.message || `DeepSeek request failed with ${response.status}`);
  }

  return parseAssistantJson(body.choices?.[0]?.message?.content);
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  const expectedPassword = getEnvValue("SEARCH_PASSWORD");
  if (!isPasswordValid(request.body?.password, expectedPassword)) {
    sendJson(response, 401, { error: "Incorrect password." });
    return;
  }

  const apiKey = getEnvValue("DEEPSEEK_API_KEY");
  if (!apiKey) {
    sendJson(response, 500, { error: "DEEPSEEK_API_KEY is not configured." });
    return;
  }

  const prompt = String(request.body?.prompt || "").trim();
  if (!prompt) {
    sendJson(response, 400, { error: "Assistant prompt is required." });
    return;
  }

  try {
    const messages = buildAssistantMessages({
      prompt,
      currentDate: new Date().toISOString().slice(0, 10),
      currentFilters: request.body?.currentFilters || {},
      rows: request.body?.rows || [],
      resultCount: request.body?.resultCount,
      conversationHistory: request.body?.conversationHistory || [],
      purpose: request.body?.purpose || "classify",
    });
    const deepSeekPayload = await callDeepSeek({
      apiKey,
      model: getEnvValue("DEEPSEEK_MODEL") || "deepseek-v4-flash",
      messages,
    });
    sendJson(response, 200, normalizeAssistantPayload(deepSeekPayload));
  } catch (error) {
    sendJson(response, 502, { error: describeDeepSeekError(error) });
  }
}
