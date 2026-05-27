import React, { useEffect, useMemo, useState } from 'react';
import { useWizard } from '../../context/wizard-context';
import { computePreview } from '../../services/import-service';
import { getIterationPaths, getAreaPaths } from '../../services/ado-metadata-service';
import type { ImportPreview } from '../../models/preview';
import ProfileSelector from '../MappingStep/ProfileSelector';
import './PreviewStep.css';

// Extracts { displayName, refName } from warnings like:
// Required field "Iteration ID" (System.IterationId) has no attribute mapping in type "".
const REQUIRED_FIELD_RE = /^Required field "([^"]+)" \(([^)]+)\) has no attribute mapping/;

// Fields that should show a dropdown populated from ADO classification nodes.
const ITERATION_FIELD_REFS = new Set(['System.IterationId', 'System.IterationPath']);
const AREA_FIELD_REFS = new Set(['System.AreaId', 'System.AreaPath']);

interface RequiredFieldWarning {
  displayName: string;
  refName: string;
  message: string;
}

const SAMPLE_OPTIONS = [1, 2, 5, 10, 25, 50] as const;

const PreviewStep: React.FC = () => {
  const { state, dispatch } = useWizard();
  const { parsedDocument, mappingProfile, adoWorkItemTypes, fieldDefaults } = state;

  const [sampleSize, setSampleSize] = useState<number>(10);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [iterationPaths, setIterationPaths] = useState<string[]>([]);
  const [areaPaths, setAreaPaths] = useState<string[]>([]);

  // Load iteration and area paths from ADO on mount
  useEffect(() => {
    const project = (window as unknown as { __ADO_PROJECT__?: string }).__ADO_PROJECT__;
    if (!project) return;
    getIterationPaths(project).then(setIterationPaths).catch(() => undefined);
    getAreaPaths(project).then(setAreaPaths).catch(() => undefined);
  }, []);

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

  const handleBackToMapping = () => {
    dispatch({ type: 'SET_STEP', step: 'mapping' });
  };

  if (!parsedDocument || !mappingProfile) {
    return <p>No document or mapping available. Go back and upload a file.</p>;
  }

  if (!preview) {
    return <p>Computing preview…</p>;
  }

  return (
    <div className="preview-step">

      {/* ---- Sticky topbar ---- */}
      <div className="step-topbar">
        <div className="step-topbar__left">
          <ProfileSelector
            currentMappings={mappingProfile.typeMappings}
            fieldDefaults={fieldDefaults}
            onProfileLoaded={(profile) => dispatch({ type: 'SET_MAPPING_PROFILE', profile })}
          />
        </div>
        <div className="step-topbar__right">
          <button onClick={handleBackToMapping} aria-label="Back to Mapping">← Back to Mapping</button>
          <button
            className="btn-primary"
            onClick={handleRunImport}
            disabled={!preview.canExecute}
            aria-label="Run Import"
          >
            Run Import
          </button>
        </div>
      </div>

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
          {preview.warnings.map((w, i) => {
            const match = w.level === 'warning' ? REQUIRED_FIELD_RE.exec(w.message) : null;
            const rf: RequiredFieldWarning | null = match
              ? { displayName: match[1], refName: match[2], message: w.message }
              : null;

            // Required-field panels use info style (not yellow warning)
            const panelClass = rf
              ? 'preview-warning preview-warning--info'
              : `preview-warning preview-warning--${w.level}`;

            const isIteration = rf && ITERATION_FIELD_REFS.has(rf.refName);
            const isArea = rf && AREA_FIELD_REFS.has(rf.refName);
            const dropdownOptions = isIteration ? iterationPaths : isArea ? areaPaths : null;

            return (
              <div key={i} role="listitem" className={panelClass}>
                <div className="preview-warning__message">{w.message}</div>
                {rf && (
                  <div className="preview-warning__default">
                    <label htmlFor={`default-${rf.refName}`}>Default value:</label>
                    {dropdownOptions ? (
                      <select
                        id={`default-${rf.refName}`}
                        value={fieldDefaults[rf.refName] ?? ''}
                        onChange={(e) =>
                          dispatch({ type: 'SET_FIELD_DEFAULT', fieldRefName: rf.refName, value: e.target.value })
                        }
                        aria-label={`Default value for ${rf.displayName}`}
                      >
                        <option value="">— select —</option>
                        {dropdownOptions.map((p) => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        id={`default-${rf.refName}`}
                        type="text"
                        placeholder={`e.g. ${rf.refName === 'System.State' ? 'Active' : '...'}`}
                        value={fieldDefaults[rf.refName] ?? ''}
                        onChange={(e) =>
                          dispatch({ type: 'SET_FIELD_DEFAULT', fieldRefName: rf.refName, value: e.target.value })
                        }
                        aria-label={`Default value for ${rf.displayName}`}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
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

    </div>
  );
};

export default PreviewStep;
