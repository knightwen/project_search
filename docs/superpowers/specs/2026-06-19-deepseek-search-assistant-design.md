# DeepSeek Search Assistant Design

## Purpose

Add an English-only AI Assistant to the project search app for internal management users. The assistant helps users either drive the existing search interface from natural language or produce client-facing presentation text from the current filtered results.

## Scope

The first version uses the DeepSeek API with non-streaming responses. It supports three assistant intents:

- `search`: extract structured search filters and run a search.
- `presentation`: generate English presentation content from the current filtered results.
- `search_then_present`: extract filters, run the search, then generate presentation content from the matching results.

The assistant is visible directly on the main page. It is not a modal, and it does not replace the existing manual search controls.

## Search Filters

The assistant can update the existing search fields:

- `keywordText`
- `projectIdText`
- `clientText`
- `managerText`

It also adds date filtering by `Start Date`:

- `startDateFrom`
- `startDateTo`

Date expressions such as "last 10 years" should be interpreted by DeepSeek relative to the current server date and returned as ISO dates. The frontend and search API treat these dates as inclusive bounds.

## Backend

Add `/api/assistant`.

The endpoint receives:

- user prompt
- current filters
- current visible results, summarized to the fields useful for presentation
- current date
- password, for the same local authentication boundary used by search

The endpoint reads:

- `DEEPSEEK_API_KEY`
- `DEEPSEEK_MODEL`, defaulting to `deepseek-v4-flash`

It calls DeepSeek at `https://api.deepseek.com/chat/completions` using JSON output mode. The model must return a strict JSON object with one of the supported intents. The endpoint validates and normalizes the JSON before returning it to the frontend.

## Frontend

Add an `AI Assistant` panel to the page near the search/results area.

The panel includes:

- prompt textarea
- submit button
- example prompt chips
- status text
- assistant response area
- parsed search summary when a search is performed

For `search`, the frontend updates search fields, submits the search, and then displays the result count in the assistant panel.

For `presentation`, the frontend displays the returned English content without changing search filters.

For `search_then_present`, the frontend applies the filters, fetches matching results, and asks the assistant endpoint to produce presentation content for that new result set.

## Safety And Privacy

The DeepSeek API key remains server-side only. The frontend never receives it.

All assistant output is treated as draft text for management review before use with clients. The assistant can use all internal fields as context, but the system prompt instructs it to write professional client-facing English and avoid exposing sensitive internal phrasing unnecessarily.

## Testing

Add tests for:

- `Start Date` inclusive filtering.
- invalid or partial date filters.
- assistant response normalization for `search`, `presentation`, and `search_then_present`.
- assistant API behavior when the DeepSeek key is missing.

Run:

- `npm test`
- `npm run build`
