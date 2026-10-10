export const SUSHI_CORNER_URL = 'https://sushicorner.pl/wlodkowica/menu-en/lunch/';
export const SUSHI_CORNER_ADDRESS = 'ul. Pawła Włodkowica 12a, 50-072 Wrocław';
export function isSushiCornerUrl(raw: string) {
  try {
    const url = new URL(raw);
    return url.origin === 'https://sushicorner.pl' && url.pathname.replace(/\/$/, '') === '/wlodkowica/menu-en/lunch'
      && !url.search && !url.hash && !url.username && !url.password;
  } catch { return false; }
}
