// src/models/preview.ts
// Import preview types computed before any work items are written.

import type { PreviewWarning } from './report';

/** The full preview result computed before any writes */
export interface ImportPreview {
  /** Planned operations, in SpecObject file order */
  items: PreviewItem[];
  totalCount: number;
  /** Items shown in the preview UI (first N, configurable) */
  sampleSize: number;
  /** Validation warnings generated during preview computation */
  warnings: PreviewWarning[];
  /** Whether the Execute button should be enabled */
  canExecute: boolean;
}

/** One planned operation for a single SpecObject */
export interface PreviewItem {
  specObjectId: string;
  specObjectName: string;
  operation: ImportOperation;
  targetWorkItemType: string;
  /** Preview of mapped field values (field display name → resolved value) */
  fieldPreview: Record<string, string>;
  /** Per-item warnings */
  warnings: PreviewWarning[];
}

export type ImportOperation = 'create' | 'skip';
