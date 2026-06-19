import { filterProjects, hasAnySearch } from "../src/lib/search.js";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

function clampInteger(value, fallback, min, max) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, number));
}

export function isPasswordValid(password, expectedPassword) {
  if (!expectedPassword) {
    return false;
  }
  return String(password || "") === String(expectedPassword);
}

export function createSearchResponse(rows, options = {}) {
  const filters = options.filters || {};
  const page = clampInteger(options.page, 1, 1, Number.MAX_SAFE_INTEGER);
  const pageSize = clampInteger(options.pageSize, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
  const searching = hasAnySearch(
    filters.keywordText || "",
    filters.projectIdText || "",
    filters.clientText || "",
    filters.managerText || "",
    filters.startDateFrom || "",
    filters.startDateTo || "",
  );

  const matchingRows = searching ? filterProjects(rows, filters) : rows;
  const total = matchingRows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const results = options.includeAll
    ? matchingRows
    : matchingRows.slice(startIndex, startIndex + pageSize);

  return {
    searching,
    total,
    page: currentPage,
    pageSize,
    totalPages,
    results,
  };
}
