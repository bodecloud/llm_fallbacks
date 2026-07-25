---
title: murm-ui light surfaces on ResearchWizard dark shell embed
date: 2026-07-24
category: ui-bugs
module: webui
problem_type: ui_bug
component: development_workflow
symptoms:
  - "White sidebar and message input on dark gradient GitHub Pages background"
  - "Bright white glow above chat input bar"
  - "Sidebar appears as floating white box instead of integrated panel"
root_cause: config_error
resolution_type: code_fix
severity: medium
tags:
  - murm-ui
  - dark-theme
  - github-pages
  - chat-overrides
related_components:
  - docs
---

# Light chat UI on a dark shell

## Problem

After migrating to ResearchWizard shell + murm-ui embed, the live chat looked broken: white sidebar, white input, and a bright band above the message field — clashing with the purple/navy shell gradient.

## Symptoms

- `#chatMount` sidebar uses `--mur-surface: #f9fafb` (light) when OS prefers light mode
- `.mur-chat-form` background `--mur-bg: #ffffff` with `--mur-shadow-input` creating a white fade above the input
- Chat mount not filling viewport; large empty dark areas

## What Didn't Work

- Relying on `@media (prefers-color-scheme: dark)` alone — users on light OS theme still saw white UI
- Only overriding `#chatMount` background without setting murm-ui CSS variables

## Solution

1. Set `data-theme="dark"` on `#chatMount` in `webui/index.template.html` and in `main.ts` bootstrap.
2. Expand `webui/shell/chat-overrides.css` to force dark `--mur-*` tokens scoped to `#chatMount`, matching shell colors (`#12121f`, `#1a1a2e`, `#c77dff` accents).
3. Add `lf-chat-page` class on `<html>`/`<body>` for full-viewport flex layout.
4. Replace input-container gradient to use dark `--mur-bg` fade instead of white.
5. Default `mur-sidebar-closed` for slim rail on load.
6. Rebuild: `cd webui && npm run build` → updates `docs/assets/` and `docs/index.html`.

## Why This Works

murm-ui defaults to light theme on `.mur-app` unless `data-theme=dark` is set. Embedded mode still inherits light `--mur-bg` on forms; OS dark preference is not guaranteed on GitHub Pages visitors.

## Prevention

- Playwright assertion in `tests/e2e/pages-chat-live.spec.ts`: `#chatMount[data-theme=dark]` and form background not `rgb(255, 255, 255)`.
- Always ship `chat-overrides.css` after shell CSS in HTML link order.
- CI builds `webui/` on deploy (`.github/workflows/deploy-pages.yml`) so assets stay in sync.

## Related Issues

- `webui/shell/chat-overrides.css` — canonical override file (copied to `docs/assets/shell/` on build)
