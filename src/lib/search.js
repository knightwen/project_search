export const LATITUDE_COLUMN = "Latitude";
export const LONGITUDE_COLUMN = "Longitude";

export const DISPLAY_COLUMNS = [
  "Project ID",
  "Project Name",
  LATITUDE_COLUMN,
  LONGITUDE_COLUMN,
  "Client",
  "Manager",
  "Start Date",
  "Contract Amount",
  "Industry/Sector",
  "Key Words",
  "Project Profile",
  "Description",
];

export const PROJECT_ID_COLUMNS = ["Project ID"];
export const CLIENT_COLUMNS = ["Client", "Client Name", "Original Client"];
export const MANAGER_COLUMNS = ["Manager"];
export const KEYWORD_COLUMNS = [
  "Project ID",
  "Project Name",
  "Generated Project Name",
  "Original Project Display Name",
  "Client",
  "Client Name",
  "Original Client",
  "Manager",
  "Industry/Sector",
  "Key Words",
  "Project Profile",
  "Description",
  "City",
  "Project Address",
  "Final Project Address",
];

function cleanValue(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim();
}

function coalesce(row, targetColumn, sourceColumns) {
  const next = { ...row };
  let targetValue = cleanValue(next[targetColumn]);

  for (const sourceColumn of sourceColumns) {
    if (targetValue || sourceColumn === targetColumn) {
      continue;
    }
    targetValue = cleanValue(next[sourceColumn]);
  }

  next[targetColumn] = targetValue;
  return next;
}

export function normalizeProject(row) {
  let next = { ...row };
  next = coalesce(next, "Project Name", [
    "Project Name",
    "Generated Project Name",
    "Original Project Display Name",
  ]);
  next = coalesce(next, "Client", ["Client", "Client Name", "Original Client"]);
  next = coalesce(next, LATITUDE_COLUMN, [LATITUDE_COLUMN, "Google Latitude"]);
  next = coalesce(next, LONGITUDE_COLUMN, [LONGITUDE_COLUMN, "Google Longitude"]);
  next = coalesce(next, "Project Profile", ["Project Profile", "Job Type"]);
  return next;
}

export function containsTerms(text, searchText) {
  const haystack = cleanValue(text).toLowerCase();
  const terms = cleanValue(searchText)
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  return terms.every((term) => haystack.includes(term));
}

export function textForColumns(row, columns) {
  return columns.map((column) => cleanValue(row[column])).join(" ");
}

export function filterProjects(rows, filters) {
  const {
    keywordText = "",
    projectIdText = "",
    clientText = "",
    managerText = "",
  } = filters;

  return rows.filter((row) => {
    const normalized = normalizeProject(row);
    if (cleanValue(keywordText) && !containsTerms(textForColumns(normalized, KEYWORD_COLUMNS), keywordText)) {
      return false;
    }
    if (cleanValue(projectIdText) && !containsTerms(textForColumns(normalized, PROJECT_ID_COLUMNS), projectIdText)) {
      return false;
    }
    if (cleanValue(clientText) && !containsTerms(textForColumns(normalized, CLIENT_COLUMNS), clientText)) {
      return false;
    }
    if (cleanValue(managerText) && !containsTerms(textForColumns(normalized, MANAGER_COLUMNS), managerText)) {
      return false;
    }
    return true;
  });
}

export function hasAnySearch(...values) {
  return values.some((value) => cleanValue(value));
}

export function safeDownloadName(searchText) {
  let safeText = cleanValue(searchText).replace(/[<>:"/\\|?*\x00-\x1f]+/g, "_");
  safeText = safeText.replace(/^[ ._]+|[ ._]+$/g, "");
  if (!safeText) {
    safeText = "search";
  }
  return `search_result_${safeText.slice(0, 80)}.csv`;
}

export function visibleColumns(rows, columns = DISPLAY_COLUMNS) {
  const available = new Set(rows.flatMap((row) => Object.keys(row)));
  return columns.filter((column) => available.has(column));
}
