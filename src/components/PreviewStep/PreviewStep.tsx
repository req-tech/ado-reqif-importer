import React, { useEffect, useMemo, useState } from 'react';
import { useWizard } from '../../context/wizard-context';
import { computePreview } from '../../services/import-service';
import type { ImportPreview } from '../../models/preview';
import './PreviewStep.css';

const SAMPLE_OPTIONS = [1, 2, 5, 10, 25, 50] as const;

const PreviewStep: React.FC = () => {
  const { state, dispatch } = useWizard();
  const { parsedDocument, mappingProfile, adoWorkItemTypes } = state;

  const [sampleSize, setSampleSize] = useState<number>(10);
  const [preview, setPreview] = useState<ImportPreview | null>(null);

  // Recompute whenever doc, profile, adoTypes, or sampleSize change
  const computed = useMemo(() => {
    if (!parsedDocument || !mappingProfile) return null;
    return computePreview(parsedDocument, mappingProfile, adoWorkItemTypes, sampleSize);
  }, [parsedDocument, mappingProfile, adoWorkItemTypes, sampleSize]);

  useEffect(() => {
    setPreview(computed);
    if (computed) {
      dispatch({ type: 'SET_IMPORT_PREVIEW', preview: computed });
    }
  }, [computed, dispatch]);

  const handleRunImport = () => {
    dispatch({ type: 'SET_STEP', step: 'import' });
  };

  if (!parsedDocument || !mappingProfile) {
    return <p>No document or mapping available. Go back and upload a file.</p>;
  }

  if (!preview) {
    return <p>Computing preview…</p>;
  }

  return (
    <div className="preview-step">
      <div className="preview-header">
        <span className="preview-total">
          Total: <strong>{preview.totalCount}</strong> requirements
        </span>
        <label htmlFor="sample-size-select">Show first:</label>
        <select
          id="sample-size-select"
          aria-label="Sample size"
          value={sampleSize}
          onChange={(e) => setSampleSize(Number(e.target.value))}
        >
          {SAMPLE_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>

      {preview.warnings.length > 0 && (
        <div className="preview-warnings" role="list" aria-label="Warnings">
          {preview.warnings.map((w, i) => (
            <div
              key={i}
              role="listitem"
              className={`preview-warning preview-warning--${w.level}`}
            >
              {w.message}
            </div>
          ))}
        </div>
      )}

      <table className="preview-table" role="table">
        <thead>
          <tr role="row">
            <th>ID</th>
            <th>Name</th>
            <th>Operation</th>
            <th>Work Item Type</th>
            <th>Title Preview</th>
          </tr>
        </thead>
        <tbody>
          {preview.items.map((item) => (
            <tr key={item.specObjectId} role="row">
              <td>{item.specObjectId}</td>
              <td>{item.specObjectName}</td>
              <td className={`op-${item.operation}`}>{item.operation}</td>
              <td>{item.targetWorkItemType}</td>
              <td>{item.fieldPreview['Title'] ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="preview-actions">
        <button
          onClick={handleRunImport}
          disabled={!preview.canExecute}
          aria-label="Run Import"
        >
          Run Import
        </button>
      </div>
    </div>
  );
};

export default PreviewStep;
