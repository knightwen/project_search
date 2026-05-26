"""
Project Full-Text Multi-File Search System.

This Streamlit app loads project data from Excel/CSV files in the local
data_folder directory, combines the records, and lets users search across all
available project fields. Run it with bash:

python -m streamlit run search.py
"""

import hmac
import os
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
    </style>
    """,
    unsafe_allow_html=True,
)
st.title("📂 Project Full-Text Multi-File Search System")
st.markdown(
    "This system can batch-load Excel/CSV files from the target folder and search across all project fields."
)

# Local folder path for project data files
# Supported file types: .xlsx, .xls, and .csv
FOLDER_PATH = "./data_folder"
SUPPORTED_EXTENSIONS = (".xlsx", ".xls", ".csv")
RESULT_TABLE_HEIGHT = 760
DISPLAY_COLUMNS = [
    "Project ID",
    "Project Name",
    "Client",
    "Manager",
    "Start Date",
    "Contract Amount",
    "Industry/Sector",
    "Key Words",
    "Description",
]


def check_password():
    """Stop the app unless the user enters the configured app password."""
    expected_password = st.secrets.get(
        "APP_PASSWORD",
        st.secrets.get("apppassword", os.environ.get("APP_PASSWORD", "")),
    )
    expected_password = str(expected_password)
    if not expected_password:
        st.error("App password is not configured.")
        st.stop()

    if st.session_state.get("authenticated"):
        return

    password = st.text_input("Password", type="password")
    if not password:
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
def load_and_combine_data(folder):
    """Load and combine all Excel/CSV files from the target folder."""
    if not os.path.exists(folder):
        return None, f"⚠️ Error: folder path '{folder}' was not found. Please create it and add Excel/CSV files."

    all_files = [
        f for f in os.listdir(folder) if f.lower().endswith(SUPPORTED_EXTENSIONS)
    ]
    if not all_files:
        return None, f"⚠️ Notice: no Excel/CSV files were found in '{folder}'."

    all_dfs = []
    for file_name in all_files:
        file_path = os.path.join(folder, file_name)
        try:
            # Read Project ID as text to avoid numeric formatting changes or leading-zero loss.
            if file_name.lower().endswith(".csv"):
                df = pd.read_csv(file_path, dtype={"Project ID": str})
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

    return combined_df, f"✅ Loaded and combined {len(all_files)} files with {len(combined_df)} project records."


# ==========================================
# 3. User interaction and search logic
# ==========================================
check_password()

# Load data.
combined_data, message = load_and_combine_data(FOLDER_PATH)

if combined_data is None:
    st.info(message)
else:
    # Show data loading status in the sidebar.
    st.sidebar.success(message)

    # Search input.
    search_text = st.text_input(
        "🔍 Enter search text, such as project name, client, location, keyword, or description:",
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

        results_to_show = filtered_df[existing_display_cols]

        # Display results.
        st.subheader(f"📊 Search Results ({len(results_to_show)} matching projects found)")

        if not results_to_show.empty:
            # Allow users to download the current search results as a CSV file.
            csv_buffer = results_to_show.to_csv(index=False).encode("utf-8")
            st.download_button(
                label="📥 Download Current Search Results (CSV)",
                data=csv_buffer,
                file_name=f"search_result_{search_text}.csv",
                mime="text/csv",
            )

            # Render an interactive table on the page.
            st.dataframe(
                results_to_show,
                use_container_width=True,
                height=RESULT_TABLE_HEIGHT,
            )
        else:
            st.warning(f"No projects were found containing the search text '{search_text}'.")
    else:
        st.info("💡 Enter text in the search box above to start searching.")

        # By default, preview the first 20 rows.
        st.subheader("📋 Project Data Preview (First 20 Rows)")
        existing_display_cols = [
            col for col in DISPLAY_COLUMNS if col in combined_data.columns
        ]
        st.dataframe(
            combined_data[existing_display_cols].head(20),
            use_container_width=True,
            height=RESULT_TABLE_HEIGHT,
        )
