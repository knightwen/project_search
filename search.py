"""
Project Full-Text Multi-File Search System.

This Streamlit app loads project data from Excel/CSV files in the local
data_folder directory, combines the records, and lets users search across all
available project fields. Run it with bash:

python -m streamlit run search.py
"""

import hmac
import os
import re
from html import escape

import pandas as pd
import streamlit as st

# ==========================================
# 1. Basic page configuration (Streamlit frontend)
# ==========================================
st.set_page_config(page_title="Project Data Full-Text Search System", layout="wide")
st.markdown(
    """
    <style>
        .block-container {
            max-width: 100%;
            padding-left: 1rem;
            padding-right: 1rem;
            padding-top: 2.75rem;
            padding-bottom: 1rem;
        }
        h1 {
            line-height: 1.25;
            padding-top: 0.2rem;
            padding-bottom: 0.25rem;
            margin-top: 0;
        }
        h2, h3 {
            line-height: 1.25;
        }
        div[data-testid="stHorizontalBlock"] {
            gap: 0.35rem;
        }
        div[data-testid="stVerticalBlock"] {
            gap: 0.35rem;
        }
        div[data-testid="column"] {
            padding: 0;
        }
        div[data-testid="stMarkdownContainer"] p {
            margin-bottom: 0.25rem;
        }
        div[data-testid="stButton"] button,
        div[data-testid="stDownloadButton"] button,
        div[data-testid="stLinkButton"] a {
            min-height: 2rem;
            padding: 0.25rem 0.55rem;
            font-size: 0.82rem;
            line-height: 1.2;
            white-space: nowrap;
        }
        .map-action-link {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-height: 2rem;
            width: 100%;
            padding: 0.25rem 0.55rem;
            border-radius: 0.35rem;
            border: 1px solid #2563eb;
            background: #2563eb;
            color: #ffffff !important;
            font-size: 0.82rem;
            font-weight: 600;
            line-height: 1.2;
            text-decoration: none !important;
            white-space: nowrap;
            box-sizing: border-box;
        }
        .map-action-link:hover {
            background: #1d4ed8;
            border-color: #1d4ed8;
            color: #ffffff !important;
            text-decoration: none !important;
        }
        .project-divider {
            border: 0;
            border-top: 1px solid #e6e6e6;
            margin: 0.08rem 0 0.22rem 0;
        }
    </style>
    """,
    unsafe_allow_html=True,
)
st.title("Project Full-Text Multi-File Search System")
st.markdown(
    "Search legacy project records by keyword, project ID, client, or manager. Map links and KML downloads are available for records with coordinates."
)

# Local folder path for project data files
# Supported file types: .xlsx, .xls, and .csv
FOLDER_PATH = "./data_folder"
SUPPORTED_EXTENSIONS = (".xlsx", ".xls", ".csv")
RESULT_TABLE_HEIGHT = 760
RESULT_ACTION_PAGE_SIZE = 20
LATITUDE_COLUMN = "Latitude"
LONGITUDE_COLUMN = "Longitude"
DISPLAY_COLUMNS = [
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
    "Description",
]
PROJECT_ID_COLUMNS = ("Project ID",)
CLIENT_COLUMNS = ("Client", "Client Name", "Original Client")
MANAGER_COLUMNS = ("Manager",)
KEYWORD_COLUMNS = (
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
)


def get_file_signature(folder):
    """Return a lightweight signature so cached data updates when files change."""
    if not os.path.exists(folder):
        return ()

    signatures = []
    for file_name in sorted(os.listdir(folder)):
        if not file_name.lower().endswith(SUPPORTED_EXTENSIONS):
            continue

        file_path = os.path.join(folder, file_name)
        try:
            stat = os.stat(file_path)
        except OSError:
            continue

        signatures.append((file_name, stat.st_mtime_ns, stat.st_size))

    return tuple(signatures)


def read_csv_with_fallback(file_path):
    """Read CSV files that may be saved as UTF-8, UTF-8 BOM, or GBK."""
    last_error = None
    for encoding in ("utf-8-sig", "utf-8", "gbk"):
        try:
            return pd.read_csv(file_path, dtype={"Project ID": str}, encoding=encoding)
        except UnicodeDecodeError as error:
            last_error = error

    raise last_error


def safe_download_name(search_text):
    """Build a Windows-safe CSV file name from the user's search text."""
    safe_text = re.sub(r'[<>:"/\\|?*\x00-\x1f]+', "_", search_text.strip())
    safe_text = safe_text.strip(" ._")
    if not safe_text:
        safe_text = "search"

    return f"search_result_{safe_text[:80]}.csv"


def safe_kml_name(row):
    """Build a safe KML file name for a selected project."""
    project_id = str(row.get("Project ID", "")).strip()
    project_name = str(row.get("Project Name", "")).strip()
    base_name = " ".join(part for part in (project_id, project_name) if part)
    if not base_name:
        base_name = "selected_project"

    safe_name = re.sub(r'[<>:"/\\|?*\x00-\x1f]+', "_", base_name)
    safe_name = safe_name.strip(" ._")
    return f"{safe_name[:80]}.kml"


def has_coordinates(df):
    """Return whether a dataframe contains latitude and longitude columns."""
    return LATITUDE_COLUMN in df.columns and LONGITUDE_COLUMN in df.columns


def coalesce_columns(df, target_column, source_columns):
    """Fill a normalized target column from the first non-empty source value."""
    if target_column not in df.columns:
        df[target_column] = ""
    else:
        df[target_column] = df[target_column].fillna("").astype(str)

    for source_column in source_columns:
        if source_column not in df.columns or source_column == target_column:
            continue

        target_values = df[target_column].fillna("").astype(str).str.strip()
        source_values = df[source_column].fillna("").astype(str).str.strip()
        df.loc[target_values == "", target_column] = source_values[target_values == ""]


def normalize_project_columns(df):
    """Normalize DataClean and map-export column names into the website display schema."""
    coalesce_columns(
        df,
        "Project Name",
        ("Project Name", "Generated Project Name", "Original Project Display Name"),
    )
    coalesce_columns(df, "Client", ("Client", "Client Name", "Original Client"))
    coalesce_columns(df, LATITUDE_COLUMN, (LATITUDE_COLUMN, "Google Latitude"))
    coalesce_columns(df, LONGITUDE_COLUMN, (LONGITUDE_COLUMN, "Google Longitude"))
    coalesce_columns(df, "Project Profile", ("Project Profile", "Job Type"))
    return df


def coordinate_score(df):
    """Return a score that helps keep coordinate-rich duplicate project rows."""
    if not has_coordinates(df):
        return pd.Series(0, index=df.index)

    latitude = pd.to_numeric(df[LATITUDE_COLUMN], errors="coerce")
    longitude = pd.to_numeric(df[LONGITUDE_COLUMN], errors="coerce")
    return (latitude.notna() & longitude.notna()).astype(int)


def get_project_coordinates(row):
    """Return numeric latitude and longitude from a project row."""
    latitude = pd.to_numeric(row.get(LATITUDE_COLUMN), errors="coerce")
    longitude = pd.to_numeric(row.get(LONGITUDE_COLUMN), errors="coerce")
    if pd.isna(latitude) or pd.isna(longitude):
        return None

    return float(latitude), float(longitude)


def google_maps_url(row):
    """Build a Google Maps URL for a project row."""
    coordinates = get_project_coordinates(row)
    if not coordinates:
        return ""

    latitude, longitude = coordinates
    return f"https://www.google.com/maps/search/?api=1&query={latitude},{longitude}"


def project_label(row):
    """Build a readable label for project selection controls."""
    project_id = str(row.get("Project ID", "")).strip()
    project_name = str(row.get("Project Name", "")).strip()
    if project_id and project_name:
        return f"{project_id} - {project_name}"
    if project_name:
        return project_name
    if project_id:
        return project_id
    return f"Row {row.name + 1}"


def project_kml(row):
    """Build a one-project KML file for Google Earth."""
    coordinates = get_project_coordinates(row)
    if not coordinates:
        return None

    latitude, longitude = coordinates
    name = project_label(row)
    description_parts = []
    for column in ("Project ID", "Client", "Manager", "Industry/Sector", "Key Words", "Description"):
        value = row.get(column)
        if pd.notna(value) and str(value).strip():
            description_parts.append(f"<b>{escape(column)}</b>: {escape(str(value))}")

    description = "<br/>".join(description_parts).replace("]]>", "]]&gt;")
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>{escape(name)}</name>
    <Placemark>
      <name>{escape(name)}</name>
      <description><![CDATA[{description}]]></description>
      <Point>
        <coordinates>{longitude},{latitude},0</coordinates>
      </Point>
    </Placemark>
  </Document>
</kml>
"""


def render_divider():
    """Render a divider with compatibility for older Streamlit versions."""
    st.markdown("<hr class='project-divider'>", unsafe_allow_html=True)


def render_map_button(container, label, url):
    """Render a reliable Google Maps link button."""
    if not url:
        container.caption("Map unavailable")
        return

    container.markdown(
        f"<a class='map-action-link' href='{escape(url)}' target='_blank' rel='noopener noreferrer'>{escape(label)}</a>",
        unsafe_allow_html=True,
    )


def render_kml_download(container, row, key):
    """Render a KML download button with compatibility for older Streamlit versions."""
    kml_text = project_kml(row)
    if not kml_text:
        container.caption("KML unavailable")
        return

    kwargs = {
        "label": "Download KML",
        "data": kml_text.encode("utf-8"),
        "file_name": safe_kml_name(row),
        "mime": "application/vnd.google-earth.kml+xml",
        "key": key,
    }
    try:
        container.download_button(**kwargs, type="primary")
    except TypeError:
        container.download_button(**kwargs)


def row_text(row, column):
    """Return a stripped string value from a row."""
    value = row.get(column, "")
    if pd.isna(value):
        return ""
    return str(value).strip()


def existing_columns(df, candidates):
    """Return candidate columns that exist in the loaded dataframe."""
    return [column for column in candidates if column in df.columns]


def text_for_columns(df, columns):
    """Build searchable lowercase text from selected columns."""
    usable_columns = existing_columns(df, columns)
    if not usable_columns:
        return pd.Series("", index=df.index)

    return df[usable_columns].fillna("").astype(str).agg(" ".join, axis=1).str.lower()


def contains_terms(series, text):
    """Return rows where all whitespace-separated terms exist in a text series."""
    mask = pd.Series(True, index=series.index)
    terms = [term.strip().lower() for term in text.split() if term.strip()]
    for term in terms:
        mask &= series.str.contains(term, na=False, regex=False)

    return mask


def filter_projects(df, keyword_text, project_id_text, client_text, manager_text):
    """Filter project rows using dedicated project ID, client, manager, and keyword inputs."""
    mask = pd.Series(True, index=df.index)

    if keyword_text.strip():
        mask &= contains_terms(text_for_columns(df, KEYWORD_COLUMNS), keyword_text)

    if project_id_text.strip():
        mask &= contains_terms(text_for_columns(df, PROJECT_ID_COLUMNS), project_id_text)

    if client_text.strip():
        mask &= contains_terms(text_for_columns(df, CLIENT_COLUMNS), client_text)

    if manager_text.strip():
        mask &= contains_terms(text_for_columns(df, MANAGER_COLUMNS), manager_text)

    return df[mask]


def has_any_search(*values):
    """Return whether the user entered at least one search value."""
    return any(value.strip() for value in values)


def render_body_text(*texts):
    """Render normal-sized project body text without markdown surprises."""
    lines = []
    for label, text in texts:
        if text:
            lines.append(f"<strong>{escape(label)}:</strong> {escape(text)}")

    if not lines:
        return

    content = "<br>".join(lines)
    st.markdown(
        f"<div style='margin:0 0 0.04rem 0; line-height:1.28;'>{content}</div>",
        unsafe_allow_html=True,
    )


def render_project_action_list(projects_df):
    """Render paginated search results with row-level map actions."""
    if projects_df.empty:
        return

    st.subheader("Map Actions")
    total_results = len(projects_df)
    total_pages = (total_results - 1) // RESULT_ACTION_PAGE_SIZE + 1

    if total_pages > 1:
        page_number = st.number_input(
            "Result page",
            min_value=1,
            max_value=total_pages,
            value=1,
            step=1,
        )
    else:
        page_number = 1

    start_index = (page_number - 1) * RESULT_ACTION_PAGE_SIZE
    end_index = start_index + RESULT_ACTION_PAGE_SIZE
    page_df = projects_df.iloc[start_index:end_index]

    st.caption(
        f"Showing {start_index + 1}-{min(end_index, total_results)} of {total_results} matching projects."
    )

    for row_position, row in page_df.iterrows():
        coordinates = get_project_coordinates(row)
        title = project_label(row)
        client = row_text(row, "Client")
        manager = row_text(row, "Manager")
        sector = row_text(row, "Industry/Sector")
        profile = row_text(row, "Project Profile")
        description = row_text(row, "Description")

        title_col, map_col, earth_col = st.columns([6, 1.35, 1.45])
        title_col.markdown(
            "<div style='margin:0 0 0.1rem 0;'>"
            f"<div style='font-weight:600; margin:0; line-height:1.2;'>{escape(title)}</div>"
            "</div>",
            unsafe_allow_html=True,
        )

        if coordinates:
            map_url = google_maps_url(row)
            render_map_button(map_col, "Open Map", map_url)
            render_kml_download(earth_col, row, f"kml_{row_position}")
        else:
            map_col.caption("Map unavailable")
            earth_col.caption("KML unavailable")

        render_body_text(
            ("Client", client),
            ("Manager", manager),
            ("Sector", sector),
            ("Profile", profile),
            ("Description", description),
        )

        render_divider()


def check_password():
    """Stop the app unless the user enters the configured app password."""
    expected_password = "20260526"

    if st.session_state.get("authenticated"):
        return

    password = st.text_input("Password", type="password")
    login_clicked = st.button("Log in")
    if not login_clicked:
        st.stop()

    if hmac.compare_digest(password, expected_password):
        st.session_state["authenticated"] = True
        st.rerun()

    st.error("Incorrect password.")
    st.stop()


# ==========================================
# 2. Core data processing logic (Pandas backend)
# ==========================================
@st.cache_data  # Streamlit cache: avoid reloading unchanged files on every interaction.
def load_and_combine_data(folder, file_signature):
    """Load and combine all Excel/CSV files from the target folder."""
    if not os.path.exists(folder):
        return None, f"Error: folder path '{folder}' was not found. Please create it and add Excel/CSV files."

    all_files = [
        f for f in sorted(os.listdir(folder)) if f.lower().endswith(SUPPORTED_EXTENSIONS)
    ]
    if not all_files:
        return None, f"Notice: no Excel/CSV files were found in '{folder}'."

    all_dfs = []
    for file_name in all_files:
        file_path = os.path.join(folder, file_name)
        try:
            # Read Project ID as text to avoid numeric formatting changes or leading-zero loss.
            if file_name.lower().endswith(".csv"):
                df = read_csv_with_fallback(file_path)
            else:
                df = pd.read_excel(file_path, dtype={"Project ID": str})
            # Track the source file for traceability.
            df["Source File"] = file_name
            all_dfs.append(df)
        except Exception as e:
            st.error(f"Error reading file {file_name}: {e}")

    if not all_dfs:
        return None, "No file data could be loaded successfully."

    # Combine all tables.
    combined_df = pd.concat(all_dfs, ignore_index=True)
    # Clean column names by removing possible leading/trailing spaces.
    combined_df.columns = combined_df.columns.str.strip()
    combined_df = normalize_project_columns(combined_df)

    if "Project ID" in combined_df.columns:
        combined_df["Project ID"] = combined_df["Project ID"].fillna("").astype(str).str.strip()
        combined_df["_coordinate_score"] = coordinate_score(combined_df)
        combined_df = (
            combined_df.sort_values("_coordinate_score", kind="stable")
            .drop_duplicates(subset=["Project ID"], keep="last")
            .drop(columns=["_coordinate_score"])
        )

    return combined_df, f"Loaded and combined {len(all_files)} files with {len(combined_df)} project records."


# ==========================================
# 3. User interaction and search logic
# ==========================================
check_password()

# Load data.
if st.sidebar.button("Refresh data"):
    load_and_combine_data.clear()

combined_data, message = load_and_combine_data(FOLDER_PATH, get_file_signature(FOLDER_PATH))

if combined_data is None:
    st.info(message)
else:
    # Show data loading status in the sidebar.
    st.sidebar.success(message)

    # Search inputs.
    keyword_col, id_col, client_col, manager_col = st.columns([2, 1, 1, 1])
    with keyword_col:
        keyword_text = st.text_input(
            "Keyword",
            "",
            placeholder="retaining wall certification treendale",
        )
    with id_col:
        project_id_text = st.text_input("Project ID", "", placeholder="8443")
    with client_col:
        client_text = st.text_input("Client name", "", placeholder="Calibre")
    with manager_col:
        manager_text = st.text_input("Manager", "", placeholder="MichaelKelly")

    # Search only after the user enters text.
    if has_any_search(keyword_text, project_id_text, client_text, manager_text):
        filtered_df = filter_projects(
            combined_data,
            keyword_text=keyword_text,
            project_id_text=project_id_text,
            client_text=client_text,
            manager_text=manager_text,
        )

        # Keep only columns that exist in the loaded data.
        existing_display_cols = [
            col for col in DISPLAY_COLUMNS if col in filtered_df.columns
        ]

        # Display results.
        st.subheader(f"Search Results ({len(filtered_df)} matching projects found)")

        if not existing_display_cols:
            st.warning("The loaded files do not contain any configured display columns.")
            render_project_action_list(filtered_df.reset_index(drop=True))
        else:
            results_to_show = filtered_df[existing_display_cols].copy()

            if not results_to_show.empty:
                # Allow users to download the current search results as a CSV file.
                csv_buffer = results_to_show.to_csv(index=False).encode("utf-8")
                st.download_button(
                    label="Download Current Search Results (CSV)",
                    data=csv_buffer,
                    file_name=safe_download_name(
                        " ".join(
                            value
                            for value in (keyword_text, project_id_text, client_text, manager_text)
                            if value.strip()
                        )
                    ),
                    mime="text/csv",
                )

                render_project_action_list(filtered_df.reset_index(drop=True))
            else:
                st.warning("No projects were found for the current search.")
    else:
        st.info("Enter a keyword, project ID, client name, or manager to start searching.")

        # By default, preview the first 20 rows.
        st.subheader("Project Data Preview (First 20 Rows)")
        existing_display_cols = [
            col for col in DISPLAY_COLUMNS if col in combined_data.columns
        ]
        if existing_display_cols:
            preview_df = combined_data[existing_display_cols].head(20)
        else:
            st.warning("The loaded files do not contain any configured display columns.")
            preview_df = combined_data.head(20)

        st.dataframe(preview_df, use_container_width=True, height=RESULT_TABLE_HEIGHT)
