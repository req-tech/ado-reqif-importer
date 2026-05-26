// src/models/report.ts
// Import execution and report types.

/** Live state during import execution */
export interface ImportStatus {
  phase: ImportPhase;
  totalItems: number;
  processedItems: number;
  createdItems: number;
  skippedItems: number;
  failedItems: number;
  /** Rolling log entries for the status view */
  logEntries: LogEntry[];
}

export type ImportPhase = 'idle' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface LogEntry {
  timestamp: string; // ISO 8601
  level: 'info' | 'warning' | 'error';
  message: string;
  specObjectId?: string;
}

/** Warning used in both preview and final report */
export interface PreviewWarning {
  level: 'error' | 'warning' | 'info';
  message: string;
  /** Optional SpecObject identifier for context */
  specObjectId?: string;
  /** Optional ADO field reference name for context */
  adoFieldRef?: string;
}

/** Final report produced after execution completes */
export interface ImportReport {
  completedAt: string; // ISO 8601
  totalCreated: number;
  totalSkipped: number;
  totalFailed: number;
  createdItems: ImportedItem[];
  skippedItems: SkippedItem[];
  failedItems: FailedItem[];
  allWarnings: PreviewWarning[];
}

export interface ImportedItem {
  specObjectId: string;
  specObjectName: string;
  workItemId: number;
  workItemUrl: string; // direct link to the ADO work item
  workItemType: string;
}

export interface SkippedItem {
  specObjectId: string;
  specObjectName: string;
  reason: string;
}

export interface FailedItem {
  specObjectId: string;
  specObjectName: string;
  errorMessage: string;
  adoErrorCode?: string;
}
