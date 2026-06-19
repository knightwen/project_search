const FILTER_KEYS = [
  "keywordText",
  "projectIdText",
  "clientText",
  "managerText",
  "startDateFrom",
  "startDateTo",
];

const ASSISTANT_ROW_FIELDS = [
  "Project ID",
  "Project Name",
  "Client",
  "Manager",
  "Start Date",
  "Industry/Sector",
  "Project Profile",
  "Description",
  "Key Words",
  "City",
  "Project Address",
];

function textValue(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim();
}

function normalizeFilters(filters = {}) {
  return FILTER_KEYS.reduce((next, key) => {
    next[key] = textValue(filters[key]);
    return next;
  }, {});
}

export function summarizeRowsForAssistant(rows = [], limit = 80) {
  return rows.slice(0, limit).map((row) =>
    ASSISTANT_ROW_FIELDS.reduce((summary, field) => {
      summary[field] = textValue(row?.[field]);
      return summary;
    }, {}),
  );
}

export function normalizeAssistantPayload(payload = {}) {
  const intent = ["search", "presentation", "search_then_present"].includes(payload.intent)
    ? payload.intent
    : "presentation";
  const normalized = {
    intent,
    message: textValue(payload.message) || "I prepared a response for the current project context.",
  };

  if (intent === "search" || intent === "search_then_present") {
    normalized.filters = normalizeFilters(payload.filters || {});
  }

  if (intent === "search_then_present") {
    normalized.presentationInstruction =
      textValue(payload.presentationInstruction) ||
      "Summarize the matching projects for a client presentation.";
  }

  return normalized;
}

export function describeDeepSeekError(error) {
  const message = textValue(error?.message) || "request failed";
  const cause = error?.cause;
  const causeMessage = textValue(cause?.message);
  const causeCode = textValue(cause?.code);

  if (causeCode || causeMessage) {
    const details = causeCode && causeMessage ? `${causeCode}: ${causeMessage}` : causeCode || causeMessage;
    return `DeepSeek request failed: ${message} (${details})`;
  }

  return `DeepSeek request failed: ${message}`;
}

export function buildAssistantMessages({
  prompt,
  currentDate,
  currentFilters = {},
  rows = [],
  purpose = "classify",
}) {
  const systemContent = `You are an English-only AI Assistant for an internal WML Structural Group project search app.

Return strict json only. Do not include markdown.

Classify the user's request into one of these intents:
- search: the user clearly wants to find/filter projects.
- presentation: the user wants a client-facing summary, talking points, or explanation based on current results.
- search_then_present: the user wants to find/filter projects and then summarize or present them.

For search filters, only use these keys:
- keywordText
- projectIdText
- clientText
- managerText
- startDateFrom
- startDateTo

Use Start Date for date logic. Interpret relative dates from the current date supplied by the user message. Return dates as YYYY-MM-DD when known.

For presentation content, write polished client-facing English. You may use all supplied project fields as context, but do not expose sensitive internal phrasing unnecessarily.

If purpose is presentation_only, return intent "presentation".

Example json:
{
  "intent": "search_then_present",
  "filters": {
    "keywordText": "bridge inspection",
    "projectIdText": "",
    "clientText": "",
    "managerText": "",
    "startDateFrom": "2016-06-19",
    "startDateTo": "2026-06-19"
  },
  "message": "Searching for bridge inspection projects from the last 10 years.",
  "presentationInstruction": "Summarize the matching bridge inspection projects for a client presentation."
}`;

  const userContent = JSON.stringify(
    {
      purpose,
      currentDate,
      prompt,
      currentFilters: normalizeFilters(currentFilters),
      currentResultCount: rows.length,
      currentResults: summarizeRowsForAssistant(rows),
    },
    null,
    2,
  );

  return [
    { role: "system", content: systemContent },
    { role: "user", content: userContent },
  ];
}
