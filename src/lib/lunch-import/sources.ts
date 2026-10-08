import { z } from 'zod';

export const SOFA_URL = 'https://www.sofa.wroclaw.pl/restauracja/sofa-lounge-restaurant';
export const SUSHI_URL = 'https://sushifriendswroclaw.pl/';

export const IMPORT_SOURCES = {
  sofa: { id: 'sofa', label: 'Sofa', restaurantName: 'Sofa Lounge & Restaurant',
    branchAddress: 'al. Paderewskiego 35, Wrocław', url: SOFA_URL, envKey: 'SOFA_IMPORT_RESTAURANT_ID' },
  sushi: { id: 'sushi', label: 'Sushi Friends', restaurantName: 'Sushi Friends Bar & Resto',
    branchAddress: 'ul. Marco Polo 9e, Wrocław', url: SUSHI_URL, envKey: 'SUSHI_IMPORT_RESTAURANT_ID' },
} as const;
export type SourceId = keyof typeof IMPORT_SOURCES;

/** Source URLs and branch identity belong to server configuration, never AI output. */
export function getImportSource(sourceId: SourceId) {
  const definition = IMPORT_SOURCES[sourceId];
  const id = z.string().uuid().safeParse(process.env[definition.envKey]);
  if (!id.success) return null;
  const reviewedAddress = z.string().min(5).max(500).safeParse(
    process.env[definition.envKey.replace('RESTAURANT_ID', 'BRANCH_ADDRESS')] ?? definition.branchAddress);
  if (!reviewedAddress.success) return null;
  return { ...definition, restaurantId: id.data, branchAddress: reviewedAddress.data };
}

export function getSofaSource() { return getImportSource('sofa'); }
export type ImportSource = NonNullable<ReturnType<typeof getImportSource>>;
