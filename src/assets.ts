/**
 * Resolve a file that lives in `public/` relative to wherever this build is
 * hosted — the vite dev root, a preview port, or a GitHub Pages project
 * subpath such as `https://user.github.io/MobileLegends/`.
 *
 * Absolute paths (`/heroes/x.jpg`) work at the domain root but 404 under a
 * subpath, so every public asset goes through here.
 */
export function asset(p: string): string {
  const base = (import.meta as { env?: Record<string, string> }).env?.BASE_URL || '/';
  return `${base}${p.replace(/^\/+/, '')}`;
}

export default asset;
