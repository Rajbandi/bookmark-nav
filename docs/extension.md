# Browser extension

## Features

- **Save from the popup:** prefill the current page title and URL, then optionally choose a category, privacy setting, tags, or description. Private categories display a lock. Duplicate URLs show a warning with a Save anyway option.
- **Save links from the context menu:** right-click a link and choose **Save to Bookmark Nav**. Link text becomes the title. A green check badge indicates success; a red exclamation mark indicates failure.
- **AI autofill:** when AI is configured, fill the title, description, tags, and category with one request. The button is hidden when AI is unavailable.

## Installation during development

1. Run `npm run build:ext`. Output is written to `.output/chrome-mv3`.
2. Open `chrome://extensions`, enable **Developer mode**, select **Load unpacked**, and choose that directory.
3. Reload the extension after rebuilding. For daily development, use `npm run dev:ext` for automatic reload.

## Initial configuration

1. Open the popup and choose **Open settings**, or use the settings icon.
2. Enter the site URL, such as `http://localhost:5173` or your Worker URL.
3. Enter the access token starting with `bnav_`, generated on the admin Security page. Plaintext is displayed only when generated.
4. Choose **Save and verify**, allow site access when prompted, and wait for **Saved**.

The browser requests access once per site. Tokens have no scheduled expiration, and site permissions persist. Revoking or regenerating a token, or changing the administrator password, invalidates the old token.

## Everyday use

| Task | Action |
| --- | --- |
| Save the current page with edits | Open the popup, adjust category/privacy/tags, and choose Save bookmark |
| Save a link quickly | Right-click it and choose Save to Bookmark Nav |
| Review saved bookmarks | Open the public page or /admin |

## AI features

Configure and enable AI on the admin AI settings page, using built-in Workers AI or an OpenAI-compatible provider. Enable autofill as well.

AI autofill fetches page metadata, generates an English title, description, and tags, and maps the suggested category to an existing category ID. Review or edit the filled form before saving.

The endpoint is `POST /api/admin/metadata-ai`. If autofill is disabled, it returns `AI autofill is disabled`.

## Troubleshooting

| Symptom | Meaning | Action |
| --- | --- | --- |
| Setup prompt in the popup | Configuration is missing or incomplete | Open settings |
| Invalid or revoked token | Token was rotated, revoked, or invalidated by a password change | Generate a token in Security and update extension settings |
| Red exclamation badge after saving a link | Missing configuration, invalid token, or network failure | Check extension settings |
| Saved bookmark is absent from the public page | It may be private | Sign in to view it |

## Extension development

- Source: `src/extension/`, alongside `worker` and `react-app`.
- Build configuration: `wxt.config.ts`, supporting Chrome and Firefox. `@app` points to the main frontend for shared shadcn components.
- WXT reserves `@` for its srcDir. Shared component imports of `@/lib/utils` go through the forwarding shim in `src/extension/lib/utils.ts`.
- Tokens are stored in `chrome.storage.local`, avoiding sync to the browser account cloud.
- Read persistent state from storage because the MV3 service worker can stop between requests.
- Site access uses optional host permissions requested at runtime.
- See the `*:ext` commands in [commands.md](./commands.md).
