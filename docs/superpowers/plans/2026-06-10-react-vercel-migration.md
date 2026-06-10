# React Vercel Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Vite React replacement for the Streamlit project search app and prepare it for Vercel deployment.

**Architecture:** A Python build step converts existing tabular data into static JSON. React loads the JSON and implements authentication, search, map links, KML downloads, CSV export, and preview behavior entirely client-side.

**Tech Stack:** React, Vite, Vitest, Python, pandas, openpyxl, Vercel static hosting.

---

### Task 1: Project Scaffold And Tests

**Files:**
- Create: `package.json`
- Create: `index.html`
- Create: `vite.config.js`
- Create: `src/lib/search.test.js`
- Create: `src/lib/kml.test.js`

- [ ] Add Vite, React, and Vitest configuration.
- [ ] Write failing tests for search filtering and KML helpers.
- [ ] Run `npm test -- --run` and confirm failures are from missing implementation.

### Task 2: Core Browser Logic

**Files:**
- Create: `src/lib/search.js`
- Create: `src/lib/kml.js`
- Create: `src/lib/export.js`

- [ ] Implement column normalization constants and term matching.
- [ ] Implement project filtering for keyword, project ID, client, and manager.
- [ ] Implement Google Maps URL, KML text, and safe file name helpers.
- [ ] Run `npm test -- --run` and confirm the unit tests pass.

### Task 3: Data Build Script

**Files:**
- Create: `scripts/build-data.py`
- Create: `public/project-data.json`

- [ ] Port the Streamlit data loading rules into a Python build script.
- [ ] Generate `public/project-data.json` from `data_folder`.
- [ ] Confirm the generated JSON includes metadata and normalized project records.

### Task 4: React Interface

**Files:**
- Create: `src/main.jsx`
- Create: `src/App.jsx`
- Create: `src/styles.css`

- [ ] Build the password view using password `20260526`.
- [ ] Build search inputs, status summary, preview, result list, CSV export, maps, and KML downloads.
- [ ] Use responsive CSS for desktop and mobile.

### Task 5: Deployment Docs And Verification

**Files:**
- Modify: `README.md`
- Create: `vercel.json`

- [ ] Document local development, data rebuild, and Vercel deployment.
- [ ] Run `python scripts/build-data.py`.
- [ ] Run `npm test -- --run`.
- [ ] Run `npm run build`.
