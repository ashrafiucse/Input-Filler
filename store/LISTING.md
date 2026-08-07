# Chrome Web Store — Listing & Submission Kit

Everything you need to publish **Input Filler v0.6.4** to the Chrome Web Store.
Copy/paste the fields below into the
[Developer Dashboard](https://chrome.google.com/webstore/devconsole/).

**Package to upload:** `.output/input-filler-0.6.4-chrome.zip`
(manifest.json verified at the zip root — Chrome-ready).

---

## 1. Store listing fields

### Name
`Input Filler`

### Summary (manifest `description`, ≤ 132 chars — auto-imported)
```
Fill every form field on the page with realistic, human-readable data.
```
_(70 chars. Chrome reads this from the manifest; you can edit it in the dashboard.)_

### Category
`Developer Tools`
_(Alternatives: `Productivity`. Developer/QA testers are the primary audience.)_

### Language
`English`

### Detailed description (≤ 16,000 chars)
```
Input Filler fills every form field on the current page with realistic, human-readable sample data — real names, emails, addresses, phone numbers, and coherent sentences instead of "asdf123" or lorem-ipsum. Built for developers and QA testers who need to exercise forms fast.

★ WHY USE IT
- One click (or keyboard shortcut) fills all forms on the page.
- Generates realistic data that actually passes field validation — emails look like emails, URLs like URLs, phone numbers like phone numbers.
- Works with modern frameworks (React, Vue, Angular): fires the input/change/click events their validators expect.
- Fills tricky controls that other tools miss: rich-text editors, custom ARIA combobox/dropdown components (Mantine, MUI, Chakra, Radix/shadcn Select), and selects inside iframes.
- 100% local — no network permission, no data collection, nothing leaves your browser.

★ HOW IT WORKS
Click the toolbar icon, use a keyboard shortcut, or right-click and choose "Fill all forms" / "Fill this form". The extension detects each field's type from its label, name, placeholder, and attributes, then fills a fitting value. Click again for fresh data. Use "Clear" to reset.

★ SMART FIELD DETECTION
Auto-detects field types so each gets fitting data: email, URL, phone, name, address, company, date, color, dropdown selects, checkboxes, and more — including placeholder-shape detection (an email-shaped placeholder implies an email even with no keyword).

★ CUSTOM FIELD RULES
Add rules on the options page to match fields (by name/id/label/type/CSS selector, optionally scoped to a site) and override auto-detection with a built-in generator, fixed text, a template ({firstName}.{lastName}@example.com), a list, or a regex. Rule sets import/export as JSON.

★ CONFIGURABLE
- Dropdown strategy: skip, random, first, or a specific option.
- Optionally skip dropdowns that already have a selection.
- Test card details for checkout flows (well-known test cards only — never real).
- Themed readable text (defaults to an LMS-friendly theme).
- Default email domain (defaults to example.com), password mode, and more.

★ PRIVACY
All generated data is fake and produced locally. The extension has no network permission, uses no analytics or ads, and stores only your own settings. See the privacy policy.

Ideal for developers, testers, and anyone who fills out a lot of forms.
```

### Single purpose (required field — one or two sentences)
```
Input Filler fills form fields on web pages with realistic sample data so developers and testers can quickly populate and test forms.
```

---

## 2. Privacy

### Privacy policy URL (required)
Host `store/PRIVACY.md` publicly and paste its URL. Easiest options once pushed to GitHub:
- HTML view: `https://github.com/ashrafiucse/Input-Filler/blob/main/store/PRIVACY.md`
- Raw: `https://raw.githubusercontent.com/ashrafiucse/Input-Filler/main/store/PRIVACY.md`

### Data usage declarations (answer in the dashboard)
- **Personally identifiable information** — No
- **Authentication information** — No
- **Personal communications** — No
- **Financial & payment data** — No (the card fields use well-known *test* card numbers, not real cards, and nothing is stored/transmitted)
- **Health information** — No
- **Web history** — No
- **User activity / website content** — The extension reads page form structure in-memory to detect and fill fields, but does **not** collect, store, or transmit it. (No.)
- **Sold or transferred to third parties / used for unrelated purposes / used for creditworthiness or lending** — No to all
- **Certify** compliance with the Chrome Web Store terms and the limited use requirements.

---

## 3. Permission justifications (for the review)

The reviewer will ask why each permission is needed. Use these:

| Permission | Justification |
| --- | --- |
| `host_permissions: <all_urls>` | Form fields exist on every website. The extension must run on whatever page the user invokes it on to discover and fill the form controls. It does not collect or transmit page content. |
| Content script on all sites, all frames | Required to reach forms, including forms embedded in iframes, on any page the user is testing. |
| `storage` | Persists the user's own settings and Custom Field Rules so they survive across sessions. |
| `contextMenus` | Provides the right-click "Fill all forms" / "Fill this form" menu items. |
| `commands` (keyboard shortcuts) | Lets the user trigger a fill via keyboard shortcut. |

> Tip: keep justifications specific and reference the user-facing feature each powers. Reviewers reject vague answers like "needed for core functionality."

---

## 4. Graphics assets

| Asset | Size | Status |
| --- | --- | --- |
| Store icon | 128×128 PNG | ✅ ready — `.output/chrome-mv3/icon/128.png` (upload separately on the listing) |
| Screenshot(s) | 1280×800 or 640×400 PNG (≥1, up to 5) | ⚠️ **You must capture these** — show the extension filling a real form (toolbar icon, a before/after of a populated form, the options/rules page). Cannot be auto-generated. |
| Small promo tile | 440×280 | Optional but recommended |
| Marquee promo tile | 1400×560 | Optional (only shown if featured) |

**Screenshot capture tip:** Load `.output/chrome-mv3` unpacked, open a page with a varied form, click the toolbar icon to fill, then screenshot. Good subjects: (1) a populated form, (2) the options page, (3) the Custom Rules editor, (4) a dropdown being filled.

---

## 5. Pre-upload checklist

- [x] Package built and verified: `input-filler-0.6.4-chrome.zip` (manifest at zip root)
- [x] Name ≤ 75 chars, description ≤ 132 chars
- [x] 128×128 store icon available
- [x] Privacy policy written (`store/PRIVACY.md`) — **host it and paste the URL**
- [x] Single-purpose statement drafted
- [x] Permission justifications drafted
- [x] No remote/network code; no `eval`; no minified-obfuscated code (reviewers reject these)
- [ ] **Register developer account** ($5 one-time) and create the item
- [ ] **Capture screenshots** (at least one)
- [ ] **Choose & add a LICENSE** to the repo (README currently says "TBD")
- [ ] Fill the listing, upload the zip + icon + screenshots, submit for review

---

## 6. Notes & likely review questions

- **`<all_urls>` scrutiny:** This is the highest-risk permission. The justification above (must run on arbitrary pages with forms) is legitimate and matches peer tools. Expect 1–3 days, occasionally longer.
- **All-frames content script:** Justified by iframe-embedded forms. Reviewers sometimes ask to narrow it; you can explain iframe coverage is required.
- **On-device AI feature (optional):** Uses Chrome's built-in Prompt API locally — still no network permission. Mention if asked; it's off by default.
- **Card data:** Only well-known *test* card numbers (e.g. 4242…) are used; clearly state these are not real cards in the justification if asked.
- **Versioning:** Each future upload must have a higher version than the currently published one (handled by bumping `version` in `wxt.config.ts`/`package.json` and re-running `npm run zip`).
