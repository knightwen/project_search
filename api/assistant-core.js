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

const INTENT_ALIASES = {
  search: "search_only",
  presentation: "analyze_current_results",
  search_then_present: "search_then_analyze",
};

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

function summarizeConversationHistory(history = [], limit = 8) {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .slice(-limit)
    .map((entry) => {
      const role = textValue(entry?.role) === "assistant" ? "assistant" : "user";
      const content = textValue(entry?.content);
      return content ? { role, content } : null;
    })
    .filter(Boolean);
}

export function summarizeRowsForAssistant(rows = [], limit = 80) {
  return rows.slice(0, limit).map((row) => {
    const summary = ASSISTANT_ROW_FIELDS.reduce((nextSummary, field) => {
      nextSummary[field] = textValue(row?.[field]);
      return nextSummary;
    }, {});

    Object.entries(row || {}).forEach(([field, value]) => {
      if (!Object.hasOwn(summary, field)) {
        summary[field] = textValue(value);
      }
    });

    return summary;
  });
}

export function normalizeAssistantPayload(payload = {}) {
  const rawIntent = textValue(payload.intent);
  const aliasedIntent = INTENT_ALIASES[rawIntent] || rawIntent;
  const intent = ["search_only", "analyze_current_results", "search_then_analyze", "needs_clarification"].includes(
    aliasedIntent,
  )
    ? aliasedIntent
    : "needs_clarification";
  const normalized = {
    intent,
    message: textValue(payload.message) || "I prepared a response for the current project context.",
  };

  if (intent === "search_only" || intent === "search_then_analyze") {
    normalized.filters = normalizeFilters(payload.filters || {});
  }

  if (intent === "search_then_analyze") {
    normalized.analysisInstruction =
      textValue(payload.analysisInstruction) ||
      textValue(payload.presentationInstruction) ||
      "Summarize the matching project information for a client presentation.";
  }

  if (intent === "needs_clarification") {
    normalized.clarificationQuestion =
      textValue(payload.clarificationQuestion) ||
      textValue(payload.message) ||
      "Which project type or search criteria should I use?";
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
  conversationHistory = [],
  purpose = "classify",
}) {
  const systemContent = `You are WML Project Search Assistant, a multilingual internal assistant dedicated to helping users search, filter, understand, compare, and summarize WML Structural Group project records.

Return strict json only. Do not include markdown.

Classify the user's request into one of these intents:
- search_only: the user clearly wants to find/filter projects, without asking for analysis.
- analyze_current_results: the user wants a client-facing summary, talking points, comparison, or explanation based on the supplied currentResults.
- search_then_analyze: the user asks for summary, analysis, talking points, or presentation content and also gives search criteria, for example "summarize all retaining wall projects".
- needs_clarification: the user asks for analysis but gives no usable search criteria and currentResults is empty.

For search filters, only use these keys:
- keywordText
- projectIdText
- clientText
- managerText
- startDateFrom
- startDateTo

Use Start Date for date logic. Interpret relative dates from the current date supplied by the user message. Return dates as YYYY-MM-DD when known.

Language rules:
- Understand multilingual user prompts.
- Use the user's requested language for natural-language output fields such as message, clarificationQuestion, and analysis content.
- If the user does not explicitly request an output language, reply in the same language as the user's latest prompt.
- Keep JSON keys, filter values, project names, client names, manager names, dates, and technical identifiers unchanged unless the user explicitly asks to translate wording.
- Keep analysisInstruction clear for the follow-up analysis step and write it in the requested language when the user specifies one.

For multiple alternatives in the same filter field, join them with " | ". Example: if the user asks for Stephen's and Jing's jobs, return managerText "StephenWoodhouse | Jing". The search engine treats pipe-separated values as OR matches within that field.

Manager aliases:
- stephen, steve, stephen woodhouse -> StephenWoodhouse
- jing, jing zhang -> Jing
- robert, rob, robert jarman -> RobertJarman
- nicholas, nick, nicholas mills -> NicholasMills

For analysis content, write polished client-facing language from the supplied project information. Treat generic summary requests as requests to summarize the supplied project records. Include relevant details from all available project fields, especially Project Profile and Description, but do not expose sensitive internal phrasing unnecessarily. When producing analysis, summaries, client-ready wording, talking points, or presentation content, write from WML's first-person institutional perspective where natural. Prefer phrasing equivalent to "WML has delivered...", "We have supported...", and "Our experience includes..." in the selected response language instead of detached third-person wording.

Routing rules:
- If purpose is analyze_results, do not classify. Return intent "analyze_current_results" and generate the actual analysis from currentResults.
- If the user asks to summarize/analyze/present and includes search criteria, return intent "search_then_analyze", filters, and analysisInstruction.
- If the user asks to summarize/analyze/present with no search criteria but currentResults has records, return intent "analyze_current_results".
- If the user asks to summarize/analyze/present with no search criteria and currentResults is empty, return intent "needs_clarification" with clarificationQuestion.
- Use conversationHistory only for follow-up wording such as "them", "that", "make it shorter", or "rewrite". New search criteria in the prompt override prior case context.
- Do not return status messages such as "Summarizing..." as the final message for analyze_current_results. Generate the actual summary.

Example json:
{
  "intent": "search_then_analyze",
  "filters": {
    "keywordText": "bridge inspection",
    "projectIdText": "",
    "clientText": "",
    "managerText": "",
    "startDateFrom": "2016-06-19",
    "startDateTo": "2026-06-19"
  },
  "message": "Searching for bridge inspection projects from the last 10 years.",
  "analysisInstruction": "Summarize the matching bridge inspection project information for a client presentation, including Project Profile and Description."
}`;

  const userContent = JSON.stringify(
    {
      purpose,
      currentDate,
      prompt,
      currentFilters: normalizeFilters(currentFilters),
      conversationHistory: summarizeConversationHistory(conversationHistory),
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
