# Project Full-Text Search

A Vite React web app for searching legacy project records generated from Excel/CSV files.

## What It Does

- Builds a static `public/project-data.json` file from `data_folder`
- Searches project records by keyword, `Project ID`, client name, and manager
- Shows project details in a responsive browser interface
- Opens Google Maps links for records with coordinates
- Downloads one-project KML files for Google Earth
- Exports the current search results as CSV
- Uses a lightweight browser password gate

## Local Setup

```powershell
python -m pip install -r requirements.txt
npm install
python scripts/build-data.py
npm run dev
```

The local Vite server prints the browser URL after it starts.

## Company Logo

Place the WML logo at:

```text
public/wml-logo.png
```

The login page and main header load that file as `/wml-logo.png`. If the file is missing, the app shows a simple `WML` text mark until the real logo is added.

## Vercel Deployment

1. Push this repository to GitHub.
2. Import the repository in Vercel.
3. Use these settings:

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
git add data_folder public/project-data.json
git commit -m "data: update project search records"
git push
```

Vercel redeploys from the updated repository.

## Security Note

The React app is deployed as static frontend assets. The generated project data is included in `public/project-data.json`, so the password gate is not strong server-side access control. For confidential data, use private repository controls, Vercel access controls, or a backend API with real authentication.
