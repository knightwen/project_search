import { cloneElement, isValidElement, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import {
  ChevronDown,
  ChevronUp,
  Download,
  ExternalLink,
  FileDown,
  FolderOpen,
  LogOut,
  Maximize2,
  Mic,
  Minimize2,
  RefreshCw,
  Search,
  Send,
  SlidersHorizontal,
  Square,
  X,
} from "lucide-react";
import {
  DISPLAY_COLUMNS,
  hasAnySearch,
  projectFolderPath,
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
const DEFAULT_PAGE_SIZE = 20;
const MOBILE_PAGE_SIZE = 10;
const MOBILE_LAYOUT_QUERY = "(max-width: 520px), (hover: none) and (pointer: coarse)";
const MAX_ASSISTANT_CONTEXT_ROWS = 80;
const DEFAULT_ASSISTANT_HISTORY_HEIGHT = 230;
const DEFAULT_ASSISTANT_FULLSCREEN_HISTORY_HEIGHT = 420;
const PREVIEW_COLUMNS = [
  "Project ID",
  "Project Name",
  "Client",
  "Manager",
  "Industry/Sector",
  "Project Profile",
];
const MOBILE_RESULT_COLUMNS = [
  ["Project ID", "ID", "id"],
  ["Project Name", "Name", "name"],
  ["Client", "Client", "client"],
  ["Manager", "Manager", "manager"],
  ["Industry/Sector", "Sector", "sector"],
  ["Project Profile", "Profile", "profile"],
  ["Description", "Description", "description"],
];
const CAPITALIZED_DISPLAY_COLUMNS = new Set(["Industry/Sector", "Project Profile", "Description"]);

function textValue(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim();
}

function mobileLayoutActive() {
  return typeof window !== "undefined" && window.matchMedia?.(MOBILE_LAYOUT_QUERY).matches;
}

function capitalizeFirstLetter(value) {
  const text = textValue(value);
  if (!text) {
    return "";
  }
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function displayValue(column, value) {
  if (CAPITALIZED_DISPLAY_COLUMNS.has(column)) {
    return capitalizeFirstLetter(value);
  }
  return textValue(value);
}

function escapeHtml(value) {
  return textValue(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function defaultFullscreenAssistantHistoryHeight() {
  if (typeof window === "undefined") {
    return DEFAULT_ASSISTANT_FULLSCREEN_HISTORY_HEIGHT;
  }
  const maxAvailableHistoryHeight = window.innerHeight - 196;
  return Math.round(Math.min(Math.max(window.innerHeight * 0.5, 260), maxAvailableHistoryHeight, 560));
}

function projectKey(row) {
  return textValue(row?.["Project ID"]) || projectLabel(row);
}

function projectPopupHtml(row, detailed = false) {
  const projectId = textValue(row["Project ID"]) || "No Project ID";
  const projectName = textValue(row["Project Name"]) || projectLabel(row);
  const title =
    `<div class="project-popup-title">` +
    `<strong>${escapeHtml(`${projectId} - ${projectName}`)}</strong>` +
    `</div>`;

  if (!detailed) {
    return title;
  }

  const details = ["Client", "Manager", "Industry/Sector", "Project Profile"]
    .map((column) => {
      const value = displayValue(column, row[column]);
      if (!value) {
        return "";
      }
      return (
        `<div class="project-popup-field">` +
        `<dt>${escapeHtml(column)}</dt>` +
        `<dd>${escapeHtml(value)}</dd>` +
        `</div>`
      );
    })
    .join("");

  return `${title}<dl class="project-popup-details">${details}</dl>`;
}

function refreshMapSize(map) {
  window.setTimeout(() => {
    map?.invalidateSize();
  }, 0);
  window.setTimeout(() => {
    map?.invalidateSize();
  }, 160);
}

async function searchApi({ password, filters = {}, page = 1, pageSize = DEFAULT_PAGE_SIZE, includeAll = false }) {
  const response = await fetch("/api/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      password,
      filters,
      page,
      pageSize,
      includeAll,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || `Search request failed with ${response.status}`);
  }
  return body;
}

async function assistantApi({
  password,
  prompt,
  currentFilters = {},
  rows = [],
  conversationHistory = [],
  purpose = "classify",
}) {
  const response = await fetch("/api/assistant", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      password,
      prompt,
      currentFilters,
      rows: rows.slice(0, MAX_ASSISTANT_CONTEXT_ROWS),
      resultCount: rows.length,
      conversationHistory,
      purpose,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || `Assistant request failed with ${response.status}`);
  }
  return body;
}

function LoginView({ onLogin, pageSize }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [logoFailed, setLogoFailed] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    try {
      const initialPayload = await searchApi({ password, filters: {}, page: 1, pageSize });
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
          Project Showcase
          <span>WML Structural Group</span>
        </h1>
        <div className="login-row">
          <input
            id="password"
            type="password"
            aria-label="Password"
            placeholder="Password"
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

function SearchField({ id, label, value, placeholder, onChange, onEnter, compact = false }) {
  return (
    <label className={`field ${compact ? "compact" : ""}`} htmlFor={id}>
      {compact ? null : <span>{label}</span>}
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

function ActionButton({ children, icon: Icon, className = "", ...props }) {
  return (
    <button className={`icon-button ${className}`.trim()} type="button" {...props}>
      {Icon ? <Icon size={16} aria-hidden="true" /> : null}
      <span>{children}</span>
    </button>
  );
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

function ProjectResult({ row, selected = false, onSelect }) {
  const projectId = textValue(row["Project ID"]) || "No Project ID";
  const projectName = textValue(row["Project Name"]) || projectLabel(row);
  const mapUrl = googleMapsUrl(row);
  const kml = projectKml(row);
  const folderPath = projectFolderPath(row);
  const [folderCopyStatus, setFolderCopyStatus] = useState("idle");
  const folderCopyTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      window.clearTimeout(folderCopyTimerRef.current);
    };
  }, []);

  function downloadKml() {
    if (!kml) {
      return;
    }
    downloadText(safeKmlName(row), kml, "application/vnd.google-earth.kml+xml;charset=utf-8");
  }

  async function copyFolderPath() {
    if (!folderPath) {
      return;
    }

    window.clearTimeout(folderCopyTimerRef.current);
    try {
      await copyTextToClipboard(folderPath);
      setFolderCopyStatus("copied");
    } catch (error) {
      setFolderCopyStatus("failed");
    }
    folderCopyTimerRef.current = window.setTimeout(() => {
      setFolderCopyStatus("idle");
    }, 1600);
  }

  return (
    <article className={`result-row ${selected ? "selected" : ""}`}>
      <div className="result-main">
        <h3 className="result-title">
          <button className="project-id-link" type="button" onClick={() => onSelect?.(row)}>
            {projectId}
          </button>
          <span>- {projectName}</span>
          {folderPath ? (
            <ActionButton className="inline-folder-button" icon={FolderOpen} onClick={copyFolderPath} title={folderPath}>
              {folderCopyStatus === "copied" ? "Copied" : folderCopyStatus === "failed" ? "Failed" : "Folder"}
            </ActionButton>
          ) : null}
        </h3>
        <dl>
          {["Client", "Manager", "Industry/Sector", "Project Profile", "Description"].map((column) => {
            const value = displayValue(column, row[column]);
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
      <div className="result-actions" onClick={(event) => event.stopPropagation()}>
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

function IconOnlyButton({ icon: Icon, label, className = "", ...props }) {
  return (
    <button className={`icon-only-button ${className}`.trim()} type="button" aria-label={label} title={label} {...props}>
      <Icon size={20} aria-hidden="true" />
    </button>
  );
}

function MapSearchOverlay({ filters, onChange, onSubmit, onClear, onFiltersOpenChange }) {
  const [filtersOpen, setFiltersOpen] = useState(false);

  function toggleFiltersOpen() {
    setFiltersOpen((value) => {
      const nextValue = !value;
      onFiltersOpenChange?.(nextValue);
      return nextValue;
    });
  }

  return (
    <form className="map-search-overlay" onSubmit={onSubmit}>
      <div className="map-search-primary">
        <SearchField
          id="map-keyword"
          label="Keyword"
          value={filters.keywordText}
          placeholder="Keyword"
          onChange={(value) => onChange("keywordText", value)}
          onEnter={onSubmit}
          compact
        />
        <SearchField
          id="map-client"
          label="Client"
          value={filters.clientText}
          placeholder="Client"
          onChange={(value) => onChange("clientText", value)}
          onEnter={onSubmit}
          compact
        />
        <SearchField
          id="map-manager"
          label="Manager"
          value={filters.managerText}
          placeholder="Manager"
          onChange={(value) => onChange("managerText", value)}
          onEnter={onSubmit}
          compact
        />
        <div className="map-search-actions">
          <IconOnlyButton icon={Search} label="Search" type="submit" />
          <IconOnlyButton icon={X} label="Clear" onClick={onClear} />
          <IconOnlyButton
            icon={SlidersHorizontal}
            label="Filters"
            className={`icon-only-button mobile-filter-toggle ${filtersOpen ? "active" : ""}`}
            onClick={toggleFiltersOpen}
          />
        </div>
      </div>
      <div className={`mobile-filter-panel ${filtersOpen ? "open" : ""}`}>
        <SearchField
          id="mobile-map-client"
          label="Client"
          value={filters.clientText}
          placeholder="Client"
          onChange={(value) => onChange("clientText", value)}
          onEnter={onSubmit}
          compact
        />
        <SearchField
          id="mobile-map-manager"
          label="Manager"
          value={filters.managerText}
          placeholder="Manager"
          onChange={(value) => onChange("managerText", value)}
          onEnter={onSubmit}
          compact
        />
      </div>
    </form>
  );
}

function activeFilterSummary(filters = {}) {
  const entries = [
    ["Keyword", filters.keywordText],
    ["Project ID", filters.projectIdText],
    ["Client", filters.clientText],
    ["Manager", filters.managerText],
    ["Start from", filters.startDateFrom],
    ["Start to", filters.startDateTo],
  ].filter(([, value]) => textValue(value));

  if (!entries.length) {
    return "No filters applied.";
  }

  return entries.map(([label, value]) => `${label}: ${value}`).join(" | ");
}

function AssistantPanel({
  onSubmit,
  onClear,
  loading,
  history,
  pendingPrompt,
  error,
  resultCount,
  historyHeight,
  onHistoryResize,
  className = "",
  collapsible = false,
  defaultCollapsed = false,
  compactCollapsed = false,
  compactCollapsedLabel = false,
}) {
  const [prompt, setPrompt] = useState("");
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const historyRef = useRef(null);
  const lastHistoryHeightRef = useRef(historyHeight);
  const resizingHistoryRef = useRef(false);
  const speechRecognitionRef = useRef(null);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const canSubmit = Boolean(prompt.trim()) && !loading;
  const canClear = Boolean(prompt.trim() || history.length || error || pendingPrompt) && !loading;

  useEffect(() => {
    lastHistoryHeightRef.current = historyHeight;
  }, [historyHeight]);

  useEffect(() => {
    setCollapsed(defaultCollapsed);
  }, [defaultCollapsed]);

  useEffect(() => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    setSpeechSupported(Boolean(Recognition));

    return () => {
      speechRecognitionRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const node = historyRef.current;
    if (!node || typeof ResizeObserver === "undefined") {
      return undefined;
    }

    const observer = new ResizeObserver(([entry]) => {
      if (!resizingHistoryRef.current) {
        return;
      }
      const nextHeight = Math.round(entry.contentRect.height);
      if (!Number.isFinite(nextHeight) || nextHeight < 120) {
        return;
      }
      if (Math.abs(nextHeight - lastHistoryHeightRef.current) <= 1) {
        return;
      }
      lastHistoryHeightRef.current = nextHeight;
      onHistoryResize(nextHeight);
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, [onHistoryResize]);

  useEffect(() => {
    function stopResizingHistory() {
      window.setTimeout(() => {
        resizingHistoryRef.current = false;
      }, 0);
    }

    window.addEventListener("pointerup", stopResizingHistory);
    window.addEventListener("pointercancel", stopResizingHistory);
    return () => {
      window.removeEventListener("pointerup", stopResizingHistory);
      window.removeEventListener("pointercancel", stopResizingHistory);
    };
  }, []);

  useEffect(() => {
    if (historyRef.current) {
      historyRef.current.scrollTop = historyRef.current.scrollHeight;
    }
  }, [history.length, loading]);

  function submit(event) {
    event.preventDefault();
    const nextPrompt = prompt.trim();
    if (!nextPrompt || loading) {
      return;
    }
    onSubmit(nextPrompt);
    setPrompt("");
  }

  function handlePromptKeyDown(event) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }
    event.preventDefault();
    submit(event);
  }

  function clearAssistant() {
    setPrompt("");
    onClear();
  }

  function toggleVoiceInput() {
    if (listening) {
      speechRecognitionRef.current?.stop();
      return;
    }

    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      return;
    }

    const recognition = new Recognition();
    recognition.lang = navigator.language || "en-AU";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .slice(event.resultIndex)
        .filter((result) => result.isFinal)
        .map((result) => result[0]?.transcript || "")
        .join(" ")
        .trim();

      if (transcript) {
        setPrompt((currentPrompt) => `${currentPrompt}${currentPrompt ? " " : ""}${transcript}`);
      }
    };

    speechRecognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      setListening(false);
    }
  }

  const assistantTitle = compactCollapsedLabel ? "AI" : "AI Assistant";
  const HistoryToggleIcon = collapsed ? ChevronDown : ChevronUp;
  const showHistory = !collapsed;

  return (
    <section
      className={`assistant-panel ${collapsed ? "collapsed" : ""} ${
        compactCollapsed ? "compact-collapsed" : ""
      } ${className}`.trim()}
      aria-label="AI Assistant"
    >
      {collapsible && compactCollapsed && collapsed ? (
        <button
          className="assistant-collapse-button"
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          aria-label="Open AI assistant"
        >
          <span>AI</span>
        </button>
      ) : null}
      {compactCollapsed && collapsed ? null : (
        <div className="assistant-content">
        <form className="assistant-form" onSubmit={submit}>
          <div className="assistant-input-shell">
            <h2>{assistantTitle}</h2>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={handlePromptKeyDown}
              placeholder="Ask AI about projects..."
              rows={1}
            />
            {speechSupported ? (
              <button
                className={`assistant-voice-button ${listening ? "listening" : ""}`}
                type="button"
                onClick={toggleVoiceInput}
                aria-label={listening ? "Stop voice input" : "Start voice input"}
                title={listening ? "Stop voice input" : "Start voice input"}
              >
                {listening ? <Square size={14} aria-hidden="true" /> : <Mic size={16} aria-hidden="true" />}
              </button>
            ) : null}
            <button
              className={`assistant-send-button ${loading ? "loading" : canSubmit ? "ready" : "idle"}`}
              type="submit"
              disabled={!canSubmit}
              aria-label={loading ? "Working" : "Run assistant"}
            >
              {loading ? <RefreshCw size={16} aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}
            </button>
          </div>
        </form>
        {collapsible ? (
          <div className="assistant-history-control">
            <button
              className="assistant-history-toggle"
              type="button"
              onClick={() => setCollapsed((value) => !value)}
              aria-expanded={showHistory}
            >
              <span>Conversation history</span>
            </button>
            {canClear ? (
              <button
                className="assistant-clear-button"
                type="button"
                onClick={clearAssistant}
                aria-label="Clear AI history"
                title="Clear AI history"
              >
                <X size={12} aria-hidden="true" />
                <span>Clear</span>
              </button>
            ) : null}
            <button
              className="assistant-history-toggle-icon"
              type="button"
              onClick={() => setCollapsed((value) => !value)}
              aria-label={showHistory ? "Collapse conversation history" : "Expand conversation history"}
              title={showHistory ? "Collapse conversation history" : "Expand conversation history"}
            >
              <HistoryToggleIcon size={14} aria-hidden="true" />
            </button>
          </div>
        ) : null}
        {showHistory ? (
          <>
            {error ? <p className="assistant-error">{error}</p> : null}
            <div
              className="assistant-history"
              aria-label="AI conversation history"
              ref={historyRef}
              style={{ height: `${historyHeight}px` }}
              onPointerDown={() => {
                resizingHistoryRef.current = true;
              }}
            >
              {!history.length && !loading ? (
                <p className="assistant-empty-history">Conversation History</p>
              ) : null}
              {history.map((entry) => (
                <article className="assistant-history-entry" key={entry.id}>
                  <div className="assistant-user-message">{entry.prompt}</div>
                  <div className="assistant-response">
                    <div className="assistant-response-meta">
                      <span>{entry.response.intent.replaceAll("_", " ")}</span>
                      {typeof entry.resultCount === "number" ? (
                        <span>{entry.resultCount.toLocaleString()} matching projects</span>
                      ) : null}
                    </div>
                    {entry.response.filters ? (
                      <p className="assistant-filter-summary">{activeFilterSummary(entry.response.filters)}</p>
                    ) : null}
                    <div className="assistant-message">{entry.response.message}</div>
                  </div>
                </article>
              ))}
              {loading ? (
                <article className="assistant-history-entry pending">
                  <div className="assistant-user-message">{pendingPrompt}</div>
                  <div className="assistant-response">
                    <div className="assistant-response-meta">
                      <span>working</span>
                      {typeof resultCount === "number" ? <span>{resultCount.toLocaleString()} matching projects</span> : null}
                    </div>
                    <div className="assistant-message">Preparing a response...</div>
                  </div>
                </article>
              ) : null}
            </div>
            <p className="assistant-review-note">
              Review AI-generated content before using it with clients.
            </p>
          </>
        ) : null}
        </div>
      )}
    </section>
  );
}

function ResultsMap({
  rows,
  total,
  totalLabel,
  selectedProjectKey,
  onProjectSelect,
  filters,
  onFilterChange,
  onSearchSubmit,
  onSearchClear,
  panelRef,
  fullscreenAssistant,
  onFullscreenUiChange,
}) {
  const internalMapPanelRef = useRef(null);
  const mapPanelRef = panelRef || internalMapPanelRef;
  const mapElementRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const fittedRowsSignatureRef = useRef("");
  const [mapSize, setMapSize] = useState("compact");
  const [collapsed, setCollapsed] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenFallback, setFullscreenFallback] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [mobileFullscreenControls, setMobileFullscreenControls] = useState(false);
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
  const fullscreenActive =
    fullscreen && typeof document !== "undefined" && document.fullscreenElement === mapPanelRef.current;
  const showFullscreenUi = fullscreenFallback || fullscreen || fullscreenActive;
  const selectedMappedItem = useMemo(
    () => mappedRows.find(({ row }) => projectKey(row) === selectedProjectKey),
    [mappedRows, selectedProjectKey],
  );

  useEffect(() => {
    if (!mapElementRef.current || mapRef.current) {
      return;
    }

    mapRef.current = L.map(mapElementRef.current, {
      scrollWheelZoom: false,
      zoomControl: false,
    }).setView([-31.95, 115.86], 6);
    mapRef.current.attributionControl.setPrefix(false);
    L.control.zoom({ position: "bottomright" }).addTo(mapRef.current);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>',
    }).addTo(mapRef.current);

    layerRef.current = L.layerGroup().addTo(mapRef.current);
    refreshMapSize(mapRef.current);

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

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
      marker.bindPopup(projectPopupHtml(row, showFullscreenUi), {
        maxWidth: showFullscreenUi ? 520 : 280,
      });
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
      } else {
        map.setView([-31.95, 115.86], 6);
      }
    }
    refreshMapSize(map);
  }, [mappedRows, mappedRowsSignature, onProjectSelect, selectedProjectKey, showFullscreenUi]);

  useEffect(() => {
    if (!selectedMappedItem || !mapRef.current) {
      return;
    }

    const { latitude, longitude } = selectedMappedItem.coordinates;
    mapRef.current.panTo([latitude, longitude], {
      animate: true,
    });
  }, [selectedMappedItem]);

  useEffect(() => {
    function handleFullscreenChange() {
      const isMapFullscreen = Boolean(document.fullscreenElement && document.fullscreenElement === mapPanelRef.current);
      setFullscreen(isMapFullscreen);
      if (isMapFullscreen) {
        setFullscreenFallback(false);
      }
      refreshMapSize(mapRef.current);
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    refreshMapSize(mapRef.current);
  }, [mapSize, collapsed, showFullscreenUi]);

  useEffect(() => {
    onFullscreenUiChange?.(showFullscreenUi);
  }, [onFullscreenUiChange, showFullscreenUi]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return undefined;
    }

    const mediaQuery = window.matchMedia("(max-width: 520px), (hover: none) and (pointer: coarse)");
    const updateMobileFullscreenControls = () => {
      setMobileFullscreenControls(mediaQuery.matches);
    };
    updateMobileFullscreenControls();
    mediaQuery.addEventListener?.("change", updateMobileFullscreenControls);
    return () => {
      mediaQuery.removeEventListener?.("change", updateMobileFullscreenControls);
    };
  }, []);

  function enableScrollZoom() {
    mapRef.current?.scrollWheelZoom.enable();
  }

  function disableScrollZoom() {
    mapRef.current?.scrollWheelZoom.disable();
  }

  async function toggleFullscreen() {
    if (fullscreenFallback) {
      setFullscreenFallback(false);
      refreshMapSize(mapRef.current);
      return;
    }

    if (document.fullscreenElement === mapPanelRef.current) {
      await document.exitFullscreen?.();
      return;
    }

    setCollapsed(false);
    if (mapPanelRef.current?.requestFullscreen) {
      try {
        await mapPanelRef.current.requestFullscreen();
        if (document.fullscreenElement === mapPanelRef.current) {
          setFullscreen(true);
        } else {
          setFullscreenFallback(true);
        }
      } catch {
        setFullscreenFallback(true);
      }
    } else {
      setFullscreenFallback(true);
    }
    refreshMapSize(mapRef.current);
  }

  const renderedFullscreenAssistant =
    mobileFullscreenControls && isValidElement(fullscreenAssistant)
      ? cloneElement(fullscreenAssistant, {
          key: "mobile-fullscreen-assistant",
          collapsible: true,
          defaultCollapsed: true,
          compactCollapsed: true,
        })
      : fullscreenAssistant;

  return (
    <section
      className={`results-map-panel ${fullscreenFallback ? "fullscreen-fallback" : ""} ${
        showFullscreenUi ? "show-fullscreen-ui" : ""
      } ${mobileFiltersOpen ? "mobile-filters-open" : ""
      }`.trim()}
      ref={mapPanelRef}
    >
      <div className="map-stage">
        <MapSearchOverlay
          filters={filters}
          onChange={onFilterChange}
          onSubmit={onSearchSubmit}
          onClear={onSearchClear}
          onFiltersOpenChange={setMobileFiltersOpen}
        />
        {renderedFullscreenAssistant ? <div className="map-assistant-overlay">{renderedFullscreenAssistant}</div> : null}
        <button
          className="map-fullscreen-button"
          type="button"
          onClick={toggleFullscreen}
          title={showFullscreenUi ? "Exit full screen" : "Full screen"}
          aria-label={showFullscreenUi ? "Exit full screen" : "Full screen"}
        >
          {showFullscreenUi ? <Minimize2 size={17} aria-hidden="true" /> : <Maximize2 size={17} aria-hidden="true" />}
        </button>
        <div
          className={`map-canvas ${mapSize === "large" ? "large" : ""} ${collapsed ? "collapsed" : ""}`}
          ref={mapElementRef}
          aria-label="Search results map"
          onMouseEnter={enableScrollZoom}
          onMouseLeave={disableScrollZoom}
        />
      </div>
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
                <td key={column}>{displayValue(column, row[column])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MobileResultsTable({ rows, selectedProjectKey, onSelect }) {
  return (
    <div className="table-wrap mobile-results-table">
      <table>
        <colgroup>
          {MOBILE_RESULT_COLUMNS.map(([, label, key]) => (
            <col key={label} className={`mobile-col-${key}`} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {MOBILE_RESULT_COLUMNS.map(([, label]) => (
              <th key={label}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const rowKey = projectKey(row);
            const selected = Boolean(selectedProjectKey) && rowKey === selectedProjectKey;
            return (
              <tr key={`${rowKey || "project"}-${index}`} className={selected ? "selected-mobile-row" : ""}>
                {MOBILE_RESULT_COLUMNS.map(([column, label]) => (
                  <td key={column}>
                    {column === "Project ID" ? (
                      <button className="project-id-link" type="button" onClick={() => onSelect?.(row)}>
                        {textValue(row[column]) || "No ID"}
                      </button>
                    ) : (
                      <span className="mobile-cell-text" title={displayValue(column, row[column])}>
                        {displayValue(column, row[column]) ||
                          (label === "Client" || label === "Manager" ? "Not specified" : "")}
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
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
  const [startDateFrom, setStartDateFrom] = useState("");
  const [startDateTo, setStartDateTo] = useState("");
  const [submittedFilters, setSubmittedFilters] = useState({
    keywordText: "",
    projectIdText: "",
    clientText: "",
    managerText: "",
    startDateFrom: "",
    startDateTo: "",
  });
  const [assistantHistory, setAssistantHistory] = useState([]);
  const [assistantError, setAssistantError] = useState("");
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantPendingPrompt, setAssistantPendingPrompt] = useState("");
  const [assistantHistoryHeight, setAssistantHistoryHeight] = useState(DEFAULT_ASSISTANT_HISTORY_HEIGHT);
  const [fullscreenAssistantHistoryHeight, setFullscreenAssistantHistoryHeight] = useState(
    defaultFullscreenAssistantHistoryHeight,
  );
  const [mobileLayout, setMobileLayout] = useState(mobileLayoutActive);
  const [pageSize, setPageSize] = useState(() => (mobileLayoutActive() ? MOBILE_PAGE_SIZE : DEFAULT_PAGE_SIZE));
  const [page, setPage] = useState(1);
  const [mapRows, setMapRows] = useState([]);
  const [selectedMapProject, setSelectedMapProject] = useState(null);
  const mapSectionRef = useRef(null);

  const draftFilters = { keywordText, projectIdText, clientText, managerText, startDateFrom, startDateTo };
  const filters = submittedFilters;
  const searching = hasAnySearch(
    filters.keywordText,
    filters.projectIdText,
    filters.clientText,
    filters.managerText,
    filters.startDateFrom,
    filters.startDateTo,
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
  const mappedResultCount = mapRows.filter((row) => getProjectCoordinates(row)).length;
  const assistantPanelProps = {
    onSubmit: submitAssistant,
    onClear: clearAssistantHistory,
    loading: assistantLoading,
    history: assistantHistory,
    pendingPrompt: assistantPendingPrompt,
    error: assistantError,
    resultCount: payload?.total,
    historyHeight: assistantHistoryHeight,
    onHistoryResize: setAssistantHistoryHeight,
  };
  const fullscreenAssistantPanelProps = {
    ...assistantPanelProps,
    historyHeight: fullscreenAssistantHistoryHeight,
    onHistoryResize: setFullscreenAssistantHistoryHeight,
  };
  const handleMapFullscreenUiChange = (isFullscreen) => {
    if (isFullscreen) {
      setFullscreenAssistantHistoryHeight(defaultFullscreenAssistantHistoryHeight());
    }
  };

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return undefined;
    }

    const mediaQuery = window.matchMedia(MOBILE_LAYOUT_QUERY);
    const updateMobileLayout = () => {
      const nextMobileLayout = mediaQuery.matches;
      setMobileLayout(nextMobileLayout);
      setPageSize(nextMobileLayout ? MOBILE_PAGE_SIZE : DEFAULT_PAGE_SIZE);
      setPage(1);
    };

    updateMobileLayout();
    mediaQuery.addEventListener?.("change", updateMobileLayout);
    return () => mediaQuery.removeEventListener?.("change", updateMobileLayout);
  }, []);

  useEffect(() => {
    if (!authenticated || !password) {
      return;
    }

    let cancelled = false;
    setLoadError("");
    setMapRows([]);
    searchApi({ password, filters, page, pageSize })
      .then((nextPayload) => {
        if (!cancelled) {
          setPayload(nextPayload);
        }
        if (!cancelled && searching) {
          return searchApi({ password, filters, page: 1, includeAll: true });
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
    filters.startDateFrom,
    filters.startDateTo,
    page,
    pageSize,
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
    setStartDateFrom("");
    setStartDateTo("");
    setSubmittedFilters({
      keywordText: "",
      projectIdText: "",
      clientText: "",
      managerText: "",
      startDateFrom: "",
      startDateTo: "",
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

  function updateDraftFilter(key, value) {
    const setters = {
      keywordText: setKeywordText,
      projectIdText: setProjectIdText,
      clientText: setClientText,
      managerText: setManagerText,
      startDateFrom: setStartDateFrom,
      startDateTo: setStartDateTo,
    };
    setters[key]?.(value);
  }

  function applyFilters(nextFilters) {
    const normalized = {
      keywordText: textValue(nextFilters.keywordText),
      projectIdText: textValue(nextFilters.projectIdText),
      clientText: textValue(nextFilters.clientText),
      managerText: textValue(nextFilters.managerText),
      startDateFrom: textValue(nextFilters.startDateFrom),
      startDateTo: textValue(nextFilters.startDateTo),
    };
    setKeywordText(normalized.keywordText);
    setProjectIdText(normalized.projectIdText);
    setClientText(normalized.clientText);
    setManagerText(normalized.managerText);
    setStartDateFrom(normalized.startDateFrom);
    setStartDateTo(normalized.startDateTo);
    setSubmittedFilters(normalized);
    setSelectedMapProject(null);
    setPage(1);
    return normalized;
  }

  async function runAssistantAnalysis(prompt, contextRows, contextFilters = filters) {
    return assistantApi({
      password,
      prompt,
      currentFilters: contextFilters,
      rows: contextRows,
      conversationHistory: assistantCaseMemory(),
      purpose: "analyze_results",
    });
  }

  function assistantCaseMemory() {
    return assistantHistory.flatMap((entry) => [
      { role: "user", content: entry.prompt },
      { role: "assistant", content: entry.response?.message },
    ]);
  }

  function appendAssistantHistory(promptText, response, resultCount) {
    setAssistantHistory((history) => [
      ...history,
      {
        id: `${Date.now()}-${history.length}`,
        prompt: promptText,
        response,
        resultCount,
      },
    ]);
  }

  function clearAssistantHistory() {
    setAssistantHistory([]);
    setAssistantError("");
    setAssistantPendingPrompt("");
    setAssistantHistoryHeight(DEFAULT_ASSISTANT_HISTORY_HEIGHT);
    setFullscreenAssistantHistoryHeight(defaultFullscreenAssistantHistoryHeight());
  }

  async function submitAssistant(prompt) {
    setAssistantLoading(true);
    setAssistantPendingPrompt(prompt);
    setAssistantError("");
    try {
      const contextRows = searching ? mapRows : rows;
      const response = await assistantApi({
        password,
        prompt,
        currentFilters: filters,
        rows: contextRows,
        conversationHistory: assistantCaseMemory(),
      });

      if (response.intent === "needs_clarification") {
        appendAssistantHistory(
          prompt,
          {
            ...response,
            message: response.clarificationQuestion || response.message,
          },
          payload?.total,
        );
        return;
      }

      if (response.intent === "analyze_current_results") {
        if (!contextRows.length) {
          appendAssistantHistory(
            prompt,
            {
              intent: "needs_clarification",
              message: "Please search for a project type first, or include the project type you want summarized.",
            },
            0,
          );
          return;
        }

        const analysis = await runAssistantAnalysis(prompt, contextRows, filters);
        appendAssistantHistory(
          prompt,
          {
            ...analysis,
            intent: "analyze_current_results",
          },
          contextRows.length,
        );
        return;
      }

      const nextFilters = applyFilters(response.filters || {});
      const searchPayload = await searchApi({ password, filters: nextFilters, page: 1, includeAll: true });
      setMapRows(searchPayload.results || []);

      if (response.intent === "search_then_analyze") {
        const analysis = await runAssistantAnalysis(
          response.analysisInstruction || response.message,
          searchPayload.results || [],
          nextFilters,
        );
        const analysisResponse = {
          ...analysis,
          intent: "search_then_analyze",
          filters: nextFilters,
        };
        appendAssistantHistory(prompt, analysisResponse, searchPayload.total);
        return;
      }

      const searchResponse = {
        ...response,
        intent: "search_only",
        filters: nextFilters,
        message: `${response.message} Found ${(searchPayload.total || 0).toLocaleString()} matching projects.`,
      };
      appendAssistantHistory(prompt, searchResponse, searchPayload.total);
    } catch (error) {
      setAssistantError(error.message);
    } finally {
      setAssistantLoading(false);
      setAssistantPendingPrompt("");
    }
  }

  function selectProjectFromList(row) {
    setSelectedMapProject(row);
    mapSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function downloadCsv() {
    try {
      const exportPayload = await searchApi({ password, filters, page: 1, includeAll: true });
      const columns = visibleColumns(exportPayload.results, DISPLAY_COLUMNS);
      const csv = rowsToCsv(exportPayload.results, columns);
      const fileName = safeDownloadName(
        [keywordText, projectIdText, clientText, managerText, startDateFrom, startDateTo]
          .filter((value) => value.trim())
          .join(" "),
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
        pageSize={pageSize}
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
            <h1>Project Showcase | WML Structural Group</h1>
            <p>
              {payload
                ? `${payload.recordCount.toLocaleString()} project records from ${payload.sourceFileCount} files`
                : "Loading project records"}
            </p>
          </div>
        </div>
        <button className="ghost-button" type="button" onClick={logout}>
          <LogOut size={16} aria-hidden="true" />
          <span className="logout-label">Log out</span>
        </button>
      </header>

      {loadError ? <p className="error-banner">{loadError}</p> : null}

      <section className="results-section">
        {searching ? (
          <div className="section-heading">
            <h2>{total.toLocaleString()} matching projects</h2>
            {total > 0 ? (
              <p>
                {mappedResultCount.toLocaleString()} mapped projects | Showing {(currentPage - 1) * pageSize + 1}-
                {Math.min(currentPage * pageSize, total)} of{" "}
                {total.toLocaleString()}
              </p>
            ) : null}
            {total > 0 ? (
              <div className="result-export-actions">
                <ActionButton icon={Download} onClick={downloadCsv}>
                  CSV
                </ActionButton>
                <ActionButton icon={FileDown} onClick={downloadSearchKml}>
                  KML
                </ActionButton>
              </div>
            ) : null}
          </div>
        ) : null}
        <ResultsMap
          rows={searching ? mapRows : []}
          total={searching ? total : 0}
          totalLabel={searching ? `${total.toLocaleString()} matching results` : "preview mode"}
          selectedProjectKey={selectedMapProjectKey}
          onProjectSelect={setSelectedMapProject}
          filters={draftFilters}
          onFilterChange={updateDraftFilter}
          onSearchSubmit={submitSearch}
          onSearchClear={clearSearch}
          panelRef={mapSectionRef}
          fullscreenAssistant={<AssistantPanel {...fullscreenAssistantPanelProps} className="assistant-panel-fullscreen" collapsible />}
          onFullscreenUiChange={handleMapFullscreenUiChange}
        />
        <AssistantPanel
          {...assistantPanelProps}
          collapsible
          defaultCollapsed={mobileLayout}
          compactCollapsedLabel={mobileLayout}
        />
        {searching ? (
          <>
          {total > 0 ? (
            <div className="mobile-result-summary">
              <div className="mobile-result-text">
                <span>{total.toLocaleString()} projects</span>
                <span>
                  {mappedResultCount.toLocaleString()} mapped | {(currentPage - 1) * pageSize + 1}-
                  {Math.min(currentPage * pageSize, total)} of {total.toLocaleString()}
                </span>
              </div>
              <ActionButton icon={Download} onClick={downloadCsv} className="mobile-csv-button">
                CSV
              </ActionButton>
            </div>
          ) : null}
          {rows.length ? (
            <>
              <MobileResultsTable
                rows={displayRows}
                selectedProjectKey={selectedMapProjectKey}
                onSelect={selectProjectFromList}
              />
              <div className="result-list">
                {displayRows.map((row, index) => (
                  <ProjectResult
                    key={`${projectKey(row) || "project"}-${index}`}
                    row={row}
                    selected={Boolean(selectedMapProjectKey) && projectKey(row) === selectedMapProjectKey}
                    onSelect={selectProjectFromList}
                  />
                ))}
              </div>
            </>
          ) : (
            <p className="empty-state">No projects were found for the current search.</p>
          )}
          {total > pageSize ? (
            <PaginationControls
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setPage}
            />
          ) : null}
          </>
        ) : (
          <PreviewTable rows={rows} />
        )}
      </section>
      <footer className="site-footer">
        Developed by Wen Zhou, supervised by Steve Woodhouse and Jing Zhang
      </footer>
    </main>
  );
}
