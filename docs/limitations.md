# Known limitations and recommendations

These notes come from the extension review in September 2026. Most items are non-blocking opportunities for future work.

## Known limitations

1. **The popup loads all bookmarks for duplicate detection.** This is acceptable for small collections but may slow down with thousands of bookmarks. A URL lookup endpoint would avoid loading the entire collection.
2. **Context-menu saving cannot choose categories, privacy, or tags.** It saves public, uncategorized bookmarks for speed. A lightweight confirmation panel could add these options later.
3. **The AI button uses the public aiEnabled flag.** If AI is enabled but autofill is disabled, the button may appear and return an error. A feature-specific availability flag would improve this.
4. **CORS accepts only extension origins.** Site host permission must be requested before connectivity checks. Reversing this order can cause a connection error under MV3.
5. **Store distribution is not yet complete.** Development builds are loaded unpacked. Store distribution requires packaged archives, listing materials, and a privacy policy.

## Recommendations

- Keep token infrastructure and extension changes in reviewable commits.
- Maintain the detailed documentation in `docs/`; keep the root README concise.
- Before store publishing, document what is sent to the user's server and what optional AI features send to the selected provider, and complete store privacy declarations.
- Preserve clear recovery guidance when password changes invalidate extension tokens.

## Roadmap

| Phase | Scope | Status |
| --- | --- | --- |
| 0 | Access tokens, Bearer authentication, CORS, and admin token management | Complete |
| 1 | Popup saving, context-menu saving, AI autofill, Chrome and Firefox builds | Complete |
| 2 | Omnibox search and a save shortcut (Cmd+Shift+S) | Not started |
| 3 | Improved AI categorization and a new-tab page | Not started |
| 4 | Store publishing, privacy policy, and declarations | Not started |
