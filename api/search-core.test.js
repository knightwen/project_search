import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createSearchResponse, isPasswordValid } from "./search-core.js";

const rows = [
  {
    "Project ID": "8443",
    "Project Name": "Treendale retaining wall",
    Client: "Calibre",
    Manager: "Michael Kelly",
    Description: "Certification package",
  },
  {
    "Project ID": "1200",
    "Project Name": "Warehouse slab",
    Client: "Other Client",
    Manager: "Jane Smith",
    Description: "Inspection",
  },
  {
    "Project ID": "1300",
    "Project Name": "Bridge inspection",
    Client: "Calibre",
    Manager: "Michael Kelly",
    Description: "Inspection",
  },
];

describe("server search core", () => {
  it("validates passwords against the configured secret only", () => {
    assert.equal(isPasswordValid("20260526", "20260526"), true);
    assert.equal(isPasswordValid("wrong", "20260526"), false);
    assert.equal(isPasswordValid("", "20260526"), false);
  });

  it("returns only preview rows when there is no search text", () => {
    const response = createSearchResponse(rows, {
      filters: {},
      page: 1,
      pageSize: 2,
      includeAll: false,
    });

    assert.equal(response.searching, false);
    assert.equal(response.total, 3);
    assert.equal(response.results.length, 2);
    assert.equal(response.results[0]["Project ID"], "8443");
  });

  it("filters and paginates search results on the server", () => {
    const response = createSearchResponse(rows, {
      filters: {
        keywordText: "inspection",
        clientText: "calibre",
      },
      page: 1,
      pageSize: 1,
      includeAll: false,
    });

    assert.equal(response.searching, true);
    assert.equal(response.total, 1);
    assert.equal(response.totalPages, 1);
    assert.equal(response.results.length, 1);
    assert.equal(response.results[0]["Project ID"], "1300");
  });

  it("can return all matching rows for authenticated CSV export", () => {
    const response = createSearchResponse(rows, {
      filters: {
        managerText: "kelly",
      },
      page: 1,
      pageSize: 1,
      includeAll: true,
    });

    assert.equal(response.total, 2);
    assert.equal(response.results.length, 2);
  });
});
