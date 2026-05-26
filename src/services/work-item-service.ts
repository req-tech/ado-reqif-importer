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
