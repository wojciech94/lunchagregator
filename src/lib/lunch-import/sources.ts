export const SOFA_URL = 'https://www.sofa.wroclaw.pl/restauracja/sofa-lounge-restaurant';
export const SUSHI_URL = 'https://sushifriendswroclaw.pl/';

export const IMPORT_SOURCES = {
  sofa: { id: 'sofa', label: 'Sofa', restaurantName: 'Sofa Lounge & Restaurant',
    branchAddress: 'al. Paderewskiego 35, Wrocław', url: SOFA_URL },
  sushi: { id: 'sushi', label: 'Sushi Friends', restaurantName: 'Sushi Friends Bar & Resto',
    branchAddress: 'ul. Marco Polo 9e, Wrocław', url: SUSHI_URL },
} as const;
export type SourceId = keyof typeof IMPORT_SOURCES;

export type AnySourceId = SourceId | `html-${string}`;
export type ImportSource = {
 id: AnySourceId; label: string; restaurantName: string; branchAddress: string; url: string;
 restaurantId: string; bindingRevision: string;
};
export function fixedSource(id: string) {
  if (id === 'sofa' || id === 'sushi') return IMPORT_SOURCES[id];
  return undefined;
}
