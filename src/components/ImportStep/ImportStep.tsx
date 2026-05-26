// src/components/ImportStep/ImportStep.tsx
// Phase 6: Execute import and show real-time status + final report.

import React, { useState, useCallback } from 'react';
import { useWizard } from '../../context/wizard-context';
import { executeImport } from '../../services/import-service';
import type { ImportStatus, ImportReport } from '../../models/report';
import './ImportStep.css';

const ImportStep: React.FC = () => {
  const { state, dispatch } = useWizard();
  const { importPreview, mappingProfile } = state;

  const [running, setRunning] = useState(false);
  const [logEntries, setLogEntries] = useState<string[]>([]);
  const [report, setReport] = useState<ImportReport | null>(null);

  const project = (window as unknown as { __ADO_PROJECT__?: string }).__ADO_PROJECT__ ?? 'default';

  const handleExecute = useCallback(async () => {
    if (!importPreview || !mappingProfile) return;

    setRunning(true);
    setLogEntries([]);
    setReport(null);

    const onProgress = (status: ImportStatus) => {
      setLogEntries((prev) => [
        ...prev,
        `[${new Date().toISOString()}] processed ${status.processedItems} / ${status.totalItems}`,
      ]);
      dispatch({ type: 'SET_IMPORT_STATUS', status });
    };

    try {
      const importReport = await executeImport(importPreview, mappingProfile, project, onProgress);
      setReport(importReport);
      dispatch({ type: 'SET_IMPORT_REPORT', report: importReport });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      dispatch({ type: 'SET_ERROR', message });
    } finally {
      setRunning(false);
    }
  }, [importPreview, mappingProfile, project, dispatch]);

  if (!importPreview) {
    return <div className="import-step">No import preview found. Please complete previous steps.</div>;
  }

  return (
    <div className="import-step">
      <div className="import-step__header">Execute Import</div>

      <div className="import-step__summary">
        Ready to create {importPreview.items.filter((i) => i.operation === 'create').length} work item(s)
        {importPreview.items.filter((i) => i.operation === 'skip').length > 0
          ? ` and skip ${importPreview.items.filter((i) => i.operation === 'skip').length}`
          : ''}
        .
      </div>

      <div className="import-step__actions">
        <button
          className="import-step__execute-btn"
          onClick={handleExecute}
          disabled={running || !importPreview.canExecute}
          aria-label="Execute Import"
        >
          {running ? 'Running…' : 'Execute Import'}
        </button>
      </div>

      {logEntries.length > 0 && (
        <ul className="import-step__log" role="log">
          {logEntries.map((entry, idx) => (
            <li key={idx} className="import-step__log-entry">
              {entry}
            </li>
          ))}
        </ul>
      )}

      {report && (
        <div className="import-step__report">
          <div className="import-step__report-title">Import Complete</div>
          <div className="import-step__report-counts">
            <span>Created: {report.totalCreated}</span>
            <span>Skipped: {report.totalSkipped}</span>
            <span>Failed: {report.totalFailed}</span>
          </div>

          {report.failedItems.length > 0 && (
            <div className="import-step__report-section">
              <h4>Failed Items</h4>
              <ul>
                {report.failedItems.map((f) => (
                  <li key={f.specObjectId} className="import-step__failed-item">
                    {f.specObjectName} ({f.specObjectId}): {f.errorMessage}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ImportStep;
