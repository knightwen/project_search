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
            padding-top: 1rem;
            padding-bottom: 1rem;
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
            min-height: 1.75rem;
            padding: 0.15rem 0.45rem;
            font-size: 0.82rem;
            line-height: 1.1;
        }
        .project-divider {
            border: 0;
            border-top: 1px solid #e6e6e6;
            margin: 0.25rem 0 0.35rem 0;
        }
    </style>
    """,
    unsafe_allow_html=True,
)
st.title("Project Full-Text Multi-File Search System")
st.markdown(
    "This system can batch-load Excel/CSV files from the target folder and search across all project fields."
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
    """Render a map link with compatibility for older Streamlit versions."""
    if hasattr(container, "link_button"):
        try:
            container.link_button(label, url)
        except TypeError:
            container.link_button(label, url)
    else:
        container.markdown(f"[{label}]({url})")


def render_kml_download(container, row, key):
    """Render a KML download button with compatibility for older Streamlit versions."""
    kml_text = project_kml(row)
    kwargs = {
        "label": "KML",
        "data": kml_text.encode("utf-8"),
        "file_name": safe_kml_name(row),
        "mime": "application/vnd.google-earth.kml+xml",
        "key": key,
    }
    try:
        container.download_button(**kwargs)
    except TypeError:
        container.download_button(**kwargs)


def row_text(row, column):
    """Return a stripped string value from a row."""
    value = row.get(column, "")
    if pd.isna(value):
        return ""
    return str(value).strip()


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
        f"<div style='margin:0 0 0.15rem 0; line-height:1.28;'>{content}</div>",
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

        title_col, map_col, earth_col = st.columns([7, 1, 1])
        metadata = []
        if client:
            metadata.append(f"Client: {client}")
        if manager:
            metadata.append(f"Manager: {manager}")
        if sector:
            metadata.append(f"Sector: {sector}")

        metadata_html = ""
        if metadata:
            metadata_html = (
                "<div style='font-size:0.82rem; color:#666; margin-top:0.05rem; "
                f"line-height:1.15;'>{escape(' | '.join(metadata))}</div>"
            )
        title_col.markdown(
            "<div style='margin:0 0 0.1rem 0;'>"
            f"<div style='font-weight:600; margin:0; line-height:1.2;'>{escape(title)}</div>"
            f"{metadata_html}"
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

        render_body_text(("Profile", profile), ("Description", description))

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

    # Search input.
    search_text = st.text_input(
        "Enter search text, such as project name, client, location, keyword, or description:",
        "",
    )

    # Search only after the user enters text.
    if search_text.strip():
        query_lower = search_text.strip().lower()

        # Full-text search across all columns in each row.
        searchable_text = (
            combined_data.fillna("")
            .astype(str)
            .agg(" ".join, axis=1)
            .str.lower()
        )
        search_mask = searchable_text.str.contains(query_lower, na=False, regex=False)
        filtered_df = combined_data[search_mask]

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
                    file_name=safe_download_name(search_text),
                    mime="text/csv",
                )

                render_project_action_list(filtered_df.reset_index(drop=True))
            else:
                st.warning(f"No projects were found containing the search text '{search_text}'.")
    else:
        st.info("Enter text in the search box above to start searching.")

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
