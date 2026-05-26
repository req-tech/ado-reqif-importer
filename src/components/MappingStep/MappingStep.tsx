import React, { useEffect, useState } from 'react';
import { useWizard } from '../../context/wizard-context';
import type { AdoWorkItemType } from '../../models/ado-metadata';
import type { MappingProfile, TypeMapping } from '../../models/mapping';
import { getAdoWorkItemTypes } from '../../services/ado-metadata-service';
import ProfileSelector from './ProfileSelector';
import './MappingStep.css';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const MappingStep: React.FC = () => {
  const { state, dispatch } = useWizard();
  const { parsedDocument, mappingProfile } = state;

  const [adoTypes, setAdoTypes] = useState<AdoWorkItemType[]>([]);
  const [typeMappings, setTypeMappings] = useState<TypeMapping[]>([]);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // ---- Load ADO types on mount ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // SDK.getConfiguration().project is not available in test, fall back to ''
        const project = (window as unknown as { __ADO_PROJECT__?: string }).__ADO_PROJECT__ ?? 'default';
        const types = await getAdoWorkItemTypes(project);
        if (!cancelled) {
          setAdoTypes(types);
          dispatch({ type: 'SET_ADO_WORK_ITEM_TYPES', types });
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

  const handleToggleExpand = (specTypeId: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(specTypeId)) next.delete(specTypeId);
      else next.add(specTypeId);
      return next;
    });
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
    };
  };

  const handleSave = () => {
    const profile = buildProfile();
    dispatch({ type: 'SET_MAPPING_PROFILE', profile });
    // ProfileSelector will call saveProfile; here we just update context
  };

  const handleNext = () => {
    const profile = buildProfile();
    dispatch({ type: 'SET_MAPPING_PROFILE', profile });
    dispatch({ type: 'SET_STEP', step: 'preview' });
  };

  // ---- Render helpers ----
  const getAdoFields = (witName: string) =>
    adoTypes.find((t) => t.name === witName)?.fields ?? [];

  if (!parsedDocument) {
    return <p>No document loaded. Please upload a file first.</p>;
  }

  const specTypesList = Array.from(parsedDocument.specTypes.values());
  const hasUnmappedTypes = typeMappings.some((tm) => !tm.adoWorkItemType);

  return (
    <div className="mapping-step">
      <ProfileSelector
        currentMappings={typeMappings}
        onProfileLoaded={(profile) => {
          dispatch({ type: 'SET_MAPPING_PROFILE', profile });
        }}
      />

      {hasUnmappedTypes && (
        <p className="mapping-warning" role="alert">
          Some SpecTypes have no Work Item type selected. They will be skipped during import.
        </p>
      )}

      {loading ? (
        <p>Loading ADO work item types…</p>
      ) : (
        <table className="mapping-table" role="table">
          <thead>
            <tr role="row">
              <th>ReqIF SpecType</th>
              <th>ADO Work Item Type</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {specTypesList.map((st) => {
              const tm = typeMappings.find((m) => m.reqIfSpecTypeId === st.identifier);
              const expanded = expandedRows.has(st.identifier);
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
                        <option value="">— Select —</option>
                        {adoTypes.map((t) => (
                          <option key={t.referenceName} value={t.name}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <button
                        onClick={() => handleToggleExpand(st.identifier)}
                        aria-expanded={expanded}
                        disabled={!tm?.adoWorkItemType}
                      >
                        {expanded ? 'Collapse' : 'Map fields'}
                      </button>
                    </td>
                  </tr>

                  {expanded && (
                    <tr role="row">
                      <td colSpan={3}>
                        <table className="attr-mapping-table">
                          <thead>
                            <tr>
                              <th>ReqIF Attribute</th>
                              <th>ADO Field</th>
                            </tr>
                          </thead>
                          <tbody>
                            {tm?.attributeMappings.map((am) => (
                              <tr key={am.reqIfAttributeId}>
                                <td>{am.reqIfAttributeName}</td>
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
                                      <option key={f.referenceName} value={f.referenceName}>
                                        {f.name}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                              </tr>
                            ))}
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

      <div className="mapping-actions">
        <button onClick={handleSave} aria-label="Save profile">
          Save
        </button>
        <button
          onClick={handleNext}
          disabled={typeMappings.every((tm) => !tm.adoWorkItemType)}
          aria-label="Next step"
        >
          Next →
        </button>
      </div>
    </div>
  );
};

export default MappingStep;
