# Browser regression checks

Use Node.js 22 or later. From the repository root:

```sh
npm install --no-save --no-package-lock playwright@1.62.1
npx playwright install chromium
node --test tests/regression.cjs
```

Set `CHROMIUM_EXECUTABLE` to use a compatible local Chromium instead. Playwright is test-only. The suite serves files over loopback, uses fresh browser contexts, and creates synthetic workout, backup, and image inputs. It covers failed writes, malformed and legacy backups, stale tabs, independent split days, weight plan setup, image editing and persistence, and offline startup.
