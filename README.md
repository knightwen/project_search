# Project Full-Text Search

A Vite React web app for searching legacy project records generated from Excel/CSV files.

## What It Does

- Builds a private `data_private/project-data.json` file from `data_folder`
- Searches project records through a protected Vercel API route
- Shows project details in a responsive browser interface
- Opens Google Maps links for records with coordinates
- Downloads one-project KML files for Google Earth
- Exports the current search results as CSV
- Uses a server-side password check before any data is returned

## Local Setup

```powershell
python -m pip install -r requirements.txt
npm install
python scripts/build-data.py
npm run dev
```

The local Vite server prints the browser URL after it starts.

Local password configuration lives in `.env.local`:

```text
SEARCH_PASSWORD=wml_structure
```

This file is ignored by Git.

## Company Logo

Place the WML logo at:

```text
public/wml-logo.png
```

The login page and main header load that file as `/wml-logo.png`. If the file is missing, the app shows a simple `WML` text mark until the real logo is added.

## Vercel Deployment

1. Push this repository to GitHub.
2. Import the repository in Vercel.
3. Add this Vercel environment variable:

```text
SEARCH_PASSWORD=wml_structure
```

4. Use these settings:

```text
Framework Preset: Vite
Build Command: npm run build
Output Directory: dist
```

The included `vercel.json` already declares the build command and output directory.

## Data Updates

To update the website data:

```powershell
python scripts/build-data.py
git add data_folder data_private/project-data.json
git commit -m "data: update project search records"
git push
```

Vercel redeploys from the updated repository.

## Security Note

The generated data is no longer served from `public/`. It is read by `api/search.js` after the server-side password check. Keep the GitHub repository private if the source data itself is confidential, because Vercel deploys from the repository contents.
