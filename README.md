# BeautifyAds

A Chrome extension that cleans up the Google Ads interface. Built by a PPC manager for PPC managers.

![BeautifyAds in action](https://potoklab.com/wp-content/uploads/2026/05/beautifyads-leftmenu.png)

## What it does

BeautifyAds is a layout layer that runs in your browser and changes how Google Ads looks on your screen. It doesn't touch your campaigns, your data, or anything on Google's servers – only the visual presentation in your own tab.

- **Reorganized left menu** – Keywords, Search terms, Assets, and Videos are grouped under Campaigns where they belong, instead of buried in Audiences and Insights
- **Reorganized flyout menu** – the same structure applies when you hover the Campaigns icon with the menu collapsed
- **Hide menu clutter** – toggle off menu items you never use, from the extension popup
- **Hide AI Max promo** – removes the promo block in search campaign settings
- **Hide Recommendations notifications** – dismisses recommendation chrome you don't want to see
- **`G` then `L` hotkey** – jumps to Search terms from anywhere
- **One-click Active toggle** – pause all customizations in one click to see the original Google Ads layout, without uninstalling

## What it does NOT do

- Does not read, collect, or transmit any data – not campaign data, not account info, not analytics, not telemetry
- Does not modify campaigns, ads, or any account settings
- Does not make any network requests of its own – the only traffic on the page is what Google Ads itself sends
- Does not work on any site other than `ads.google.com` (see `manifest.json` – `host_permissions` is restricted to that single domain)
- Does not load remote code – what you install is exactly what runs
- Does not require an account, sign-in, or payment

## Install

### From the Chrome Web Store

*Coming soon* – will be linked here once approved.

### Manual install (developer mode)

1. Download the latest `.zip` from [Releases](https://github.com/potoklab/beautifyads/releases/latest)
2. Unzip it somewhere permanent (not in your Downloads folder – Chrome reads from this location)
3. Open Chrome → `chrome://extensions/`
4. Enable **Developer mode** (top right)
5. Click **Load unpacked** and select the unzipped folder
6. Open [ads.google.com](https://ads.google.com) and you should see a small "BeautifyAds" badge at the top-left of the page

To update later, download the new zip, replace the folder contents, and click the refresh icon on the extension card in `chrome://extensions/`.

### Build from source

This extension has no build step. The files in this repo *are* the extension – just zip them or load them unpacked directly.

```bash
git clone https://github.com/potoklab/beautifyads.git
cd beautifyads
# Load this folder as an unpacked extension in Chrome, or:
zip -r beautifyads.zip . -x ".git/*" "*.DS_Store" "CHANGELOG.md" "README.md" "LICENSE" ".gitignore"
```

## How it works (for the curious)

`content-script.js` runs at `document_idle` on `ads.google.com` and performs DOM manipulation only:

- **Menu reorganization** uses Angular-aware cloning – we clone target panels from Google's own DOM into a wrapper container, hide the originals via CSS, and let Angular's event handlers continue to work on our clones
- **Flyout menu** is rebuilt on every hover via a `MutationObserver` watching `document.body`, with a fallback poll while the flyout is open
- **Hiding** is done with `display: none` via CSS rules gated on `[data-ba-active="1"]` on the `<html>` element, so toggling Active off instantly reverts the page
- **Settings** are stored in `chrome.storage.local` and synced between the popup and the page via `chrome.runtime` messages

There's no service worker, no background script, no `webRequest` interception. The entire extension is a content script and a popup.

## Permissions explained

The extension requests two permissions:

- `storage` – to persist your toggle preferences (which menu items to hide, etc.) in `chrome.storage.local`, which is sandboxed to this extension and never leaves your device
- `activeTab` – to apply changes to the currently active Google Ads tab

And one host permission:

- `https://ads.google.com/*` – the only domain the content script is allowed to run on

When Chrome shows you the install prompt, it will say *"Read and change your data on ads.google.com"*. That's it.

## Privacy

BeautifyAds collects nothing. There is no analytics SDK, no error reporting service, no remote logging. All operations happen locally in your browser. Your settings live in `chrome.storage.local` and stay there until you uninstall the extension.

Full privacy policy: [potoklab.com/privacy-policy](https://potoklab.com/privacy-policy)

## Reporting bugs

Open an [issue](https://github.com/potoklab/beautifyads/issues) or email [ilya@potoklab.com](mailto:ilya@potoklab.com). I respond personally.

Helpful info to include:
- Extension version (see the popup footer or `manifest.json`)
- Chrome version (`chrome://version`)
- Which Google Ads page you were on
- A screenshot if the bug is visual
- Steps to reproduce

## Trademarks

BeautifyAds is not affiliated with, endorsed by, or sponsored by Google LLC. "Google Ads" is a trademark of Google LLC.

## License

[MIT](LICENSE) – do what you want, attribution appreciated, no warranty.

## About

Built and maintained by [Ilya at PotokLab](https://potoklab.com). PotokLab is a paid-acquisition digital agency based in Sweden.

Website: [potoklab.com/beautifyads-extension](https://potoklab.com/beautifyads-extension/)
