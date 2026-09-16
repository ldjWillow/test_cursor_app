# WarehouseSim

Web discrete-event warehouse logistics simulation MVP.

Stack: React, TypeScript, Vite, React Flow, Zustand, Ant Design, Vitest.

The UI never owns simulation logic. Device motion is driven by a discrete-event engine, not CSS animation or `setInterval` coordinate updates.

## Online preview

Permanent URL after GitHub Pages is enabled:

**https://ldjwillow.github.io/test_cursor_app/**

Enable it once in the repository:

1. Open [Settings → Pages](https://github.com/ldjWillow/test_cursor_app/settings/pages)
2. Source: **Deploy from a branch**
3. Branch: `main`, folder: `/docs`
4. Save

Later pushes to `main` can also publish through GitHub Actions (same URL).

A Cloud Agent tunnel such as `*.trycloudflare.com` only lasts while that agent VM is running. It cannot stay online 24/7.
