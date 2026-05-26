import { getClient } from 'azure-devops-extension-api';
import type { WorkItemTrackingRestClient } from 'azure-devops-extension-api/WorkItemTracking';
import type { AdoWorkItemType, AdoFieldDefinition, AdoFieldType } from '../models/ado-metadata';

// ---------------------------------------------------------------------------
// Session-scoped cache — keyed by project name
// ---------------------------------------------------------------------------

let cache: Map<string, AdoWorkItemType[]> | null = null;

/** Clear the in-memory cache (used in tests and on project change). */
export function clearCache(): void {
  cache = null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function toAdoFieldType(raw: string): AdoFieldType {
  const known = new Set<AdoFieldType>([
    'string', 'integer', 'double', 'dateTime', 'boolean', 'html',
    'plainText', 'picklistString', 'picklistInteger', 'picklistDouble',
  ]);
  return known.has(raw as AdoFieldType) ? (raw as AdoFieldType) : 'other';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch all Work Item types for the given project, with their fields.
 * Results are cached for the lifetime of the browser session.
 */
export async function getAdoWorkItemTypes(project: string): Promise<AdoWorkItemType[]> {
  if (cache?.has(project)) {
    return cache.get(project)!;
  }

  const client = getClient<WorkItemTrackingRestClient>(
    // getClient accepts the class constructor; using the string key pattern
    // from the extension-api docs for lazy import
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('azure-devops-extension-api/WorkItemTracking').WorkItemTrackingRestClient
  );

  const witTypes = await client.getWorkItemTypes(project);

  const adoTypes: AdoWorkItemType[] = await Promise.all(
    witTypes.map(async (wit: { name: string; referenceName: string }) => {
      const rawFields = await client.getWorkItemTypeFieldsWithReferences(
        project,
        wit.referenceName
      );

      const fields: AdoFieldDefinition[] = (rawFields ?? []).map(
        (f: { name?: string; referenceName?: string; type?: string; alwaysRequired?: boolean }) => ({
          name: f.name ?? '',
          referenceName: f.referenceName ?? '',
          type: toAdoFieldType(f.type ?? ''),
          isRequired: Boolean(f.alwaysRequired),
        })
      );

      return { name: wit.name, referenceName: wit.referenceName, fields };
    })
  );

  if (!cache) cache = new Map();
  cache.set(project, adoTypes);
  return adoTypes;
}
