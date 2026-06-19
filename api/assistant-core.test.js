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
      intent: "search",
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
      intent: "search",
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
      intent: "presentation",
      message: "These projects demonstrate relevant bridge inspection experience.",
    });

    assert.equal(payload.intent, "presentation");
    assert.equal(payload.message, "These projects demonstrate relevant bridge inspection experience.");
    assert.equal(payload.filters, undefined);
  });

  it("normalizes search then present intent with presentation instruction", () => {
    const payload = normalizeAssistantPayload({
      intent: "search_then_present",
      filters: { keywordText: "facade inspection" },
      message: "Searching first, then preparing a client summary.",
      presentationInstruction: "Summarize the matching projects for a client meeting.",
    });

    assert.equal(payload.intent, "search_then_present");
    assert.equal(payload.filters.keywordText, "facade inspection");
    assert.equal(payload.presentationInstruction, "Summarize the matching projects for a client meeting.");
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
    assert.match(messages[0].content, /search_then_present/);
    assert.equal(messages[1].role, "user");
    assert.match(messages[1].content, /2026-06-19/);
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
