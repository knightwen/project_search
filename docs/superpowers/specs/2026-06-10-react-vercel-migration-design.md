# React Vercel Migration Design

## Goal

Replace the Streamlit app with a Vite React static application that can be deployed on Vercel while preserving the current project search, CSV export, Google Maps links, KML downloads, and password gate.

## Architecture

The source Excel and CSV files remain in `data_folder`. A Python build script reads those files, normalizes columns, deduplicates by `Project ID`, keeps coordinate-rich records when duplicates exist, and writes `public/project-data.json`. The React app loads that JSON at runtime and performs all search/filter/export behavior in the browser.

## User Experience

The first screen shows a password form using the current password `20260526`. After login, users see a compact work-focused search interface with fields for keyword, project ID, client, and manager. Search results show project identity, client/manager details, sector/profile/description, map links, KML download actions, and CSV export for the current result set. With no query, the app previews the first 20 rows.

## Data Handling

The static JSON contains the data needed by the browser app. This is acceptable for the requested deployment model, but it means the deployed data is present in static frontend assets. The password gate is usability access control, not strong data isolation.

## Deployment

Vercel builds the app with `npm run build` and serves the `dist` directory. Data updates require running `python scripts/build-data.py`, committing the updated `public/project-data.json`, and redeploying through Vercel.

## Testing

Unit tests cover term matching, field-specific filters, CSV-safe names, map URL generation, KML generation, and row deduplication helpers where practical. A production build verifies the React app compiles for Vercel.
