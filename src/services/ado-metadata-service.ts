import { getClient } from 'azure-devops-extension-api';
import type { WorkItemTrackingRestClient } from 'azure-devops-extension-api/WorkItemTracking';
import type { AdoWorkItemType, AdoFieldDefinition, AdoFieldType } from '../models/ado-metadata';

// ---------------------------------------------------------------------------
// Session-scoped cache — keyed by project name
// ---------------------------------------------------------------------------

let cache: Map<string, AdoWorkItemType[]> | null = null;
let iterationCache: Map<string, string[]> | null = null;
let areaCache: Map<string, string[]> | null = null;

/** Clear the in-memory cache (used in tests, on project change, and after API upgrades). */
export function clearCache(): void {
  cache = null;
  iterationCache = null;
  areaCache = null;
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

/** Recursively flatten a classification node tree into full path strings. */
function flattenClassificationNodes(
  node: { name: string; children?: { name: string; children?: unknown[] }[] },
  parentPath: string
): string[] {
  const fullPath = parentPath ? `${parentPath}\\${node.name}` : node.name;
  const result: string[] = [fullPath];
  for (const child of node.children ?? []) {
    result.push(...flattenClassificationNodes(child as typeof node, fullPath));
  }
  return result;
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
      // Pass expand=1 (AllowedValues) so the API returns the allowed values list
      // for each field (e.g. state names, picklist values).
      const rawFields = await client.getWorkItemTypeFieldsWithReferences(
        project,
        wit.referenceName,
        1 // WorkItemTypeFieldsExpandLevel.AllowedValues
      );

      const fields: AdoFieldDefinition[] = (rawFields ?? []).map(
        (f: { name?: string; referenceName?: string; type?: string; alwaysRequired?: boolean; allowedValues?: string[] }) => ({
          name: f.name ?? '',
          referenceName: f.referenceName ?? '',
          type: toAdoFieldType(f.type ?? ''),
          isRequired: Boolean(f.alwaysRequired),
          allowedValues: f.allowedValues && f.allowedValues.length > 0 ? f.allowedValues : undefined,
        })
      );

      return { name: wit.name, referenceName: wit.referenceName, fields };
    })
  );

  if (!cache) cache = new Map();
  cache.set(project, adoTypes);
  return adoTypes;
}

/**
 * Fetch all iteration paths for the project as flat strings (e.g. "MyProject\Sprint 1").
 * Results are cached for the browser session.
 */
export async function getIterationPaths(project: string): Promise<string[]> {
  if (iterationCache?.has(project)) return iterationCache.get(project)!;

  const client = getClient<WorkItemTrackingRestClient>(
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('azure-devops-extension-api/WorkItemTracking').WorkItemTrackingRestClient
  );

  // TreeStructureGroup.Iterations = 1, depth 20 to get full tree
  const root = await client.getClassificationNode(project, 1, undefined, 20);
  const paths = flattenClassificationNodes(root as { name: string; children?: { name: string; children?: unknown[] }[] }, '');

  if (!iterationCache) iterationCache = new Map();
  iterationCache.set(project, paths);
  return paths;
}

/**
 * Fetch all area paths for the project as flat strings (e.g. "MyProject\Frontend").
 * Results are cached for the browser session.
 */
export async function getAreaPaths(project: string): Promise<string[]> {
  if (areaCache?.has(project)) return areaCache.get(project)!;

  const client = getClient<WorkItemTrackingRestClient>(
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('azure-devops-extension-api/WorkItemTracking').WorkItemTrackingRestClient
  );

  // TreeStructureGroup.Areas = 0, depth 20 to get full tree
  const root = await client.getClassificationNode(project, 0, undefined, 20);
  const paths = flattenClassificationNodes(root as { name: string; children?: { name: string; children?: unknown[] }[] }, '');

  if (!areaCache) areaCache = new Map();
  areaCache.set(project, paths);
  return paths;
}
