import { IMPORT_SOURCES, type SourceId } from './sources';
import { sameImportIdentity } from './identity';

export interface ImportBinding {
  source_id: SourceId;
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
}

export function bindingIsActive(binding: ImportBinding, restaurant: { name: string; address: string }) {
  const definition = IMPORT_SOURCES[binding.source_id];
  return !!definition && binding.enabled && !!binding.verified_at && !!binding.verified_by
    && sameImportIdentity(restaurant, { name: binding.verified_name, address: binding.verified_address })
    && binding.source_url === definition.url && binding.source_name === definition.restaurantName
    && binding.source_address === definition.branchAddress;
}

