import { getClient } from 'azure-devops-extension-api';
import type { WorkItemTrackingRestClient } from 'azure-devops-extension-api/WorkItemTracking';

// Minimal JsonPatchOperation shape — avoids direct reference to WebApi/WebApi
// which may not resolve under the 'bundler' moduleResolution strategy.
interface JsonPatchOperation {
  op: string;
  path: string;
  value?: unknown;
  from?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 100;

// HTTP status codes that warrant a retry
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkItemResult {
  id: number;
  url: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function isRetryable(err: unknown): boolean {
  if (typeof err === 'object' && err !== null && 'status' in err) {
    return RETRYABLE_STATUSES.has((err as { status: number }).status);
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a single ADO Work Item with exponential backoff retry on transient errors.
 *
 * @param project  ADO project name
 * @param witType  Work Item type name (e.g. "Requirement")
 * @param fields   Map of field reference name → string value
 */
export async function createWorkItem(
  project: string,
  witType: string,
  fields: Record<string, string>
): Promise<WorkItemResult> {
  const client = getClient<WorkItemTrackingRestClient>(
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('azure-devops-extension-api/WorkItemTracking').WorkItemTrackingRestClient
  );

  const patch = Object.entries(fields).map(([refName, value]) => ({
    op: 'add' as const,
    path: `/fields/${refName}`,
    from: null as unknown as string,
    value,
  })) as unknown as JsonPatchOperation[];

  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const workItem = await client.createWorkItem(patch, project, witType);
      return { id: workItem.id ?? 0, url: workItem.url ?? '' };
    } catch (err) {
      lastError = err;
      if (!isRetryable(err)) throw err;
      if (attempt < MAX_RETRIES - 1) {
        await sleep(BASE_BACKOFF_MS * Math.pow(2, attempt));
      }
    }
  }

  throw lastError;
}

/**
 * Update an existing ADO Work Item's fields.
 */
export async function updateWorkItem(
  project: string,
  workItemId: number,
  fields: Record<string, string>
): Promise<WorkItemResult> {
  const client = getClient<WorkItemTrackingRestClient>(
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('azure-devops-extension-api/WorkItemTracking').WorkItemTrackingRestClient
  );

  const patch = Object.entries(fields).map(([refName, value]) => ({
    op: 'add' as const,
    path: `/fields/${refName}`,
    from: null as unknown as string,
    value,
  })) as unknown as JsonPatchOperation[];

  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const workItem = await client.updateWorkItem(patch, workItemId, project);
      return { id: workItem.id ?? 0, url: workItem.url ?? '' };
    } catch (err) {
      lastError = err;
      if (!isRetryable(err)) throw err;
      if (attempt < MAX_RETRIES - 1) {
        await sleep(BASE_BACKOFF_MS * Math.pow(2, attempt));
      }
    }
  }

  throw lastError;
}

/**
 * Query ADO for all work items in the project that already have the given
 * identifier field set.  Returns a Map of identifier value → work item ID so
 * the import can detect duplicates and update them instead of re-creating.
 *
 * Returns an empty Map if the field does not exist or the query fails for
 * any reason (graceful degradation — the import still runs but will create
 * duplicates rather than aborting).
 */
export async function queryExistingIdentifiers(
  project: string,
  identifierFieldRefName: string
): Promise<Map<string, number>> {
  try {
    const client = getClient<WorkItemTrackingRestClient>(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('azure-devops-extension-api/WorkItemTracking').WorkItemTrackingRestClient
    );

    const wiqlResult = await client.queryByWiql(
      {
        query: `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project AND [${identifierFieldRefName}] <> ''`,
      },
      project
    );

    const refs = (wiqlResult.workItems ?? []) as { id?: number }[];
    if (refs.length === 0) return new Map();

    const ids = refs.map((wi) => wi.id).filter((id): id is number => typeof id === 'number');
    const result = new Map<string, number>();

    // Fetch actual field values in batches of 200 (ADO REST limit)
    for (let i = 0; i < ids.length; i += 200) {
      const batch = ids.slice(i, i + 200);
      const items = await client.getWorkItems(batch, project, [identifierFieldRefName]);
      for (const item of items ?? []) {
        const val = (item.fields as Record<string, unknown>)?.[identifierFieldRefName];
        if (val != null && val !== '' && item.id != null) {
          result.set(String(val), item.id);
        }
      }
    }

    return result;
  } catch {
    // Field may not exist yet or project has no items — safe to continue
    return new Map<string, number>();
  }
}
