import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SOFA_URL, SUSHI_URL } from '@/lib/lunch-import/sources';

const mocks = vi.hoisted(() => ({
  resolve4: vi.fn(),
  request: vi.fn(),
  response: { status: 200, type: 'text/html; charset=utf-8', body: '<html>menu</html>', location: undefined as string | undefined },
}));
vi.mock('node:dns/promises', () => ({ resolve4: mocks.resolve4 }));
vi.mock('node:https', () => ({ request: mocks.request }));
import { fetchMenuHtml, isPublicIPv4, validateSourceUrl } from './fetch-html';

beforeEach(() => {
  mocks.resolve4.mockResolvedValue(['93.184.216.34']);
  mocks.response = { status: 200, type: 'text/html; charset=utf-8', body: '<html>menu</html>', location: undefined };
  mocks.request.mockImplementation((_url, _options, onResponse) => {
    const response = Object.assign(new EventEmitter(), {
      statusCode: mocks.response.status,
      headers: { 'content-type': mocks.response.type, location: mocks.response.location },
      destroy: vi.fn(),
    });
    return Object.assign(new EventEmitter(), {
      destroy: vi.fn(),
      end: () => queueMicrotask(() => {
        onResponse(response);
        response.emit('data', Buffer.from(mocks.response.body));
        response.emit('end');
      }),
    });
  });
});

describe('configured HTML fetching', () => {
  it('fetches the selected Sushi host without allowing cross-source redirects', async () => {
    expect(await fetchMenuHtml('sushi')).toBe('<html>menu</html>');
    expect(mocks.resolve4).toHaveBeenCalledWith('sushifriendswroclaw.pl');
    expect(mocks.request.mock.calls[0][0].href).toBe(SUSHI_URL);
    mocks.response.status = 302;
    mocks.response.location = SOFA_URL;
    await expect(fetchMenuHtml('sushi')).rejects.toThrow('Przekierowanie');
  });
  it('pins public DNS resolution to the TLS request and returns HTML', async () => {
    expect(await fetchMenuHtml()).toBe('<html>menu</html>');
    const options = mocks.request.mock.calls[0][1];
    const callback = vi.fn();
    options.lookup('ignored-host', {}, callback);
    expect(callback).toHaveBeenCalledWith(null, '93.184.216.34', 4);
    expect(options).toMatchObject({ agent: false, family: 4 });
  });

  it.each(['127.0.0.1', '10.0.0.1', '169.254.169.254', '172.16.0.1', '192.168.1.1', '100.64.0.1', '::1', '::ffff:127.0.0.1', '224.0.0.1'])('rejects private/reserved DNS address %s before any HTTP request', async address => {
    mocks.resolve4.mockResolvedValue(['93.184.216.34', address]);
    expect(isPublicIPv4(address)).toBe(false);
    await expect(fetchMenuHtml()).rejects.toThrow('niedozwolony adres');
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it.each(['http://127.0.0.1/', 'https://evil.test/', SOFA_URL + '?url=http://localhost', 'https://user:pass@www.sofa.wroclaw.pl/restauracja/sofa-lounge-restaurant'])('rejects unconfigured URL %s', url => {
    expect(() => validateSourceUrl(url)).toThrow();
  });

  it('rejects unsafe redirects without following them', async () => {
    mocks.response.status = 302;
    mocks.response.location = 'http://169.254.169.254/latest/meta-data';
    await expect(fetchMenuHtml()).rejects.toThrow('Przekierowanie');
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });

  it('bounds repeated redirects to the configured URL', async () => {
    mocks.response.status = 302;
    mocks.response.location = SOFA_URL;
    await expect(fetchMenuHtml()).rejects.toThrow('przekierowanie');
    expect(mocks.request).toHaveBeenCalledTimes(3);
  });

  it('reports HTTP, non-HTML and oversized responses as failures', async () => {
    mocks.response.status = 503;
    await expect(fetchMenuHtml()).rejects.toThrow('HTTP 503');
    mocks.response.status = 200;
    mocks.response.type = 'application/json';
    await expect(fetchMenuHtml()).rejects.toThrow('HTML');
    mocks.response.type = 'text/html';
    mocks.response.body = 'x'.repeat(2 * 1024 * 1024 + 1);
    await expect(fetchMenuHtml()).rejects.toThrow('limit 2 MB');
  });

  it('stops when DNS exceeds the shared fetching deadline', async () => {
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    mocks.resolve4.mockReturnValue(new Promise(() => {}));
    const pending = fetchMenuHtml();
    controller.abort();
    await expect(pending).rejects.toThrow('czas pobierania');
    expect(mocks.request).not.toHaveBeenCalled();
    timeout.mockRestore();
  });
});
