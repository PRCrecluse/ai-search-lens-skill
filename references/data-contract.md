# Inputs and report semantics

A brand config JSON supports:

```json
{
  "query": "best ai music video generator",
  "model": "gpt-6-astra",
  "brands": [
    { "name": "Freebeat", "aliases": ["Free Beat"], "domains": ["freebeat.ai"], "target": true },
    { "name": "Neural Frames", "aliases": ["neuralframes"], "domains": ["neuralframes.com"] }
  ]
}
```

Use hostnames without protocols or paths. Brand ownership includes exact hostnames and their subdomains, never suffix lookalikes. Matching is case-insensitive; Latin names use word boundaries. Aliases at the same text position count once.

The raw input is the REST response, not an SDK wrapper:

- `output[]` → `web_search_call`: preserve `id`, `status`, `action.type`, `action.query` / `action.queries`, and `action.sources[]`.
- `action.type` may be `search`, `open_page`, or `find_in_page`. Only `search` increments search calls.
- Assistant `message.content[]` → `output_text`: preserve `text` and `annotations[]` of type `url_citation`, including `url`, `title`, `start_index`, and `end_index`.
- The collector uses Responses API `web_search`, `tool_choice: "required"`, and `include: ["web_search_call.action.sources"]` with `store: false`.

The report counts visible query occurrences and unique query strings separately. URL identity is the exact returned string. Source-domain counts include only URLs actually returned in search source lists. Citation counts include annotation occurrences; cited URL counts are unique URLs. Imported response JSON is persisted without adding or removing API fields (file whitespace may change). The SHA-256 fingerprints `JSON.stringify(raw)` in JavaScript property order, not the original file bytes.

Output directory:

- `report.html`: standalone UI; can filter and inspect evidence offline.
- `report.json`: normalized, versioned report (`schemaVersion: 1`).
- `response.json`: original API response object.
- `answer.md`: report summary, answer, sources, and caveats.
- `config.json`: analysis inputs for reproducibility; never contains an API key.

Reference: https://developers.openai.com/api/docs/guides/tools-web-search
