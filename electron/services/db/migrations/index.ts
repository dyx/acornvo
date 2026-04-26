/**
 * Returns the absolute path of the `migrations/` directory.
 *
 * In dev (electron-vite): __dirname resolves to `electron/services/db/migrations/`
 * which is exactly where the .sql files live.
 *
 * In prod (after electron-vite build): the bundled `main.js` lives in `out/main/`.
 * The .sql files must be copied to `out/main/migrations/` by the build step
 * (electron-builder `files` config — see Plan 5 packaging notes for the
 * deferred copy step). For phase 3, dev workflow only is required.
 */
export function migrationsDir(): string {
  return __dirname
}
