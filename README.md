# Project Full-Text Search

A lightweight Streamlit web app for searching project records from Excel/CSV files.

## What It Does

- Loads all `.xlsx`, `.xls`, and `.csv` files from `data_folder`
- Combines project records into one searchable table
- Searches by keyword, `Project ID`, client name, and manager
- Shows selected result columns
- Keeps Google Maps links and one-project KML downloads for records with coordinates
- Exports search results as CSV

## Local Run

```powershell
python -m pip install -r requirements.txt
python -m streamlit run search.py
```

## Deploy On Streamlit Community Cloud

1. Create a GitHub repository for this folder.
2. Keep `search.py`, `requirements.txt`, `.streamlit/config.toml`, and `data_folder` in the repository.
3. Go to Streamlit Community Cloud.
4. Create a new app from the GitHub repository.
5. Set the main file path to:

```text
search.py
```

6. Deploy the app and share the generated URL with your users.

## Data Updates

To update the website data, replace or add Excel/CSV files in `data_folder`, commit the changes, and push to GitHub. Streamlit Community Cloud will redeploy the app from the updated repository.

The consolidated file `data_folder/0_project_search_records.csv` is generated from the DataClean final project result workbooks and gives the site complete search coverage. The `6_project_locations_google_earth_*.xlsx` files preserve coordinate-rich map records. If the same `Project ID` appears in multiple files, the app keeps the row with valid coordinates.

## Notes

- If the project data is confidential, use a private GitHub repository and restrict app sharing.
- The `Manager` column is searchable and displayed when it exists in the source files.
