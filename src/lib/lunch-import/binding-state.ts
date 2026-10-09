import { fixedSource, type AnySourceId } from './sources';
import { sameImportIdentity } from './identity';

export interface ImportBinding {
  source_id: AnySourceId;
  restaurant_id: string;
  enabled: boolean;
  revision: string;
  verified_name: string;
  verified_address: string;
  source_url: string;
  source_name: string;
  source_address: string;
  verification_note: string;
  verified_at: string | null;
  verified_by: string | null;
  trial?: { fetchedAt: string; supported: boolean; excerpt: string; identityEvidence: string; limitations: string[]; finalUrl: string; dishes: import("./types").LunchImportPreview["dishes"] } | null;
}

export function bindingIsActive(binding: ImportBinding, restaurant: { name: string; address: string }) {
  if (binding.source_id.startsWith('html-') && (!binding.trial?.supported
    || binding.trial.limitations.length || !binding.trial.dishes.length || binding.trial.dishes.length > 50)) return false;
  const definition = fixedSource(binding.source_id) ?? (binding.source_id.startsWith("html-") ? { url: binding.source_url, restaurantName: binding.source_name, branchAddress: binding.source_address } : null);
  return !!definition && binding.enabled && !!binding.verified_at && !!binding.verified_by
    && sameImportIdentity(restaurant, { name: binding.verified_name, address: binding.verified_address })
    && binding.source_url === definition.url && binding.source_name === definition.restaurantName
    && binding.source_address === definition.branchAddress;
}

