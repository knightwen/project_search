import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
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
import {
  getProjectCoordinates,
  googleMapsUrl,
  projectKml,
  projectLabel,
  projectsKml,
  safeKmlName,
} from "./lib/kml.js";

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

function escapeHtml(value) {
  return textValue(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function projectKey(row) {
  return textValue(row?.["Project ID"]) || projectLabel(row);
}

function projectPopupHtml(row) {
  return (
    `<strong>${escapeHtml(textValue(row["Project ID"]) || "No Project ID")}</strong><br>` +
    `${escapeHtml(textValue(row["Project Name"]) || projectLabel(row))}`
  );
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

function SearchField({ id, label, value, placeholder, onChange, onEnter }) {
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      <input
        id={id}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onEnter?.();
          }
        }}
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

function ProjectResult({ row, selected = false }) {
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
    <article className={`result-row ${selected ? "selected" : ""}`}>
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

function ResultsMap({ rows, total, selectedProjectKey, onProjectSelect }) {
  const mapElementRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const fittedRowsSignatureRef = useRef("");
  const [mapSize, setMapSize] = useState("compact");
  const [collapsed, setCollapsed] = useState(false);
  const mappedRows = useMemo(
    () =>
      rows
        .map((row) => ({ row, coordinates: getProjectCoordinates(row) }))
        .filter((item) => item.coordinates),
    [rows],
  );
  const mappedRowsSignature = useMemo(
    () =>
      mappedRows
        .map(({ row, coordinates }) => `${projectKey(row)}:${coordinates.latitude},${coordinates.longitude}`)
        .join("|"),
    [mappedRows],
  );
  const hasMappedRows = mappedRows.length > 0;

  useEffect(() => {
    if (!hasMappedRows || !mapElementRef.current || mapRef.current) {
      return;
    }

    mapRef.current = L.map(mapElementRef.current, {
      scrollWheelZoom: false,
    }).setView([-31.95, 115.86], 6);
    mapRef.current.attributionControl.setPrefix(false);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>',
    }).addTo(mapRef.current);

    layerRef.current = L.layerGroup().addTo(mapRef.current);
    window.setTimeout(() => {
      mapRef.current?.invalidateSize();
    }, 0);

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, [hasMappedRows]);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) {
      return;
    }

    layer.clearLayers();
    const bounds = [];
    mappedRows.forEach(({ row, coordinates }) => {
      const isSelected = projectKey(row) === selectedProjectKey;
      const marker = L.marker([coordinates.latitude, coordinates.longitude], {
        icon: L.divIcon({
          className: `project-map-marker ${isSelected ? "selected" : ""}`,
          html: "",
          iconSize: isSelected ? [18, 18] : [14, 14],
          iconAnchor: isSelected ? [9, 9] : [7, 7],
        }),
      });
      marker.bindPopup(projectPopupHtml(row));
      marker.on("click", () => {
        onProjectSelect?.(row);
        marker.openPopup();
      });
      marker.addTo(layer);
      if (isSelected) {
        window.setTimeout(() => {
          marker.openPopup();
        }, 0);
      }
      bounds.push([coordinates.latitude, coordinates.longitude]);
    });

    if (fittedRowsSignatureRef.current !== mappedRowsSignature) {
      fittedRowsSignatureRef.current = mappedRowsSignature;
      if (bounds.length === 1) {
        map.setView(bounds[0], 13);
      } else if (bounds.length > 1) {
        map.fitBounds(bounds, { padding: [28, 28], maxZoom: 13 });
      }
    }
    window.setTimeout(() => {
      map.invalidateSize();
    }, 0);
  }, [mappedRows, mappedRowsSignature, onProjectSelect, selectedProjectKey]);

  useEffect(() => {
    window.setTimeout(() => {
      mapRef.current?.invalidateSize();
    }, 0);
  }, [mapSize, collapsed]);

  function enableScrollZoom() {
    mapRef.current?.scrollWheelZoom.enable();
  }

  function disableScrollZoom() {
    mapRef.current?.scrollWheelZoom.disable();
  }

  if (!hasMappedRows) {
    return (
      <section className="results-map-panel">
        <div className="map-summary">
          <h3>Map</h3>
          <p>No matching projects with coordinates.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="results-map-panel">
        <div className="map-summary">
          <div>
            <h3>Map</h3>
          </div>
        <p>
          Showing {mappedRows.length.toLocaleString()} mapped projects from{" "}
          {total.toLocaleString()} matching results.
        </p>
        <div className="map-controls">
          <div className="map-size-toggle" aria-label="Map size">
            <button
              type="button"
              className={mapSize === "compact" ? "active" : ""}
              onClick={() => setMapSize("compact")}
              disabled={collapsed}
            >
              Compact
            </button>
            <button
              type="button"
              className={mapSize === "large" ? "active" : ""}
              onClick={() => setMapSize("large")}
              disabled={collapsed}
            >
              Large
            </button>
          </div>
          <button
            className="map-collapse-button"
            type="button"
            onClick={() => setCollapsed((value) => !value)}
          >
            {collapsed ? "Expand" : "Collapse"}
          </button>
        </div>
      </div>
      <div
        className={`map-canvas ${mapSize === "large" ? "large" : ""} ${collapsed ? "collapsed" : ""}`}
        ref={mapElementRef}
        aria-label="Search results map"
        onMouseEnter={enableScrollZoom}
        onMouseLeave={disableScrollZoom}
      />
    </section>
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
  const [submittedFilters, setSubmittedFilters] = useState({
    keywordText: "",
    projectIdText: "",
    clientText: "",
    managerText: "",
  });
  const [page, setPage] = useState(1);
  const [mapRows, setMapRows] = useState([]);
  const [selectedMapProject, setSelectedMapProject] = useState(null);

  const draftFilters = { keywordText, projectIdText, clientText, managerText };
  const filters = submittedFilters;
  const searching = hasAnySearch(
    filters.keywordText,
    filters.projectIdText,
    filters.clientText,
    filters.managerText,
  );
  const rows = payload?.results || [];
  const selectedMapProjectKey = selectedMapProject ? projectKey(selectedMapProject) : "";
  const displayRows = selectedMapProject
    ? [
        selectedMapProject,
        ...rows.filter((row) => projectKey(row) !== selectedMapProjectKey),
      ]
    : rows;
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
        if (!cancelled && searching) {
          return searchApi({ password, filters, page: 1, includeAll: true });
        }
        if (!cancelled) {
          setMapRows([]);
        }
        return null;
      })
      .then((mapPayload) => {
        if (!cancelled && mapPayload) {
          setMapRows(mapPayload.results || []);
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
  }, [
    authenticated,
    password,
    filters.keywordText,
    filters.projectIdText,
    filters.clientText,
    filters.managerText,
    page,
    searching,
  ]);

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
    setSubmittedFilters({
      keywordText: "",
      projectIdText: "",
      clientText: "",
      managerText: "",
    });
    setSelectedMapProject(null);
    setPage(1);
  }

  function submitSearch(event) {
    event?.preventDefault();
    setSubmittedFilters(draftFilters);
    setSelectedMapProject(null);
    setPage(1);
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

  async function downloadSearchKml() {
    try {
      const exportPayload = await searchApi({ password, filters, page: 1, includeAll: true });
      const kml = projectsKml(exportPayload.results || [], "WML Search Results");
      downloadText("wml_search_results.kml", kml, "application/vnd.google-earth.kml+xml;charset=utf-8");
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
        <form className="search-grid" onSubmit={submitSearch}>
          <SearchField
            id="keyword"
            label="Keyword"
            value={keywordText}
            placeholder="retaining wall"
            onChange={setKeywordText}
            onEnter={submitSearch}
          />
          <SearchField
            id="project-id"
            label="Project ID"
            value={projectIdText}
            placeholder="8443"
            onChange={setProjectIdText}
            onEnter={submitSearch}
          />
          <SearchField
            id="client"
            label="Client"
            value={clientText}
            placeholder="Calibre"
            onChange={setClientText}
            onEnter={submitSearch}
          />
          <SearchField
            id="manager"
            label="Manager"
            value={managerText}
            placeholder="Michael Kelly"
            onChange={setManagerText}
            onEnter={submitSearch}
          />
        </form>
        <div className="toolbar">
          <ActionButton icon={Search} onClick={submitSearch}>
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
          {searching && total > 0 ? (
            <ActionButton icon={FileDown} onClick={downloadSearchKml}>
              KML
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
          <ResultsMap
            rows={mapRows}
            total={total}
            selectedProjectKey={selectedMapProjectKey}
            onProjectSelect={setSelectedMapProject}
          />
          {rows.length ? (
            <div className="result-list">
              {displayRows.map((row, index) => (
                <ProjectResult
                  key={`${projectKey(row) || "project"}-${index}`}
                  row={row}
                  selected={Boolean(selectedMapProjectKey) && projectKey(row) === selectedMapProjectKey}
                />
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
