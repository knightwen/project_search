import { useEffect, useMemo, useState } from "react";
import {
  Download,
  ExternalLink,
  FileDown,
  LogOut,
  RefreshCw,
  Search,
} from "lucide-react";
import {
  DISPLAY_COLUMNS,
  filterProjects,
  hasAnySearch,
  safeDownloadName,
  visibleColumns,
} from "./lib/search.js";
import { downloadText, rowsToCsv } from "./lib/export.js";
import { googleMapsUrl, projectKml, projectLabel, safeKmlName } from "./lib/kml.js";

const PASSWORD = "20260526";
const AUTH_KEY = "project-search-authenticated";
const PAGE_SIZE = 20;
const PREVIEW_COLUMNS = [
  "Project ID",
  "Project Name",
  "Client",
  "Manager",
  "Industry/Sector",
  "Project Profile",
];

function textValue(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim();
}

function LoginView({ onLogin }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [logoFailed, setLogoFailed] = useState(false);

  function submit(event) {
    event.preventDefault();
    if (password === PASSWORD) {
      localStorage.setItem(AUTH_KEY, "true");
      onLogin();
      return;
    }
    setError("Incorrect password.");
  }

  return (
    <main className="login-screen">
      <form className="login-panel" onSubmit={submit}>
        <div className="login-brand">
          {!logoFailed ? (
            <img src="/wml-logo.png" alt="WML Structural Group" onError={() => setLogoFailed(true)} />
          ) : (
            <div className="logo-fallback">WML</div>
          )}
        </div>
        <h1>
          WML Structural Group Projects
          <span>Management System</span>
        </h1>
        <label htmlFor="password">Password</label>
        <div className="login-row">
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoFocus
          />
          <button type="submit">Log in</button>
        </div>
        {error ? <p className="form-error">{error}</p> : null}
      </form>
    </main>
  );
}

function SearchField({ id, label, value, placeholder, onChange }) {
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      <input
        id={id}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function ActionButton({ children, icon: Icon, ...props }) {
  return (
    <button className="icon-button" type="button" {...props}>
      {Icon ? <Icon size={16} aria-hidden="true" /> : null}
      <span>{children}</span>
    </button>
  );
}

function ProjectResult({ row }) {
  const label = projectLabel(row);
  const mapUrl = googleMapsUrl(row);
  const kml = projectKml(row);

  function downloadKml() {
    if (!kml) {
      return;
    }
    downloadText(safeKmlName(row), kml, "application/vnd.google-earth.kml+xml;charset=utf-8");
  }

  return (
    <article className="result-row">
      <div className="result-main">
        <h3>{label}</h3>
        <dl>
          {["Client", "Manager", "Industry/Sector", "Project Profile", "Description"].map((column) => {
            const value = textValue(row[column]);
            if (!value) {
              return null;
            }
            return (
              <div key={column}>
                <dt>{column}</dt>
                <dd>{value}</dd>
              </div>
            );
          })}
        </dl>
      </div>
      <div className="result-actions">
        {mapUrl ? (
          <a className="icon-link" href={mapUrl} target="_blank" rel="noreferrer">
            <ExternalLink size={16} aria-hidden="true" />
            <span>Map</span>
          </a>
        ) : (
          <span className="muted-action">No map</span>
        )}
        {kml ? (
          <ActionButton icon={FileDown} onClick={downloadKml}>
            KML
          </ActionButton>
        ) : (
          <span className="muted-action">No KML</span>
        )}
      </div>
    </article>
  );
}

function PreviewTable({ rows }) {
  const columns = visibleColumns(rows, PREVIEW_COLUMNS);
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 20).map((row, index) => (
            <tr key={`${row["Project ID"] || "row"}-${index}`}>
              {columns.map((column) => (
                <td key={column}>{textValue(row[column])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function App() {
  const [authenticated, setAuthenticated] = useState(
    () => localStorage.getItem(AUTH_KEY) === "true",
  );
  const [logoFailed, setLogoFailed] = useState(false);
  const [payload, setPayload] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [keywordText, setKeywordText] = useState("");
  const [projectIdText, setProjectIdText] = useState("");
  const [clientText, setClientText] = useState("");
  const [managerText, setManagerText] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    fetch("/project-data.json")
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Data request failed with ${response.status}`);
        }
        return response.json();
      })
      .then(setPayload)
      .catch((error) => setLoadError(error.message));
  }, []);

  const rows = payload?.records || [];
  const searching = hasAnySearch(keywordText, projectIdText, clientText, managerText);
  const filteredRows = useMemo(
    () =>
      searching
        ? filterProjects(rows, { keywordText, projectIdText, clientText, managerText })
        : rows,
    [rows, searching, keywordText, projectIdText, clientText, managerText],
  );
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedRows = searching
    ? filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
    : [];

  useEffect(() => {
    setPage(1);
  }, [keywordText, projectIdText, clientText, managerText]);

  function logout() {
    localStorage.removeItem(AUTH_KEY);
    setAuthenticated(false);
  }

  function clearSearch() {
    setKeywordText("");
    setProjectIdText("");
    setClientText("");
    setManagerText("");
  }

  function downloadCsv() {
    const columns = visibleColumns(filteredRows, DISPLAY_COLUMNS);
    const csv = rowsToCsv(filteredRows, columns);
    const fileName = safeDownloadName(
      [keywordText, projectIdText, clientText, managerText].filter((value) => value.trim()).join(" "),
    );
    downloadText(fileName, csv, "text/csv;charset=utf-8");
  }

  if (!authenticated) {
    return <LoginView onLogin={() => setAuthenticated(true)} />;
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="title-lockup">
          <div className="site-logo">
            {!logoFailed ? (
              <img src="/wml-logo.png" alt="WML Structural Group" onError={() => setLogoFailed(true)} />
            ) : (
              <span>WML</span>
            )}
          </div>
          <div>
            <h1>WML Structural Group Projects Management System</h1>
            <p>
              {payload
                ? `${payload.recordCount.toLocaleString()} project records from ${payload.sourceFiles.length} files`
                : "Loading project records"}
            </p>
          </div>
        </div>
        <button className="ghost-button" type="button" onClick={logout}>
          <LogOut size={16} aria-hidden="true" />
          <span>Log out</span>
        </button>
      </header>

      <section className="search-band" aria-label="Project search filters">
        <div className="search-grid">
          <SearchField
            id="keyword"
            label="Keyword"
            value={keywordText}
            placeholder="retaining wall certification treendale"
            onChange={setKeywordText}
          />
          <SearchField
            id="project-id"
            label="Project ID"
            value={projectIdText}
            placeholder="8443"
            onChange={setProjectIdText}
          />
          <SearchField
            id="client"
            label="Client"
            value={clientText}
            placeholder="Calibre"
            onChange={setClientText}
          />
          <SearchField
            id="manager"
            label="Manager"
            value={managerText}
            placeholder="Michael Kelly"
            onChange={setManagerText}
          />
        </div>
        <div className="toolbar">
          <ActionButton icon={Search} onClick={() => setPage(1)}>
            Search
          </ActionButton>
          <ActionButton icon={RefreshCw} onClick={clearSearch}>
            Clear
          </ActionButton>
          {searching && filteredRows.length > 0 ? (
            <ActionButton icon={Download} onClick={downloadCsv}>
              CSV
            </ActionButton>
          ) : null}
        </div>
      </section>

      {loadError ? <p className="error-banner">{loadError}</p> : null}

      {searching ? (
        <section className="results-section">
          <div className="section-heading">
            <h2>{filteredRows.length.toLocaleString()} matching projects</h2>
            {filteredRows.length > 0 ? (
              <p>
                Showing {(currentPage - 1) * PAGE_SIZE + 1}-
                {Math.min(currentPage * PAGE_SIZE, filteredRows.length)} of{" "}
                {filteredRows.length.toLocaleString()}
              </p>
            ) : null}
          </div>
          {pagedRows.length ? (
            <div className="result-list">
              {pagedRows.map((row, index) => (
                <ProjectResult key={`${row["Project ID"] || "project"}-${index}`} row={row} />
              ))}
            </div>
          ) : (
            <p className="empty-state">No projects were found for the current search.</p>
          )}
          {filteredRows.length > PAGE_SIZE ? (
            <div className="pagination">
              <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))}>
                Previous
              </button>
              <span>
                Page {currentPage} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
              >
                Next
              </button>
            </div>
          ) : null}
        </section>
      ) : (
        <section className="results-section">
          <div className="section-heading">
            <h2>Project Data Preview</h2>
            <p>First 20 rows</p>
          </div>
          <PreviewTable rows={rows} />
        </section>
      )}
      <footer className="site-footer">
        Developed by Graduate Engineer Wen Zhou, supervised by Steve Woodhouse and Jing Zhang
      </footer>
    </main>
  );
}
