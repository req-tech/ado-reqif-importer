import React, { useEffect, useMemo, useState } from 'react';
import { useWizard } from '../../context/wizard-context';
import type { MappingProfile, EnumValueMapping } from '../../models/mapping';
import type { EnumValue } from '../../parser/reqif-types';
import './ValueMappingStep.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EnumAttrSection {
  reqIfAttributeId: string;
  reqIfAttributeName: string;
  adoFieldName: string;
  enumValues: EnumValue[];
  adoAllowedValues: string[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const ValueMappingStep: React.FC = () => {
  const { state, dispatch } = useWizard();
  const { parsedDocument, mappingProfile, adoWorkItemTypes } = state;

  // valueMappings: reqIfAttributeId → EnumValueMapping[]
  const [valueMappings, setValueMappings] = useState<Record<string, EnumValueMapping[]>>({});

  // Collect all enumerated attribute sections from the current profile
  const sections: EnumAttrSection[] = useMemo(() => {
    if (!parsedDocument || !mappingProfile) return [];
    const result: EnumAttrSection[] = [];

    for (const tm of mappingProfile.typeMappings) {
      if (!tm.adoWorkItemType) continue;
      const specType = parsedDocument.specTypes.get(tm.reqIfSpecTypeId);
      if (!specType) continue;
      const adoType = adoWorkItemTypes.find((t) => t.name === tm.adoWorkItemType);

      for (const am of tm.attributeMappings) {
        if (!am.enabled || !am.adoFieldRefName) continue;
        const attrDef = specType.attributeDefinitions.get(am.reqIfAttributeId);
        if (!attrDef || attrDef.type !== 'ENUMERATION' || !attrDef.enumValues?.length) continue;

        const adoField = adoType?.fields.find((f) => f.referenceName === am.adoFieldRefName);
        const adoAllowedValues = adoField?.allowedValues ?? [];

        // Avoid duplicates when the same attribute appears in multiple spec types
        if (result.some((s) => s.reqIfAttributeId === am.reqIfAttributeId)) continue;

        result.push({
          reqIfAttributeId: am.reqIfAttributeId,
          reqIfAttributeName: am.reqIfAttributeName,
          adoFieldName: am.adoFieldName,
          enumValues: attrDef.enumValues,
          adoAllowedValues,
        });
      }
    }
    return result;
  }, [parsedDocument, mappingProfile, adoWorkItemTypes]);

  // Initialise valueMappings from saved profile (or auto-preset by name)
  useEffect(() => {
    if (!sections.length) return;

    const initial: Record<string, EnumValueMapping[]> = {};

    for (const sec of sections) {
      // Existing per-attribute mappings from the profile (if any)
      const existingEvMappings: EnumValueMapping[] =
        mappingProfile?.typeMappings
          .flatMap((tm) => tm.attributeMappings)
          .find((am) => am.reqIfAttributeId === sec.reqIfAttributeId)
          ?.enumValueMappings ?? [];

      const mappings: EnumValueMapping[] = sec.enumValues.map((ev) => {
        // Prefer already-saved mapping
        const saved = existingEvMappings.find((m) => m.reqIfEnumValueName === ev.longName);
        if (saved) return saved;

        // Auto-preset: case-insensitive match in ADO allowed values
        const matched = sec.adoAllowedValues.find(
          (av) => av.toLowerCase() === ev.longName.toLowerCase()
        );
        return { reqIfEnumValueName: ev.longName, adoValue: matched ?? '' };
      });

      initial[sec.reqIfAttributeId] = mappings;
    }

    setValueMappings(initial);
    // Run once when sections are first computed (or profile changes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleValueChange = (attrId: string, enumValueName: string, adoValue: string) => {
    setValueMappings((prev) => ({
      ...prev,
      [attrId]: (prev[attrId] ?? []).map((m) =>
        m.reqIfEnumValueName === enumValueName ? { ...m, adoValue } : m
      ),
    }));
  };

  const buildUpdatedProfile = (): MappingProfile => {
    if (!mappingProfile) throw new Error('No mapping profile');
    return {
      ...mappingProfile,
      updatedAt: new Date().toISOString(),
      typeMappings: mappingProfile.typeMappings.map((tm) => ({
        ...tm,
        attributeMappings: tm.attributeMappings.map((am) => {
          const evMappings = valueMappings[am.reqIfAttributeId];
          if (!evMappings) return am;
          return { ...am, enumValueMappings: evMappings };
        }),
      })),
    };
  };

  const handleNext = () => {
    const profile = buildUpdatedProfile();
    dispatch({ type: 'SET_MAPPING_PROFILE', profile });
    dispatch({ type: 'SET_STEP', step: 'preview' });
  };

  const handleBack = () => {
    dispatch({ type: 'SET_STEP', step: 'mapping' });
  };

  // ---------------------------------------------------------------------------
  // Guard
  // ---------------------------------------------------------------------------

  if (!parsedDocument || !mappingProfile) {
    return <p>No document loaded. Please complete the previous steps first.</p>;
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="value-mapping-step">
      <div className="step-topbar">
        <div className="step-topbar__left">
          <span className="step-topbar__title">Map Values</span>
        </div>
        <div className="step-topbar__right">
          <button type="button" onClick={handleBack}>← Back</button>
          <button className="btn-primary" onClick={handleNext}>Next →</button>
        </div>
      </div>

      <div className="value-mapping-content">
      {sections.length === 0 ? (
        <p className="value-mapping-empty">
          No enumerated fields are mapped — nothing to configure here.
        </p>
      ) : (
          <table className="value-mapping-table" role="table">
            <thead>
              <tr>
                <th>ReqIF Field</th>
                <th>Value from ReqIF</th>
                <th></th>
                <th>Target value in ADO</th>
              </tr>
            </thead>
            <tbody>
              {sections.map((sec) => {
                const attrMappings = valueMappings[sec.reqIfAttributeId] ?? [];
                return attrMappings.map((vm, idx) => (
                  <tr key={`${sec.reqIfAttributeId}__${vm.reqIfEnumValueName}`}>
                    {idx === 0 && (
                      <td
                        rowSpan={attrMappings.length}
                        className="value-mapping-field-name"
                      >
                        {sec.reqIfAttributeName}
                        <span className="value-mapping-ado-field">
                          (mapped to <strong>{sec.adoFieldName}</strong>)
                        </span>
                      </td>
                    )}
                    <td className="value-mapping-source-value">{vm.reqIfEnumValueName}</td>
                    <td className="value-mapping-arrow" aria-hidden="true">→</td>
                    <td>
                      {sec.adoAllowedValues.length > 0 ? (
                        <select
                          aria-label={`ADO value for ${sec.reqIfAttributeName}: ${vm.reqIfEnumValueName}`}
                          value={vm.adoValue}
                          onChange={(e) =>
                            handleValueChange(sec.reqIfAttributeId, vm.reqIfEnumValueName, e.target.value)
                          }
                        >
                          <option value="">— Not mapped —</option>
                          {sec.adoAllowedValues.map((av) => (
                            <option key={av} value={av}>{av}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          aria-label={`ADO value for ${sec.reqIfAttributeName}: ${vm.reqIfEnumValueName}`}
                          value={vm.adoValue}
                          placeholder="Enter ADO value"
                          onChange={(e) =>
                            handleValueChange(sec.reqIfAttributeId, vm.reqIfEnumValueName, e.target.value)
                          }
                        />
                      )}
                    </td>
                  </tr>
                ));
              })}
            </tbody>
          </table>
      )}

      </div>
    </div>
  );
};

export default ValueMappingStep;
