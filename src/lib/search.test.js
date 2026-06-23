import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  containsTerms,
  filterProjects,
  isAllProjectsSearch,
  normalizeProject,
  safeDownloadName,
} from "./search.js";

describe("search helpers", () => {
  it("matches all whitespace-separated terms without regex interpretation", () => {
    assert.equal(containsTerms("Retaining wall certification at Treendale", "wall treendale"), true);
    assert.equal(containsTerms("Retaining wall certification", "wall treendale"), false);
    assert.equal(containsTerms("Project A+B", "A+B"), true);
  });

  it("normalizes project aliases into display columns", () => {
    const row = normalizeProject({
      "Generated Project Name": "Generated name",
      "Original Client": "Original client",
      "Google Latitude": "-31.95",
      "Google Longitude": "115.86",
      "Job Type": "Inspection",
    });

    assert.equal(row["Project Name"], "Generated name");
    assert.equal(row.Client, "Original client");
    assert.equal(row.Latitude, "-31.95");
    assert.equal(row.Longitude, "115.86");
    assert.equal(row["Project Profile"], "Inspection");
  });

  it("filters by keyword, project ID, client, and manager", () => {
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
    ];

    const result = filterProjects(rows, {
      keywordText: "retaining certification",
      projectIdText: "8443",
      clientText: "calibre",
      managerText: "kelly",
    });

    assert.equal(result.length, 1);
    assert.equal(result[0]["Project ID"], "8443");
  });

  it("supports OR terms in field filters with pipe separators", () => {
    const rows = [
      { "Project ID": "1000", "Project Name": "Bridge inspection", Manager: "StephenWoodhouse" },
      { "Project ID": "1100", "Project Name": "Facade inspection", Manager: "Jing" },
      { "Project ID": "1200", "Project Name": "Warehouse slab", Manager: "RobertJarman" },
    ];

    const result = filterProjects(rows, {
      managerText: "StephenWoodhouse | Jing",
    });

    assert.deepEqual(
      result.map((row) => row["Project ID"]),
      ["1000", "1100"],
    );
  });

  it("filters by inclusive Start Date bounds", () => {
    const rows = [
      { "Project ID": "1000", "Project Name": "Old bridge inspection", "Start Date": "2014-05-01" },
      { "Project ID": "1100", "Project Name": "Boundary bridge inspection", "Start Date": "2016-06-19" },
      { "Project ID": "1200", "Project Name": "Recent bridge inspection", "Start Date": "2021-03-15" },
      { "Project ID": "1300", "Project Name": "Future bridge inspection", "Start Date": "2027-01-01" },
      { "Project ID": "1400", "Project Name": "Undated bridge inspection", "Start Date": "" },
    ];

    const result = filterProjects(rows, {
      keywordText: "bridge inspection",
      startDateFrom: "2016-06-19",
      startDateTo: "2026-06-19",
    });

    assert.deepEqual(
      result.map((row) => row["Project ID"]),
      ["1100", "1200"],
    );
  });

  it("treats keyword all as a request for every project", () => {
    const rows = [
      { "Project ID": "8443", "Project Name": "Treendale retaining wall" },
      { "Project ID": "1200", "Project Name": "Warehouse slab" },
    ];

    assert.equal(isAllProjectsSearch({ keywordText: " all " }), true);
    assert.equal(isAllProjectsSearch({ keywordText: "all", clientText: "Calibre" }), false);
    assert.deepEqual(filterProjects(rows, { keywordText: "all" }), rows);
  });

  it("builds Windows-safe CSV download names", () => {
    assert.equal(
      safeDownloadName(' wall:certification/treendale* '),
      "search_result_wall_certification_treendale.csv",
    );
    assert.equal(safeDownloadName(""), "search_result_search.csv");
  });
});
