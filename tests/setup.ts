import '@testing-library/jest-dom/vitest';
import { beforeEach, vi } from 'vitest';
import '../__tests__/properties/fc-config';

type TestUser = { id: string; email: string | null } | null;
type TestCookie = { name: string; value: string; options?: Record<string, unknown> };

const mocks = vi.hoisted(() => {
  const cookies = new Map<string, TestCookie>();
  const headers = new Headers();
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  const auth = {
    getUser: vi.fn(),
    signUp: vi.fn(),
    signInWithPassword: vi.fn(),
    signOut: vi.fn(),
  };
  const client = { auth, from: vi.fn(), rpc: vi.fn() };

  return {
    auth,
    client,
    cookies,
    headers,
    query,
    currentUser: null as TestUser,
    createBrowserClient: vi.fn(),
    createServerClient: vi.fn(),
    cookiesApi: vi.fn(),
    headersApi: vi.fn(),
    redirect: vi.fn(),
    revalidatePath: vi.fn(),
    router: { back: vi.fn(), forward: vi.fn(), push: vi.fn(), refresh: vi.fn(), replace: vi.fn() },
    pathname: '/',
    searchParams: new URLSearchParams(),
  };
});

function configureDefaultQuery() {
  const query = mocks.query;
  const result = { data: null, error: null };
  for (const method of ['delete', 'eq', 'gte', 'ilike', 'in', 'insert', 'limit', 'lte', 'or', 'order', 'overlaps', 'range', 'select', 'update']) {
    query[method] = vi.fn(() => query);
  }
  query.single = vi.fn(async () => result);
  query.then = vi.fn((resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve));
}

function configureDefaults() {
  mocks.currentUser = null;
  mocks.cookies.clear();
  mocks.headers.forEach((_, name) => mocks.headers.delete(name));
  mocks.pathname = '/';
  mocks.searchParams = new URLSearchParams();
  configureDefaultQuery();
  mocks.auth.getUser.mockImplementation(async () => ({ data: { user: mocks.currentUser }, error: null }));
  mocks.auth.signUp.mockResolvedValue({ data: { user: null }, error: null });
  mocks.auth.signInWithPassword.mockResolvedValue({ data: { user: null }, error: null });
  mocks.auth.signOut.mockResolvedValue({ error: null });
  mocks.client.from.mockImplementation(() => mocks.query);
  mocks.client.rpc.mockResolvedValue({ data: null, error: null });
  mocks.createServerClient.mockImplementation(() => mocks.client);
  mocks.createBrowserClient.mockImplementation(() => mocks.client);
}

const cookieStore = {
  get: vi.fn((name: string) => mocks.cookies.get(name)),
  getAll: vi.fn((name?: string) => name ? [mocks.cookies.get(name)].filter(Boolean) : [...mocks.cookies.values()]),
  has: vi.fn((name: string) => mocks.cookies.has(name)),
  set: vi.fn((name: string | TestCookie, value?: string, options?: Record<string, unknown>) => {
    const cookie = typeof name === 'string' ? { name, value: value ?? '', options } : name;
    mocks.cookies.set(cookie.name, cookie);
  }),
  delete: vi.fn((name: string) => mocks.cookies.delete(name)),
};

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: mocks.createBrowserClient,
  createServerClient: mocks.createServerClient,
}));
vi.mock('next/headers', () => ({
  cookies: mocks.cookiesApi,
  headers: mocks.headersApi,
}));
vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
  usePathname: () => mocks.pathname,
  useRouter: () => mocks.router,
  useSearchParams: () => mocks.searchParams,
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));

export const mockSupabaseClient = mocks.client;
export const mockSupabaseAuth = mocks.auth;
export const mockCreateServerClient = mocks.createServerClient;
export const mockCreateBrowserClient = mocks.createBrowserClient;
export const mockCookies = cookieStore;
export const mockRedirect = mocks.redirect;
export const mockRevalidatePath = mocks.revalidatePath;
export const mockRouter = mocks.router;

export function setMockUser(user: TestUser) {
  mocks.currentUser = user;
}

export function setMockCookie(name: string, value: string, options?: Record<string, unknown>) {
  cookieStore.set(name, value, options);
}

export function setMockPathname(pathname: string) {
  mocks.pathname = pathname;
}

export function setMockSearchParams(params: string | URLSearchParams) {
  mocks.searchParams = new URLSearchParams(params);
}

export function resetTestEnvironment() {
  vi.clearAllMocks();
  configureDefaults();
  mocks.cookiesApi.mockResolvedValue(cookieStore);
  mocks.headersApi.mockResolvedValue(mocks.headers);
}

beforeEach(resetTestEnvironment);
