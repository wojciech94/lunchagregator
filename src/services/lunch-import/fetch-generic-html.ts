import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { BlockList, isIP } from 'node:net';
import { isPublicIPv4 } from './fetch-html';

const ipv6 = new BlockList();
// Allow global unicast only, excluding special-purpose ranges inside it.
for (const [address, prefix] of [['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20]] as const) ipv6.addSubnet(address, prefix, 'ipv6');
const global = new BlockList(); global.addSubnet('2000::', 3, 'ipv6');
export function isPublicAddress(address: string) {
  if (isIP(address) === 4) return isPublicIPv4(address) && !address.startsWith('192.88.99.');
  return isIP(address) === 6 && global.check(address, 'ipv6') && !ipv6.check(address, 'ipv6');
}
export function validateGenericUrl(raw: string): URL {
  const url = new URL(raw);
  if (raw.length > 2000 || url.protocol !== 'https:' || url.port || url.username || url.password || url.hash
    || isIP(url.hostname.replace(/^\[|\]$/g, '')) || !url.hostname.includes('.') || /\.(localhost|local|internal|test|invalid)$/i.test(url.hostname)) {
    throw new Error('Podaj publiczny adres HTTPS bez danych logowania, fragmentu i niestandardowego portu.');
  }
  return url;
}

/** No shared agents/proxy, all DNS results checked, pinned lookup, peer checked before reading. */
export async function fetchGenericHtml(raw: string): Promise<{ html: string; finalUrl: string }> {
  const signal = AbortSignal.timeout(10_000);
  async function read(url: URL, redirects: number): Promise<{ html: string; finalUrl: string }> {
    validateGenericUrl(url.href);
    const addresses = await Promise.race([lookup(url.hostname, { all: true, verbatim: true }),
      new Promise<never>((_, reject) => {
        if (signal.aborted) reject(new Error('Przekroczono czas pobierania.'));
        else signal.addEventListener('abort', () => reject(new Error('Przekroczono czas pobierania.')), { once: true });
      })]);
    if (!addresses.length || addresses.some(a => !isPublicAddress(a.address))) throw new Error('Źródło wskazuje prywatny lub zastrzeżony adres sieciowy.');
    const pinned = addresses[0];
    return new Promise((resolve, reject) => {
      const req = request(url, { signal, agent: false, family: pinned.family,
        lookup: (_host, _options, callback) => callback(null, pinned.address, pinned.family),
        headers: { Accept: 'text/html', 'Accept-Encoding': 'identity', 'User-Agent': 'LunchAggregator-Pilot/1.0' } }, res => {
        if (!res.socket.remoteAddress || !isPublicAddress(res.socket.remoteAddress) || res.socket.remoteAddress !== pinned.address) {
          res.destroy(); reject(new Error('Połączony adres nie odpowiada zweryfikowanemu DNS.')); return;
        }
        if ([301,302,303,307,308].includes(res.statusCode ?? 0)) {
          res.destroy();
          try {
            if (!res.headers.location || redirects >= 2) throw new Error('Przekroczono limit przekierowań.');
            resolve(read(validateGenericUrl(new URL(res.headers.location, url).href), redirects + 1));
          } catch (error) { reject(error); } return;
        }
        if (res.statusCode !== 200 || !/^text\/html(?:;|$)/i.test(res.headers['content-type'] ?? '')
          || (res.headers['content-encoding'] && res.headers['content-encoding'] !== 'identity')) {
          res.destroy(); reject(new Error('Wymagany dostępny dokument HTML (HTTP 200). PDF i skompresowane odpowiedzi nie są obsługiwane.')); return;
        }
        const chunks: Buffer[] = []; let bytes = 0;
        res.on('data', (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > 2 * 1024 * 1024) { reject(new Error('Strona przekracza limit 2 MB.')); res.destroy(); req.destroy(); }
          else chunks.push(chunk);
        });
        res.on('error', reject); res.on('aborted', () => reject(new Error('Pobieranie przerwane.')));
        res.on('end', () => resolve({ html: Buffer.concat(chunks).toString('utf8'), finalUrl: url.href }));
      });
      req.on('error', reject); req.end();
    });
  }
  try { return await read(validateGenericUrl(raw), 0); }
  catch (error) { if (signal.aborted) throw new Error('Przekroczono czas pobierania menu.'); throw error; }
}
