import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildAssistantMessages,
  describeDeepSeekError,
  normalizeAssistantPayload,
  summarizeRowsForAssistant,
} from "./assistant-core.js";

describe("assistant core", () => {
  it("normalizes search intent filters returned by DeepSeek", () => {
    const payload = normalizeAssistantPayload({
      intent: "search_only",
      filters: {
        keywordText: "bridge inspection",
        clientText: "  Brookfield ",
        startDateFrom: "2016-06-19",
        startDateTo: "2026-06-19",
        ignored: "value",
      },
      message: "Searching for bridge inspection projects.",
    });

    assert.deepEqual(payload, {
      intent: "search_only",
      filters: {
        keywordText: "bridge inspection",
        projectIdText: "",
        clientText: "Brookfield",
        managerText: "",
        startDateFrom: "2016-06-19",
        startDateTo: "2026-06-19",
      },
      message: "Searching for bridge inspection projects.",
    });
  });

  it("normalizes presentation intent text without filters", () => {
    const payload = normalizeAssistantPayload({
      intent: "analyze_current_results",
      message: "These projects demonstrate relevant bridge inspection experience.",
    });

    assert.equal(payload.intent, "analyze_current_results");
    assert.equal(payload.message, "These projects demonstrate relevant bridge inspection experience.");
    assert.equal(payload.filters, undefined);
  });

  it("normalizes search then analyze intent with analysis instruction", () => {
    const payload = normalizeAssistantPayload({
      intent: "search_then_analyze",
      filters: { keywordText: "facade inspection" },
      message: "Searching first, then preparing a client summary.",
      analysisInstruction: "Summarize the matching projects for a client meeting.",
    });

    assert.equal(payload.intent, "search_then_analyze");
    assert.equal(payload.filters.keywordText, "facade inspection");
    assert.equal(payload.analysisInstruction, "Summarize the matching projects for a client meeting.");
  });

  it("summarizes rows using presentation-relevant fields", () => {
    const rows = [
      {
        "Project ID": "1200",
        "Project Name": "Bridge inspection",
        Client: "City Council",
        Manager: "Jane Smith",
        "Start Date": "2021-03-15",
        Description: "Detailed bridge inspection and reporting.",
        InternalNotes: "not included",
      },
    ];

    assert.deepEqual(summarizeRowsForAssistant(rows), [
      {
        "Project ID": "1200",
        "Project Name": "Bridge inspection",
        Client: "City Council",
        Manager: "Jane Smith",
        "Start Date": "2021-03-15",
        "Industry/Sector": "",
        "Project Profile": "",
        Description: "Detailed bridge inspection and reporting.",
        "Key Words": "",
        City: "",
        "Project Address": "",
        InternalNotes: "not included",
      },
    ]);
  });

  it("keeps all project fields available for AI project summaries", () => {
    const rows = [
      {
        "Project ID": "1200",
        "Project Name": "Bridge inspection",
        "Project Profile": "Inspection and reporting",
        Description: "Detailed bridge inspection and reporting.",
        "Contract Amount": "$25,000",
        "Source File": "projects.csv",
      },
    ];

    assert.deepEqual(summarizeRowsForAssistant(rows), [
      {
        "Project ID": "1200",
        "Project Name": "Bridge inspection",
        Client: "",
        Manager: "",
        "Start Date": "",
        "Industry/Sector": "",
        "Project Profile": "Inspection and reporting",
        Description: "Detailed bridge inspection and reporting.",
        "Key Words": "",
        City: "",
        "Project Address": "",
        "Contract Amount": "$25,000",
        "Source File": "projects.csv",
      },
    ]);
  });

  it("builds a DeepSeek prompt that requests JSON intent output", () => {
    const messages = buildAssistantMessages({
      prompt: "Find bridge inspection projects from the last 10 years",
      currentDate: "2026-06-19",
      currentFilters: {},
      rows: [],
    });

    assert.equal(messages[0].role, "system");
    assert.match(messages[0].content, /json/i);
    assert.match(messages[0].content, /search_then_analyze/);
    assert.equal(messages[1].role, "user");
    assert.match(messages[1].content, /2026-06-19/);
  });

  it("routes first-step summarize requests with search terms to search then analyze", () => {
    const messages = buildAssistantMessages({
      prompt: "Summarize all retaining wall projects",
      currentDate: "2026-06-19",
      currentFilters: {},
      rows: [],
    });

    assert.match(messages[0].content, /search_then_analyze/);
    assert.match(messages[0].content, /summarize all retaining wall projects/i);
    assert.match(messages[0].content, /analysisInstruction/);
    assert.match(messages[0].content, /needs_clarification/);
  });

  it("frames presentation requests as project information summaries, not current results summaries", () => {
    const messages = buildAssistantMessages({
      prompt: "Summarize current results",
      currentDate: "2026-06-19",
      currentFilters: {},
      rows: [],
      purpose: "analyze_results",
    });

    assert.doesNotMatch(messages[0].content, /current results/i);
    assert.match(messages[0].content, /project information/i);
    assert.match(messages[0].content, /Project Profile/);
    assert.match(messages[0].content, /Description/);
  });

  it("includes recent case conversation history in the DeepSeek prompt", () => {
    const messages = buildAssistantMessages({
      prompt: "Make it shorter",
      currentDate: "2026-06-19",
      currentFilters: { keywordText: "retaining wall" },
      rows: [],
      conversationHistory: [
        {
          role: "user",
          content: "Summarize all retaining wall projects",
        },
        {
          role: "assistant",
          content: "WML has completed retaining wall assessment and certification projects.",
        },
      ],
    });

    assert.match(messages[1].content, /"conversationHistory"/);
    assert.match(messages[1].content, /Summarize all retaining wall projects/);
    assert.match(messages[1].content, /retaining wall assessment/);
  });

  it("describes DeepSeek certificate failures with the underlying cause", () => {
    const error = new TypeError("fetch failed", {
      cause: new Error("unable to get local issuer certificate"),
    });
    error.cause.code = "UNABLE_TO_GET_ISSUER_CERT_LOCALLY";

    assert.equal(
      describeDeepSeekError(error),
      "DeepSeek request failed: fetch failed (UNABLE_TO_GET_ISSUER_CERT_LOCALLY: unable to get local issuer certificate)",
    );
  });
});
