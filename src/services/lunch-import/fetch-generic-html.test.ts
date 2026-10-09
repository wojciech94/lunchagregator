import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn(), responses: [] as Record<string, unknown>[] }));
vi.mock('node:dns/promises', () => ({ lookup: mocks.lookup, resolve4: vi.fn() }));
vi.mock('node:https', () => ({ request: mocks.request }));
import { fetchGenericHtml, isPublicAddress, validateGenericUrl } from './fetch-generic-html';
beforeEach(() => {
  mocks.lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
  mocks.responses = [{}];
  mocks.request.mockImplementation((_url, _options, callback) => {
    const fixture = mocks.responses.shift() ?? {};
    const response = Object.assign(new EventEmitter(), { statusCode: 200,
      socket: { remoteAddress: fixture.peer ?? '93.184.216.34' },
      headers: { 'content-type': 'text/html', ...fixture.headers as object },
      destroy: vi.fn(), ...fixture });
    return Object.assign(new EventEmitter(), { destroy: vi.fn(), end: () => queueMicrotask(() => {
      callback(response); response.emit('data', Buffer.from(fixture.body as string ?? '<html>menu</html>')); response.emit('end');
    }) });
  });
});
describe('arbitrary HTTPS fetch protection', () => {
  it.each(['127.0.0.1','10.0.0.1','169.254.169.254','100.64.0.1','192.168.0.1','192.0.2.1','192.88.99.1','224.0.0.1','::1','::ffff:93.184.216.34','fc00::1','fe80::1','2001:db8::1','2002:c000:201::1','3fff::1'])('rejects reserved address %s including mixed DNS results', async address => {
    expect(isPublicAddress(address)).toBe(false);
    mocks.lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }, { address, family: address.includes(':') ? 6 : 4 }]);
    await expect(fetchGenericHtml('https://example.org/menu')).rejects.toThrow('zastrzeżony');
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it.each(['http://example.org','https://127.1','https://[::1]/','https://user:pass@example.org','https://example.org:8443','https://example.org/#x','https://host.local/','file:///x'])('rejects unsafe URL %s', raw => {
    expect(() => validateGenericUrl(raw)).toThrow();
  });
  it('pins DNS and checks actual connected peer', async () => {
    expect(await fetchGenericHtml('https://example.org')).toMatchObject({ html: '<html>menu</html>' });
    const options = mocks.request.mock.calls[0][1];
    const cb = vi.fn(); options.lookup('ignored', {}, cb);
    expect(cb).toHaveBeenCalledWith(null, '93.184.216.34', 4);
    expect(options).toMatchObject({ agent: false, family: 4 });
    mocks.responses = [{ peer: '10.0.0.1' }];
    await expect(fetchGenericHtml('https://example.org')).rejects.toThrow('Połączony adres');
  });
  it('allows public IPv6 while rejecting a changed public connected peer', async () => {
    expect(isPublicAddress('2606:4700::1111')).toBe(true);
    mocks.lookup.mockResolvedValue([{ address: '2606:4700::1111', family: 6 }]);
    mocks.responses = [{ peer: '2606:4700::1111' }];
    await expect(fetchGenericHtml('https://example.org')).resolves.toBeDefined();
    mocks.responses = [{ peer: '2606:4700::1001' }];
    await expect(fetchGenericHtml('https://example.org')).rejects.toThrow('Połączony');
  });
  it('revalidates DNS on every cross-host redirect', async () => {
    mocks.responses = [{ statusCode: 302, headers: { location: 'https://second.example.org/menu' } }];
    mocks.lookup.mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }]).mockResolvedValueOnce([{ address: '169.254.169.254', family: 4 }]);
    await expect(fetchGenericHtml('https://example.org')).rejects.toThrow('zastrzeżony');
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });
  it.each([
    { statusCode: 503 }, { headers: { 'content-type': 'application/pdf' } },
    { headers: { 'content-encoding': 'gzip' } }, { body: 'x'.repeat(2 * 1024 * 1024 + 1) },
    { statusCode: 302, headers: { location: 'http://example.org' } },
  ])('rejects unavailable, unsafe, non-HTML or oversized responses (%#)', async fixture => {
    mocks.responses = [fixture]; await expect(fetchGenericHtml('https://example.org')).rejects.toThrow();
  });
  it('bounds redirect loops', async () => {
    mocks.responses = Array.from({ length: 3 }, () => ({ statusCode: 302, headers: { location: 'https://example.org' } }));
    await expect(fetchGenericHtml('https://example.org')).rejects.toThrow('limit przekierowań');
    expect(mocks.request).toHaveBeenCalledTimes(3);
  });
  it('bounds DNS by the shared deadline', async () => {
    const controller = new AbortController(); const spy = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    mocks.lookup.mockReturnValue(new Promise(() => {})); const pending = fetchGenericHtml('https://example.org'); controller.abort();
    await expect(pending).rejects.toThrow('czas'); spy.mockRestore();
  });
});
