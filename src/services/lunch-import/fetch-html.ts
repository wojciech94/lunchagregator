import { resolve4 } from 'node:dns/promises';
import { request } from 'node:https';
import { BlockList, isIP } from 'node:net';
import { IMPORT_SOURCES, type SourceId } from '@/lib/lunch-import/sources';

const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 10_000;
const blocked = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24],
  ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) blocked.addSubnet(network, prefix);

export function isPublicIPv4(address: string) {
  return isIP(address) === 4 && !blocked.check(address);
}

export function validateSourceUrl(raw: string, sourceId: SourceId = 'sofa') {
  const url = new URL(raw);
  const configured = new URL(IMPORT_SOURCES[sourceId].url);
  if (url.origin !== configured.origin || url.pathname !== configured.pathname ||
      url.search || url.hash || url.username || url.password) {
    throw new Error('Przekierowanie poza skonfigurowane źródło menu.');
  }
  return url;
}

/** Pin a validated IPv4 to the TLS request, so a second DNS lookup cannot rebind it. */
export async function fetchMenuHtml(sourceId: SourceId = 'sofa') {
  const sourceUrl = IMPORT_SOURCES[sourceId].url;
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  try {
    const addresses = await Promise.race([
      resolve4(new URL(sourceUrl).hostname),
      new Promise<never>((_, reject) => {
        signal.addEventListener('abort', () => reject(new Error('Przekroczono czas pobierania menu.')), { once: true });
      }),
    ]);
    if (!addresses.length || addresses.some(address => !isPublicIPv4(address))) {
      throw new Error('Źródło menu wskazuje niedozwolony adres sieciowy.');
    }

    async function read(url: URL, redirects: number): Promise<string> {
      validateSourceUrl(url.href, sourceId);
      return new Promise((resolve, reject) => {
        const req = request(url, {
          signal,
          agent: false,
          family: 4,
          lookup: (_hostname, _options, callback) => callback(null, addresses[0], 4),
          headers: { Accept: 'text/html', 'Accept-Encoding': 'identity', 'User-Agent': 'LunchAggregator-Pilot/1.0' },
        }, res => {
          const status = res.statusCode ?? 0;
          if ([301, 302, 303, 307, 308].includes(status)) {
            res.destroy();
            try {
              if (!res.headers.location || redirects >= 2) throw new Error('Nieprawidłowe przekierowanie źródła menu.');
              const next = validateSourceUrl(new URL(res.headers.location, url).href, sourceId);
              resolve(read(next, redirects + 1));
            } catch (error) { reject(error); }
            return;
          }
          if (status !== 200) {
            res.destroy();
            reject(new Error(`Strona menu zwróciła błąd HTTP ${status}.`));
            return;
          }
          if (!/^text\/html(?:;|$)/i.test(res.headers['content-type'] ?? '') ||
              (res.headers['content-encoding'] && res.headers['content-encoding'] !== 'identity')) {
            res.destroy();
            reject(new Error('Źródło nie zwróciło obsługiwanego dokumentu HTML.'));
            return;
          }
          const chunks: Buffer[] = [];
          let bytes = 0;
          res.on('data', (chunk: Buffer) => {
            bytes += chunk.length;
            if (bytes > MAX_BYTES) {
              reject(new Error('Strona menu przekracza limit 2 MB.'));
              res.destroy();
              req.destroy();
            } else chunks.push(chunk);
          });
          res.on('error', reject);
          res.on('aborted', () => reject(new Error('Pobieranie menu zostało przerwane.')));
          res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        });
        req.on('error', reject);
        req.end();
      });
    }
    return await read(validateSourceUrl(sourceUrl, sourceId), 0);
  } catch (error) {
    if (signal.aborted) throw new Error('Przekroczono czas pobierania menu.');
    throw error;
  }
}
