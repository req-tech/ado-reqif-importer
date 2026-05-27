// src/components/ImportStep/ImportStep.tsx
// Phase 6: Execute import and show real-time status + final report.

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useWizard } from '../../context/wizard-context';
import { executeImport } from '../../services/import-service';
import type { ImportStatus, ImportReport, LogEntry } from '../../models/report';
import ProfileSelector from '../MappingStep/ProfileSelector';
import './ImportStep.css';

// Short HH:MM:SS.mmm timestamp for log display
function formatLogTime(iso: string): string {
  const d = new Date(iso);
  return [
    String(d.getHours()).padStart(2, '0'),
    String(d.getMinutes()).padStart(2, '0'),
    String(d.getSeconds()).padStart(2, '0'),
  ].join(':') + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

const ImportStep: React.FC = () => {
  const { state, dispatch } = useWizard();
  const { importPreview, parsedDocument, mappingProfile, fieldDefaults, adoWorkItemTypes } = state;

  const [running, setRunning] = useState(false);
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const [report, setReport] = useState<ImportReport | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const project = (window as unknown as { __ADO_PROJECT__?: string }).__ADO_PROJECT__;

  // Auto-scroll log to bottom whenever new entries arrive
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logEntries]);

  const handleExecute = useCallback(async () => {
    if (!parsedDocument || !mappingProfile) return;
    if (!project) {
      dispatch({ type: 'SET_ERROR', message: 'Azure DevOps project context is unavailable. Reload the extension inside a project-scoped page.' });
      return;
    }

    setRunning(true);
    setLogEntries([]);
    setReport(null);

    const onProgress = (status: ImportStatus) => {
      setLogEntries(status.logEntries);
      dispatch({ type: 'SET_IMPORT_STATUS', status });
    };

    try {
      const importReport = await executeImport(
        parsedDocument,
        mappingProfile,
        project,
        onProgress,
        fieldDefaults,
        adoWorkItemTypes,
        importPreview?.warnings ?? []
      );
      setReport(importReport);
      dispatch({ type: 'SET_IMPORT_REPORT', report: importReport });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      dispatch({ type: 'SET_ERROR', message });
    } finally {
      setRunning(false);
    }
  }, [parsedDocument, importPreview, mappingProfile, project, fieldDefaults, adoWorkItemTypes, dispatch]);

  if (!importPreview || !parsedDocument) {
    return <div className="import-step">No import preview found. Please complete previous steps.</div>;
  }

  return (
    <div className="import-step">
      <div className="step-topbar">
        <div className="step-topbar__left">
          <span className="step-topbar__title">Run Import</span>
          {!report && (
            <span className="import-step__summary">
              Ready to import <strong>{parsedDocument.specObjectCount}</strong> requirement(s).
              {importPreview.items.filter((i) => i.operation === 'skip').length > 0
                ? ` (${importPreview.items.filter((i) => i.operation === 'skip').length} have no type mapping)`
                : ''}
              {' '}Items already in ADO will be updated.
            </span>
          )}
        </div>
        {!report && (
          <div className="step-topbar__right">
            <button
              className="btn-primary"
              onClick={handleExecute}
              disabled={running || !importPreview.canExecute}
              aria-label="Run Import"
            >
              {running ? 'Running…' : 'Run Import'}
            </button>
          </div>
        )}
        {report && (
          <div className="step-topbar__right">
            <button
              className="btn-primary"
              onClick={() => dispatch({ type: 'SET_STEP', step: 'upload' })}
              aria-label="Import another ReqIF"
            >
              ↑ Import another ReqIF
            </button>
          </div>
        )}
      </div>

      <div className="import-step__body">
      {logEntries.length > 0 && (
        <div className="import-step__log" ref={logRef} role="log" aria-live="polite" aria-label="Import progress log">
          {logEntries.map((entry, idx) => (
            <div key={idx} className={`import-step__log-entry import-step__log-entry--${entry.level}`}>
              <span className="import-step__log-time">{formatLogTime(entry.timestamp)}</span>
              {entry.specObjectId && (
                <span className="import-step__log-reqif" title={entry.specObjectId}>
                  {entry.specObjectId.length > 24
                    ? entry.specObjectId.slice(0, 12) + '…' + entry.specObjectId.slice(-8)
                    : entry.specObjectId}
                </span>
              )}
              <span className="import-step__log-msg">{entry.message}</span>
            </div>
          ))}
        </div>
      )}

      {report && (
        <div className="import-step__report">
          <div className="import-step__report-title">Import Complete</div>
          <div className="import-step__report-counts">
            <span className="import-step__count import-step__count--created">Created: {report.totalCreated}</span>
            <span className="import-step__count import-step__count--updated">Updated: {report.totalUpdated}</span>
            <span className="import-step__count">Skipped: {report.totalSkipped}</span>
            <span className={report.totalFailed > 0 ? 'import-step__count import-step__count--failed' : 'import-step__count'}>
              Failed: {report.totalFailed}
            </span>
          </div>

          {report.allWarnings.filter((w) => w.level === 'warning').length > 0 && (
            <div className="import-step__report-section import-step__report-section--warning">
              <h4>Warnings</h4>
              <ul>
                {report.allWarnings.filter((w) => w.level === 'warning').map((w, i) => (
                  <li key={i}>{w.specObjectId && <code>{w.specObjectId}</code>} {w.message}</li>
                ))}
              </ul>
            </div>
          )}

          {report.skippedItems.length > 0 && (
            <div className="import-step__report-section">
              <h4>Skipped — Reasons</h4>
              <ul>
                {Object.entries(
                  report.skippedItems.reduce<Record<string, number>>((acc, s) => {
                    acc[s.reason] = (acc[s.reason] ?? 0) + 1;
                    return acc;
                  }, {})
                ).map(([reason, count]) => (
                  <li key={reason}>{count}× — {reason}</li>
                ))}
              </ul>
            </div>
          )}

          {report.failedItems.length > 0 && (
            <div className="import-step__report-section import-step__report-section--error">
              <h4>Failed Items</h4>
              <ul>
                {report.failedItems.map((f) => (
                  <li key={f.specObjectId} className="import-step__failed-item">
                    <code className="import-step__failed-reqif">{f.specObjectId}</code>
                    <span className="import-step__failed-msg">{f.errorMessage}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {mappingProfile && (
            <div className="import-step__save-bar">
              <strong>Save mapping configuration:</strong>
              <ProfileSelector
                currentMappings={mappingProfile.typeMappings}
                fieldDefaults={fieldDefaults}
                onProfileLoaded={(profile) => dispatch({ type: 'SET_MAPPING_PROFILE', profile })}
              />
            </div>
          )}
        </div>
      )}
      </div>{/* import-step__body */}
    </div>
  );
};

export default ImportStep;
