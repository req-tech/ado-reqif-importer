import React, { useEffect, useState } from 'react';
import { useWizard } from '../../context/wizard-context';
import type { AdoWorkItemType } from '../../models/ado-metadata';
import type { MappingProfile, TypeMapping } from '../../models/mapping';
import type { AttributeValue, SpecObject } from '../../parser/reqif-types';
import { getAdoWorkItemTypes } from '../../services/ado-metadata-service';
import ProfileSelector from './ProfileSelector';
import './MappingStep.css';

const SAMPLE_PRESETS = [1, 2, 3, 5, 10, 55] as const;
const MAX_PREVIEW_CHARS = 100;
const MAX_TOOLTIP_CHARS = 1000;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const MappingStep: React.FC = () => {
  const { state, dispatch } = useWizard();
  const { parsedDocument, mappingProfile } = state;

  const [adoTypes, setAdoTypes] = useState<AdoWorkItemType[]>([]);
  const [typeMappings, setTypeMappings] = useState<TypeMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [sampleItemNumber, setSampleItemNumber] = useState<number>(1);
  const [sampleSelectionMode, setSampleSelectionMode] = useState<'preset' | 'custom'>('preset');
  const [customSampleInput, setCustomSampleInput] = useState<string>('1');

  // ---- Load ADO types on mount ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const project = (window as unknown as { __ADO_PROJECT__?: string }).__ADO_PROJECT__;
        if (!project) {
          throw new Error('Azure DevOps project context is unavailable. Reload the extension inside a project-scoped page.');
        }
        const types = await getAdoWorkItemTypes(project);
        if (!cancelled) {
          setAdoTypes(types);
          dispatch({ type: 'SET_ADO_WORK_ITEM_TYPES', types });
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : String(err);
          dispatch({ type: 'SET_ERROR', message });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [dispatch]);

  // ---- Initialise typeMappings from current profile or fresh ----
  useEffect(() => {
    if (!parsedDocument) return;

    const specTypesList = Array.from(parsedDocument.specTypes.values());

    if (mappingProfile) {
      // Pre-populate from saved profile
      setTypeMappings(mappingProfile.typeMappings);
    } else {
      // Build blank mappings
      const blank: TypeMapping[] = specTypesList.map((st) => ({
        reqIfSpecTypeId: st.identifier,
        reqIfSpecTypeName: st.longName,
        adoWorkItemType: '',
        attributeMappings: Array.from(st.attributeDefinitions.values()).map((ad) => ({
          reqIfAttributeId: ad.identifier,
          reqIfAttributeName: ad.longName,
          adoFieldRefName: '',
          adoFieldName: '',
          enabled: true,
        })),
      }));
      setTypeMappings(blank);
    }
  }, [parsedDocument, mappingProfile]);

  // ---- Handlers ----
  const handleWITypeChange = (specTypeId: string, adoWIType: string) => {
    setTypeMappings((prev) =>
      prev.map((tm) =>
        tm.reqIfSpecTypeId === specTypeId ? { ...tm, adoWorkItemType: adoWIType } : tm
      )
    );
  };

  const handleAttrMappingChange = (
    specTypeId: string,
    attrId: string,
    adoFieldRefName: string,
    adoFieldName: string
  ) => {
    setTypeMappings((prev) =>
      prev.map((tm) => {
        if (tm.reqIfSpecTypeId !== specTypeId) return tm;
        return {
          ...tm,
          attributeMappings: tm.attributeMappings.map((am) =>
            am.reqIfAttributeId === attrId ? { ...am, adoFieldRefName, adoFieldName } : am
          ),
        };
      })
    );
  };

  const buildProfile = (): MappingProfile => {
    const now = new Date().toISOString();
    return {
      id: mappingProfile?.id ?? `profile-${Date.now()}`,
      displayName: mappingProfile?.displayName ?? 'Unnamed Profile',
      createdAt: mappingProfile?.createdAt ?? now,
      updatedAt: now,
      reqIfIdentifierField: mappingProfile?.reqIfIdentifierField ?? 'Custom.ReqIFIdentifier',
      typeMappings,
      ...(mappingProfile?.fieldDefaults ? { fieldDefaults: mappingProfile.fieldDefaults } : {}),
    };
  };

  const handleNext = () => {
    const profile = buildProfile();
    dispatch({ type: 'SET_MAPPING_PROFILE', profile });
    dispatch({ type: 'SET_STEP', step: 'valuemapping' });
  };

  // ---- Render helpers ----
  const getAdoFields = (witName: string) => {
    const fields = adoTypes.find((t) => t.name === witName)?.fields ?? [];
    return [...fields].sort((a, b) => a.name.localeCompare(b.name));
  };

  const getSpecTypeSampleObject = (specTypeId: string): SpecObject | undefined => {
    if (!parsedDocument) return undefined;

    const matching = parsedDocument.specObjectOrder
      .map((id) => parsedDocument.specObjects.get(id))
      .filter((obj): obj is SpecObject => Boolean(obj && obj.specTypeId === specTypeId));

    if (matching.length === 0) return undefined;

    const idx = Math.max(0, sampleItemNumber - 1);
    return matching[idx] ?? matching[0];
  };

  const normalizeAttributeValue = (value: AttributeValue | undefined): string => {
    if (!value) return '';

    let text = '';
    switch (value.type) {
      case 'STRING':
      case 'UNKNOWN':
      case 'DATE':
        text = value.value;
        break;
      case 'XHTML':
        text = value.value.replace(/<[^>]*>/g, ' ');
        break;
      case 'INTEGER':
      case 'REAL':
      case 'BOOLEAN':
        text = String(value.value);
        break;
      case 'ENUMERATION':
        text = value.value.join(', ');
        break;
      default:
        text = '';
    }

    return text.replace(/\s+/g, ' ').trim();
  };

  const truncateForDisplay = (text: string, maxChars: number): string => {
    if (text.length <= maxChars) return text;
    return `${text.slice(0, maxChars)}…`;
  };

  const handleSamplePresetChange = (rawValue: string) => {
    if (rawValue === 'custom') {
      setSampleSelectionMode('custom');
      const parsed = Number(customSampleInput);
      const normalized = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
      setSampleItemNumber(normalized);
      return;
    }

    const n = Number(rawValue);
    const normalized = Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
    setSampleSelectionMode('preset');
    setSampleItemNumber(normalized);
  };

  const handleCustomSampleApply = () => {
    const parsed = Number(customSampleInput);
    const normalized = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
    setSampleItemNumber(normalized);
  };

  if (!parsedDocument) {
    return <p>No document loaded. Please upload a file first.</p>;
  }

  const specTypesList = Array.from(parsedDocument.specTypes.values());

  return (
    <div className="mapping-step">

      {/* ---- Sticky top bar ---- */}
      <div className="mapping-topbar">
        <div className="mapping-topbar__row mapping-topbar__row--profiles">
          <ProfileSelector
            currentMappings={typeMappings}
            fieldDefaults={state.fieldDefaults}
            onProfileLoaded={(profile) => {
              dispatch({ type: 'SET_MAPPING_PROFILE', profile });
            }}
          />
        </div>
        <div className="mapping-topbar__row mapping-topbar__row--controls">
          <div className="mapping-sample-controls" role="group" aria-label="Sample item controls">
            <label htmlFor="sample-item-select">Sample item:</label>
            <select
              id="sample-item-select"
              aria-label="Sample item number"
              value={sampleSelectionMode === 'custom' ? 'custom' : String(sampleItemNumber)}
              onChange={(e) => handleSamplePresetChange(e.target.value)}
            >
              {SAMPLE_PRESETS.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
              <option value="custom">Custom…</option>
            </select>
            {sampleSelectionMode === 'custom' && (
              <>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={customSampleInput}
                  onChange={(e) => setCustomSampleInput(e.target.value)}
                  aria-label="Custom sample item number"
                />
                <button type="button" onClick={handleCustomSampleApply}>Apply</button>
              </>
            )}
          </div>
          <div className="mapping-actions">
            <button
              className="btn-primary"
              onClick={handleNext}
              disabled={typeMappings.every((tm) => !tm.adoWorkItemType)}
              aria-label="Next step"
            >
              Next →
            </button>
          </div>
        </div>
      </div>

      {/* ---- Scrollable mapping table ---- */}
      {loading ? (
        <p>Loading ADO work item types…</p>
      ) : (
        <table className="mapping-table" role="table">
          <thead>
            <tr role="row">
              <th>ReqIF SpecType</th>
              <th>ADO Work Item Type</th>
            </tr>
          </thead>
          <tbody>
            {specTypesList.map((st) => {
              const tm = typeMappings.find((m) => m.reqIfSpecTypeId === st.identifier);
              const fields = getAdoFields(tm?.adoWorkItemType ?? '');

              return (
                <React.Fragment key={st.identifier}>
                  <tr role="row">
                    <td>{st.longName}</td>
                    <td>
                      <select
                        aria-label={`WI type for ${st.longName}`}
                        value={tm?.adoWorkItemType ?? ''}
                        onChange={(e) => handleWITypeChange(st.identifier, e.target.value)}
                      >
                        <option value="">— Not Selected for import —</option>
                        {adoTypes.map((t) => (
                          <option key={t.referenceName} value={t.name}>{t.name}</option>
                        ))}
                      </select>
                    </td>
                  </tr>

                  {tm?.adoWorkItemType && (
                    <tr role="row">
                      <td colSpan={2}>
                        <table className="attr-mapping-table">
                          <thead>
                            <tr>
                              <th>ReqIF Attribute</th>
                              <th>Example value</th>
                              <th>ADO Field</th>
                            </tr>
                          </thead>
                          <tbody>
                            {tm.attributeMappings.map((am) => {
                              const sampleObj = getSpecTypeSampleObject(st.identifier);
                              const sampleAttr = sampleObj?.attributeValues.get(am.reqIfAttributeId);
                              const fullSampleText = normalizeAttributeValue(sampleAttr);
                              const sampleText = truncateForDisplay(fullSampleText, MAX_PREVIEW_CHARS);
                              const sampleTooltipText = truncateForDisplay(fullSampleText, MAX_TOOLTIP_CHARS);

                              return (
                                <tr key={am.reqIfAttributeId}>
                                  <td>{am.reqIfAttributeName}</td>
                                  <td className="attr-example" title={sampleTooltipText}>
                                    {sampleText || '—'}
                                  </td>
                                  <td>
                                    <select
                                      aria-label={`ADO field for ${am.reqIfAttributeName}`}
                                      value={am.adoFieldRefName}
                                      onChange={(e) => {
                                        const sel = fields.find((f) => f.referenceName === e.target.value);
                                        handleAttrMappingChange(
                                          st.identifier,
                                          am.reqIfAttributeId,
                                          e.target.value,
                                          sel?.name ?? ''
                                        );
                                      }}
                                    >
                                      <option value="">— Skip —</option>
                                      {fields.map((f) => (
                                        <option key={f.referenceName} value={f.referenceName}>{f.name}</option>
                                      ))}
                                    </select>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default MappingStep;
