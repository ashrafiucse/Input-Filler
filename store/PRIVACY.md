# Input Filler — Privacy Policy

_Last updated: 2026-08-08_

**Input Filler** ("the extension") is a form-filling and testing tool that inserts
realistic, **synthetic** sample data into form fields on web pages so developers,
testers, and QA engineers can exercise forms quickly. This policy explains what the
extension does with data.

## The short version

- **We do not collect, sell, share, or transmit your personal data.**
- All values the extension writes are **fake** — generated locally in your browser.
- The extension has **no network permission** and makes **no network requests**. It
  cannot send data anywhere.
- The only thing it stores is your own settings and custom rules, saved in your
  browser's local/sync storage under your control.

## What data the extension processes

To fill forms, the extension reads, **in memory and only on your device**, the
structure of the page you are viewing:

- The HTML of form controls (their tag, `name`, `id`, `type`, `label`,
  `placeholder`, `aria-*` attributes, and CSS class) so it can detect each field's
  type (e.g. email, name, phone, dropdown).
- Whether a field already contains a value (a true/false check only), so the optional
  "skip fields that already have content" and "skip dropdowns that already have a
  selection" features can respect your existing entries.

This page structure is read **only to decide what to fill**. It is **never saved,
logged, or transmitted**, and is discarded the moment the fill pass completes.

## What the extension writes

The extension writes **only generated sample values** into form fields:

- Realistic but fake names, emails, addresses, phone numbers, sentences, etc.,
  produced by generators running locally in your browser.
- Optional payment-card fields receive a **well-known test card number** (e.g.
  Stripe-style test cards) that is not a real card and cannot be used for payment.
- You may also configure your own fixed values and rules, which are used instead.

The extension **never reads, copies, or exfiltrates data you have already typed** into
a form. It only fills empty fields (unless you explicitly turn off the "skip fields
that already have content" option, in which case it overwrites with new sample data).

## Data storage

The extension stores your configuration in the browser's own extension storage
(`chrome.storage` / `browser.storage`), which may optionally sync across your devices
through your browser account's sync feature:

- Your settings (fill strategy, theme, toggles).
- Your Custom Field Rules.

This is **your data, under your account**, controlled by your browser. It is not sent
to the extension developer or any third party. You can clear it at any time by removing
the extension or via the extension's options page.

## Permissions and why each is required

| Permission | Why it is required |
| --- | --- |
| `host_permissions: <all_urls>` and content-script injection on all sites | Form fields exist on every website. To fill them on whichever page you are testing, the extension must run on the page you invoke it on. |
| `storage` | To remember your settings and Custom Field Rules. |
| `contextMenus` | To add the right-click "Fill all forms" / "Fill this form" menu items. |
| `commands` (keyboard shortcuts) | Optional keyboard shortcuts to trigger a fill. |

## On-device AI feature (optional, off by default)

An optional "Use on-device AI for text fields" setting uses your browser's built-in
**Prompt API** (Chrome's local language model) to generate free-text. This runs
**entirely on your device**. It does **not** send page content or any data to any
server, and the extension still has no network permission.

## Children's privacy

The extension is a developer/QA tool and is not directed at children under 13 (or the
applicable age in your jurisdiction). We do not knowingly collect any data from
anyone.

## Third-party services and advertising

The extension uses **no** third-party analytics, telemetry, advertising, or tracking
SDKs, and does not monetize data.

## Changes to this policy

Material changes will be reflected by updating the "Last updated" date above and in
the release notes. Continued use after a change constitutes acceptance.

## Contact

For privacy questions, open an issue at the project's repository or contact the
developer at the address listed on the Chrome Web Store listing.
