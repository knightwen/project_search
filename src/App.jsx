import { useEffect, useState } from "react";
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
  hasAnySearch,
  safeDownloadName,
  visibleColumns,
} from "./lib/search.js";
import { downloadText, rowsToCsv } from "./lib/export.js";
import { googleMapsUrl, projectKml, projectLabel, safeKmlName } from "./lib/kml.js";

const PASSWORD_KEY = "project-search-password";
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

async function searchApi({ password, filters = {}, page = 1, includeAll = false }) {
  const response = await fetch("/api/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      password,
      filters,
      page,
      pageSize: PAGE_SIZE,
      includeAll,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || `Search request failed with ${response.status}`);
  }
  return body;
}

function LoginView({ onLogin }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [logoFailed, setLogoFailed] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    try {
      const initialPayload = await searchApi({ password, filters: {}, page: 1 });
      sessionStorage.setItem(PASSWORD_KEY, password);
      onLogin(password, initialPayload);
    } catch (apiError) {
      setError(apiError.message);
    }
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
          WML Structural Group Project
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

function PaginationControls({ currentPage, totalPages, onPageChange }) {
  const [targetPage, setTargetPage] = useState(String(currentPage));

  useEffect(() => {
    setTargetPage(String(currentPage));
  }, [currentPage]);

  function clampPage(value) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) {
      return currentPage;
    }
    return Math.min(totalPages, Math.max(1, parsed));
  }

  function jumpToPage(event) {
    event.preventDefault();
    onPageChange(clampPage(targetPage));
  }

  return (
    <form className="pagination" onSubmit={jumpToPage}>
      <button
        type="button"
        disabled={currentPage <= 1}
        onClick={() => onPageChange(Math.max(1, currentPage - 1))}
      >
        Previous
      </button>
      <div className="page-jump">
        <span>Page</span>
        <input
          aria-label="Page number"
          type="number"
          min="1"
          max={totalPages}
          value={targetPage}
          onChange={(event) => setTargetPage(event.target.value)}
        />
        <span>of {totalPages}</span>
        <button type="submit">Go</button>
      </div>
      <button
        type="button"
        disabled={currentPage >= totalPages}
        onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
      >
        Next
      </button>
    </form>
  );
}

export default function App() {
  const [password, setPassword] = useState(() => sessionStorage.getItem(PASSWORD_KEY) || "");
  const [authenticated, setAuthenticated] = useState(() => Boolean(sessionStorage.getItem(PASSWORD_KEY)));
  const [logoFailed, setLogoFailed] = useState(false);
  const [payload, setPayload] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [keywordText, setKeywordText] = useState("");
  const [projectIdText, setProjectIdText] = useState("");
  const [clientText, setClientText] = useState("");
  const [managerText, setManagerText] = useState("");
  const [page, setPage] = useState(1);

  const filters = { keywordText, projectIdText, clientText, managerText };
  const searching = hasAnySearch(keywordText, projectIdText, clientText, managerText);
  const rows = payload?.results || [];
  const total = payload?.total || 0;
  const totalPages = payload?.totalPages || 1;
  const currentPage = payload?.page || page;

  useEffect(() => {
    if (!authenticated || !password) {
      return;
    }

    let cancelled = false;
    setLoadError("");
    searchApi({ password, filters, page })
      .then((nextPayload) => {
        if (!cancelled) {
          setPayload(nextPayload);
        }
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        setLoadError(error.message);
        if (/password/i.test(error.message)) {
          sessionStorage.removeItem(PASSWORD_KEY);
          setAuthenticated(false);
          setPassword("");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [authenticated, password, keywordText, projectIdText, clientText, managerText, page]);

  useEffect(() => {
    setPage(1);
  }, [keywordText, projectIdText, clientText, managerText]);

  function logout() {
    sessionStorage.removeItem(PASSWORD_KEY);
    setPassword("");
    setAuthenticated(false);
    setPayload(null);
  }

  function clearSearch() {
    setKeywordText("");
    setProjectIdText("");
    setClientText("");
    setManagerText("");
  }

  async function downloadCsv() {
    try {
      const exportPayload = await searchApi({ password, filters, page: 1, includeAll: true });
      const columns = visibleColumns(exportPayload.results, DISPLAY_COLUMNS);
      const csv = rowsToCsv(exportPayload.results, columns);
      const fileName = safeDownloadName(
        [keywordText, projectIdText, clientText, managerText].filter((value) => value.trim()).join(" "),
      );
      downloadText(fileName, csv, "text/csv;charset=utf-8");
    } catch (error) {
      setLoadError(error.message);
    }
  }

  if (!authenticated) {
    return (
      <LoginView
        onLogin={(nextPassword, initialPayload) => {
          setPassword(nextPassword);
          setPayload(initialPayload);
          setAuthenticated(true);
        }}
      />
    );
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
            <h1>WML Structural Group Project Management System</h1>
            <p>
              {payload
                ? `${payload.recordCount.toLocaleString()} project records from ${payload.sourceFileCount} files`
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
            placeholder="retaining wall"
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
          {searching && total > 0 ? (
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
            <h2>{total.toLocaleString()} matching projects</h2>
            {total > 0 ? (
              <p>
                Showing {(currentPage - 1) * PAGE_SIZE + 1}-
                {Math.min(currentPage * PAGE_SIZE, total)} of{" "}
                {total.toLocaleString()}
              </p>
            ) : null}
          </div>
          {rows.length ? (
            <div className="result-list">
              {rows.map((row, index) => (
                <ProjectResult key={`${row["Project ID"] || "project"}-${index}`} row={row} />
              ))}
            </div>
          ) : (
            <p className="empty-state">No projects were found for the current search.</p>
          )}
          {total > PAGE_SIZE ? (
            <PaginationControls
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setPage}
            />
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
