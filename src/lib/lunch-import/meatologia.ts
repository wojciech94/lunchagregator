export const MEATOLOGIA_URL = 'https://meatologia.pl/pages/nasze-lokale';
export const MEATOLOGIA_ADDRESS = 'ul. Pawła Włodkowica 27, 50-072 Wrocław';
export function isMeatologiaUrl(raw: string) {
  try { const url = new URL(raw); return url.origin + url.pathname.replace(/\/$/, '') === MEATOLOGIA_URL && !url.search && !url.hash; }
  catch { return false; }
}
