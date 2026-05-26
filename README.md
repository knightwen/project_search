# Project Full-Text Search

A lightweight Streamlit web app for searching project records from Excel/CSV files.

## What It Does

- Loads all `.xlsx`, `.xls`, and `.csv` files from `data_folder`
- Combines project records into one searchable table
- Searches across all available project fields
- Shows selected result columns
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

## Notes

- If the project data is confidential, use a private GitHub repository and restrict app sharing.
- The `Manager` column is displayed only when it exists in the source files.
