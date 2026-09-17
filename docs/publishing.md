# Packaging and publishing

The extension uses WXT for builds, packaging, and automated submission. Create the initial store listings manually; WXT does not create them for you.

## Local packaging

```bash
npm run typecheck:ext        # Required before publishing
npm run build:ext            # Validate the Chrome build
npx wxt zip                  # Chrome installation archive
npx wxt -b firefox zip       # Firefox installation and source archives
```

Output is written to `.output/`:

| File | Purpose |
| --- | --- |
| `bookmark-nav-0.1.0-chrome.zip` | Chrome, Edge, Brave, and other Chromium browsers |
| `bookmark-nav-0.1.0-firefox.zip` | Firefox installation package |
| `bookmark-nav-0.1.0-sources.zip` | Source archive for Firefox AMO review |

The version comes from `package.json`. Source packaging excludes build output such as `dist/**` and hidden configuration files such as `.dev.vars` and `.env`.

## Automated submission with WXT

For subsequent releases, configure credentials and submit the prepared packages:

```bash
npx wxt submit init          # Configure credentials in .env.submit
npx wxt zip
npx wxt -b firefox zip
npx wxt submit --dry-run --chrome-zip .output/*-chrome.zip \
  --firefox-zip .output/*-firefox.zip --firefox-sources-zip .output/*-sources.zip
npx wxt submit --chrome-zip .output/*-chrome.zip \
  --firefox-zip .output/*-firefox.zip --firefox-sources-zip .output/*-sources.zip
```

Keep credentials in `.env.submit` and out of Git.

| Store | Variables |
| --- | --- |
| Chrome Web Store | `CHROME_EXTENSION_ID`, `CHROME_CLIENT_ID`, `CHROME_CLIENT_SECRET`, `CHROME_REFRESH_TOKEN` |
| Firefox AMO | `FIREFOX_EXTENSION_ID`, `FIREFOX_JWT_ISSUER`, `FIREFOX_JWT_SECRET` |

For Edge, reuse the Chrome archive and submit it through [Partner Center](https://aka.ms/PartnerCenterLogin).

## First Chrome Web Store listing

1. Register through the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole). Complete the account and payment requirements shown there.
2. Create a new item and upload the Chrome ZIP archive.
3. Complete the listing sections:
   - **Store Listing:** name, summary, screenshots, 128×128 icon, category, and supported language. Describe one-click saving to a self-hosted Bookmark Nav site.
   - **Privacy:** declare the bookmark-management purpose and accurately describe data handling. Saving sends page URLs and titles to the configured server; optional AI processing uses the selected provider.
   - **Distribution:** visibility and supported regions.
   - **Test instructions:** provide any setup details and demo access needed for review.
4. Submit for review, then publish using the options available in the dashboard.
5. For updates, upload a new version, submit for review, and publish. WXT can automate submission.

The repository includes packaging configuration and a minimal permission set: `storage`, `activeTab`, `contextMenus`, and optional site access. Prepare store screenshots, review the supplied icons, and publish a privacy policy before submission.

## First Firefox AMO listing

1. Register through [Firefox Add-ons](https://addons.mozilla.org/developers/).
2. Create an extension listing and upload both the Firefox installation archive and the source archive for review.
3. Ensure the source archive can be rebuilt independently with `npm install` followed by `npm run build:ext:firefox`. Document these commands in the README or `SOURCE_CODE_REVIEW.md` included with the source.
4. Complete the name, description, icons, screenshots, and privacy policy.
5. AMO signs approved packages for distribution. Local development builds are unsigned.

WXT handles the Firefox event-page build. The Gecko extension ID is configured in `wxt.config.ts`.

## Before publishing

- [ ] Extension type checks and Chrome/Firefox builds pass.
- [ ] Manifest permissions match the privacy declaration.
- [ ] Icons are present in `src/extension/public/`.
- [ ] Screenshots and listing descriptions are ready.
- [ ] The privacy policy accurately describes server and optional AI data flows.
- [ ] The Firefox source archive can be rebuilt independently, with build instructions included.
- [ ] `package.json` has an incremented version for the new submission.

## CI/CD builds

Two GitHub Actions workflows in `.github/workflows/` validate changes and package releases:

| Workflow | Trigger | Behavior |
| --- | --- | --- |
| `ci.yml` | Push or pull request | Extension type checks, Chrome/Firefox builds, and lint |
| `release.yml` | A `v*` tag or manual run | Validate tag/version agreement, build archives, check the source archive for secrets, and publish tagged builds to GitHub Releases. Manual runs upload downloadable artifacts retained for seven days. |

Release procedure, matching the workflow's version validation:

```bash
# Increment the version, or edit package.json manually
npm version patch --no-git-tag-version
# Commit and tag the matching version
git add package.json package-lock.json
git commit -m "chore: bump version"
git tag v$(node -p "require('./package.json').version")
# Push to trigger the release workflow
git push origin main --tags
```

Tagged releases attach the Chrome, Firefox, and source ZIP files to GitHub Releases so users can download them without cloning and building the repository. This provides a distribution channel alongside store publishing.

## Safari

Automated Safari publishing is not configured. Packaging would require Xcode and `safari-web-extension-packager`; Safari is not a current project target.
