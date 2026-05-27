import type { ReqIfDocument, SpecObject } from '../parser/reqif-types';
import type { MappingProfile, TypeMapping } from '../models/mapping';
import type { AdoWorkItemType } from '../models/ado-metadata';
import type { ImportPreview, PreviewItem, ImportOperation } from '../models/preview';
import type { PreviewWarning, ImportStatus, ImportReport, ImportedItem, UpdatedItem, SkippedItem, FailedItem, LogEntry } from '../models/report';
import { createWorkItem, updateWorkItem, queryExistingIdentifiers } from './work-item-service';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** System.Title is a String field capped at 255 characters by ADO (TF401324). */
const TITLE_FIELD_REF = 'System.Title';
const TITLE_MAX_LENGTH = 255;

// ---------------------------------------------------------------------------
// Field value sanitization helpers
// ---------------------------------------------------------------------------

/**
 * Convert a ReqIF XHTML serialization or plain text to a value safe for an ADO
 * html-type field.  XHTML namespace prefixes are stripped so ADO does not
 * reject the markup with TF400898.
 */
function sanitizeForHtmlField(value: string): string {
  if (!value.trim()) return '';
  if (value.includes('<')) {
    // Remove xmlns:* declarations and xhtml: tag prefixes
    return value
      .replace(/\s+xmlns(?::[a-z]+)?="[^"]*"/gi, '')
      .replace(/<(\/?)[a-z]+:([a-z][^\s>/]*)/gi, '<$1$2');
  }
  // Plain text — escape and wrap so ADO stores it as HTML
  return `<p>${value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`;
}

/**
 * Strip HTML/XML tags from a value so it is safe for a plain string ADO field.
 */
function sanitizeForStringField(value: string): string {
  if (!value.includes('<')) return value;
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// Public API — computePreview
// ---------------------------------------------------------------------------

/**
 * Compute a preview of the import operation without writing any Work Items.
 *
 * @param doc        The parsed ReqIF document
 * @param profile    The active mapping profile
 * @param adoTypes   ADO Work Item types available in the project
 * @param sampleSize Maximum number of PreviewItems to include in the result
 */
export function computePreview(
  doc: ReqIfDocument,
  profile: MappingProfile,
  adoTypes: AdoWorkItemType[],
  sampleSize: number
): ImportPreview {
  const warnings: PreviewWarning[] = [];

  // Build a quick lookup: SpecType identifier → TypeMapping
  const typeMappingBySpecTypeId = new Map<string, TypeMapping>(
    profile.typeMappings.map((tm) => [tm.reqIfSpecTypeId, tm])
  );

  // Build ADO field lookup: WI type name → field ref name set
  const adoFieldsByWIType = new Map<string, Set<string>>(
    adoTypes.map((t) => [t.name, new Set(t.fields.map((f) => f.referenceName))])
  );

  // ---------------------------------------------------------------------------
  // Identifier field validation
  // ---------------------------------------------------------------------------
  const identifierField = profile.reqIfIdentifierField;
  let identifierFieldPresent = false;

  for (const typeMapping of profile.typeMappings) {
    const fields = adoFieldsByWIType.get(typeMapping.adoWorkItemType);
    if (fields?.has(identifierField)) {
      identifierFieldPresent = true;
      break;
    }
  }

  if (!identifierFieldPresent && profile.typeMappings.length > 0) {
    warnings.push({
      level: 'error',
      message: `Identifier field "${identifierField}" not found in any mapped ADO Work Item type. Import cannot proceed.`,
    });
  }

  // ---------------------------------------------------------------------------
  // Title length validation
  // ---------------------------------------------------------------------------
  let titleTruncateCount = 0;

  for (const [, obj] of doc.specObjects) {
    const typeMapping = typeMappingBySpecTypeId.get(obj.specTypeId);
    if (!typeMapping) continue;
    const titleAttrMap = typeMapping.attributeMappings.find(
      (am) => am.enabled && am.adoFieldRefName === TITLE_FIELD_REF
    );
    if (!titleAttrMap) continue;
    const attrValue = obj.attributeValues.get(titleAttrMap.reqIfAttributeId);
    if (attrValue) {
      const raw = resolveValueToString(attrValue.value);
      if (raw.length > TITLE_MAX_LENGTH) titleTruncateCount++;
    }
  }

  if (titleTruncateCount > 0) {
    warnings.push({
      level: 'warning',
      message: `${titleTruncateCount} work item title(s) exceed ${TITLE_MAX_LENGTH} characters and will be truncated to fit the ADO limit.`,
    });
  }

  // ---------------------------------------------------------------------------
  // Required field validation
  // ---------------------------------------------------------------------------
  for (const typeMapping of profile.typeMappings) {
    const witFields = adoTypes.find((t) => t.name === typeMapping.adoWorkItemType)?.fields ?? [];
    const requiredFields = witFields.filter((f) => f.isRequired);
    const mappedRefNames = new Set(
      typeMapping.attributeMappings.filter((am) => am.enabled).map((am) => am.adoFieldRefName)
    );

    for (const reqField of requiredFields) {
      if (!mappedRefNames.has(reqField.referenceName)) {
        warnings.push({
          level: 'warning',
          message: `Required field "${reqField.name}" (${reqField.referenceName}) has no attribute mapping in type "${typeMapping.reqIfSpecTypeName}".`,
        });
      }
    }

    // Validate enum value mappings against ADO field allowed values
    for (const am of typeMapping.attributeMappings) {
      if (!am.enabled || !am.enumValueMappings?.length) continue;
      const adoField = witFields.find((f) => f.referenceName === am.adoFieldRefName);
      if (!adoField?.allowedValues?.length) continue;
      const allowedSet = new Set(adoField.allowedValues.map((v) => v.toLowerCase()));
      for (const evm of am.enumValueMappings) {
        if (evm.adoValue && !allowedSet.has(evm.adoValue.toLowerCase())) {
          warnings.push({
            level: 'error',
            message: `Value mapping "${evm.reqIfEnumValueName}" → "${evm.adoValue}" is invalid: "${evm.adoValue}" is not an allowed value for ADO field "${adoField.name}". Allowed values: ${adoField.allowedValues.join(', ')}.`,
            adoFieldRef: am.adoFieldRefName,
          });
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Build preview items (all objects, only first sampleSize returned)
  // ---------------------------------------------------------------------------
  const totalCount = doc.specObjectOrder.length;
  const previewItems: PreviewItem[] = [];

  for (const objId of doc.specObjectOrder) {
    if (previewItems.length >= sampleSize) break;

    const obj = doc.specObjects.get(objId);
    if (!obj) continue;

    const typeMapping = typeMappingBySpecTypeId.get(obj.specTypeId);

    // A typeMapping with an empty adoWorkItemType means "Not Selected for Import"
    const operation: ImportOperation = (typeMapping?.adoWorkItemType) ? 'create' : 'skip';

    const fieldPreview: Record<string, string> = {};
    const itemWarnings: PreviewWarning[] = [];

    if (typeMapping) {
      for (const attrMap of typeMapping.attributeMappings) {
        if (!attrMap.enabled) continue;

        const attrValue = obj.attributeValues.get(attrMap.reqIfAttributeId);
        if (attrValue) {
          fieldPreview[attrMap.adoFieldName] = resolveValueToString(attrValue.value);
        }
      }
    }

    previewItems.push({
      specObjectId: obj.identifier,
      specObjectName: obj.longName,
      operation,
      targetWorkItemType: typeMapping?.adoWorkItemType ?? '',
      fieldPreview,
      warnings: itemWarnings,
    });
  }

  const canExecute =
    warnings.filter((w) => w.level === 'error').length === 0;

  return {
    items: previewItems,
    totalCount,
    sampleSize,
    warnings,
    canExecute,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function resolveValueToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

/**
 * Look up the ReqIF.ForeignID attribute value for a spec object.
 * Returns undefined if the attribute is not present on this object's type.
 */
function getReqIfForeignId(obj: SpecObject, doc: ReqIfDocument): string | undefined {
  const specType = doc.specTypes.get(obj.specTypeId);
  if (!specType) return undefined;
  for (const [attrId, attrDef] of specType.attributeDefinitions) {
    if (attrDef.longName === 'ReqIF.ForeignID') {
      const val = obj.attributeValues.get(attrId);
      if (val) return resolveValueToString(val.value);
    }
  }
  return undefined;
}

/**
 * Extract a human-readable message from an ADO REST API error object.
 * The extension API wraps server errors as { status, message, serverError: { message } }.
 */
function extractAdoErrorMessage(err: unknown): string {
  if (typeof err === 'object' && err !== null) {
    const e = err as Record<string, unknown>;
    if (typeof e.serverError === 'object' && e.serverError !== null) {
      const se = e.serverError as Record<string, unknown>;
      if (typeof se.message === 'string' && se.message) {
        return `HTTP ${e.status ?? '?'}: ${se.message}`;
      }
      if (typeof se.typeKey === 'string' && se.typeKey) {
        return `HTTP ${e.status ?? '?'}: ${se.typeKey}`;
      }
    }
    if (typeof e.body === 'string') {
      try {
        const body = JSON.parse(e.body) as Record<string, unknown>;
        if (typeof body.message === 'string') return `HTTP ${e.status ?? '?'}: ${body.message}`;
      } catch { /* ignore */ }
    }
    // Skip bare "NNN: " strings produced by the extension API wrapper
    if (typeof e.message === 'string' && e.message && !/^\d+:\s*$/.test(e.message)) {
      return e.message;
    }
    if (typeof e.status === 'number') {
      const HTTP_REASONS: Record<number, string> = {
        400: 'Bad Request — check field values',
        401: 'Unauthorized',
        403: 'Forbidden — check permissions',
        404: 'Not Found — work item may have been deleted',
        409: 'Conflict',
        412: 'Precondition Failed',
        429: 'Too Many Requests',
        500: 'Internal Server Error',
        502: 'Bad Gateway',
        503: 'Service Unavailable',
      };
      return `HTTP ${e.status}: ${HTTP_REASONS[e.status] ?? 'Unknown error'}`;
    }
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

// ---------------------------------------------------------------------------
// Public API — executeImport
// ---------------------------------------------------------------------------

const CONCURRENCY = 5;

/**
 * Execute the import against the full ReqIF document.
 * Iterates ALL spec objects (not just the preview sample), creating or
 * updating Work Items as appropriate.
 *
 * @param doc            The parsed ReqIF document (full dataset)
 * @param profile        The active mapping profile
 * @param project        ADO project name
 * @param onProgress     Callback called after each processed item
 * @param fieldDefaults  Default values for required ADO fields not covered by mappings
 * @param adoTypes       ADO Work Item type definitions (used for field type sanitization)
 * @param previewWarnings Warnings collected during preview (carried into the report)
 */
export async function executeImport(
  doc: ReqIfDocument,
  profile: MappingProfile,
  project: string,
  onProgress: (status: ImportStatus) => void,
  fieldDefaults: Record<string, string> = {},
  adoTypes: AdoWorkItemType[] = [],
  previewWarnings: PreviewWarning[] = []
): Promise<ImportReport> {
  const createdItems: ImportedItem[] = [];
  const updatedItems: UpdatedItem[] = [];
  const skippedItems: SkippedItem[] = [];
  const failedItems: FailedItem[] = [];
  const allWarnings = [...previewWarnings];

  // Build a quick lookup: SpecType identifier → TypeMapping
  const typeMappingBySpecTypeId = new Map<string, TypeMapping>(
    profile.typeMappings.map((tm) => [tm.reqIfSpecTypeId, tm])
  );

  // Build ADO field lookup: WI type name → field type map
  const adoFieldTypeByWIType = new Map<string, Map<string, string>>(
    adoTypes.map((t) => [
      t.name,
      new Map(t.fields.map((f) => [f.referenceName, f.type])),
    ])
  );

  const totalItems = doc.specObjectOrder.length;
  let processedItems = 0;
  const allLogEntries: LogEntry[] = [];

  // ---- Deduplication: fetch identifier → work item ID map from ADO ----
  const existingIdMap: Map<string, number> = profile.reqIfIdentifierField
    ? await queryExistingIdentifiers(project, profile.reqIfIdentifierField)
    : new Map<string, number>();

  const emitProgress = (entry: LogEntry) => {
    allLogEntries.push(entry);
    onProgress({
      phase: 'running',
      totalItems,
      processedItems,
      createdItems: createdItems.length,
      updatedItems: updatedItems.length,
      skippedItems: skippedItems.length,
      failedItems: failedItems.length,
      logEntries: [...allLogEntries],
    });
  };

  // Process all spec objects in batches of CONCURRENCY
  for (let i = 0; i < doc.specObjectOrder.length; i += CONCURRENCY) {
    const batch = doc.specObjectOrder.slice(i, i + CONCURRENCY);

    await Promise.all(
      batch.map(async (objId) => {
        const obj = doc.specObjects.get(objId);
        if (!obj) {
          processedItems++;
          emitProgress({ timestamp: new Date().toISOString(), level: 'warning', message: `${processedItems}/${totalItems} \u26a0 Skipped \u2014 object not found in document`, specObjectId: objId });
          return;
        }

        const displayId = getReqIfForeignId(obj, doc) ?? obj.identifier;

        const typeMapping = typeMappingBySpecTypeId.get(obj.specTypeId);

        if (!typeMapping || !typeMapping.adoWorkItemType) {
          const skipReason = typeMapping
            ? `Excluded from import — type "${typeMapping.reqIfSpecTypeName}" is marked as not selected`
            : 'No type mapping configured for this requirement type';
          skippedItems.push({
            specObjectId: displayId,
            specObjectName: obj.longName,
            reason: skipReason,
          });
          processedItems++;
          emitProgress({ timestamp: new Date().toISOString(), level: 'warning', message: `${processedItems}/${totalItems} \u26a0 Skipped \u2014 ${skipReason}`, specObjectId: displayId });
          return;
        }

        // Build field values directly from spec object attribute values
        const fields: Record<string, string> = {};
        const witFieldTypes = adoFieldTypeByWIType.get(typeMapping.adoWorkItemType);

        for (const am of typeMapping.attributeMappings) {
          if (!am.enabled || !am.adoFieldRefName) continue;
          const attrValue = obj.attributeValues.get(am.reqIfAttributeId);
          if (!attrValue) continue;

          let rawStr: string;
          if (attrValue.type === 'ENUMERATION' && am.enumValueMappings?.length) {
            // Apply user-configured value mappings (e.g. "Medium" → "2")
            const mapped = attrValue.value
              .map((longName) => {
                const m = am.enumValueMappings!.find((ev) => ev.reqIfEnumValueName === longName);
                // Use mapped ADO value; fall back to original longName if not mapped or mapping is blank
                return m?.adoValue || longName;
              })
              .filter(Boolean);
            rawStr = mapped.join(', ');
          } else {
            rawStr = resolveValueToString(attrValue.value);
          }
          // Sanitize based on ADO field type
          const fieldType = witFieldTypes?.get(am.adoFieldRefName);
          if (fieldType === 'html') {
            fields[am.adoFieldRefName] = sanitizeForHtmlField(rawStr);
          } else if (fieldType === 'string' || fieldType === 'plainText' || fieldType === 'other') {
            fields[am.adoFieldRefName] = sanitizeForStringField(rawStr);
          } else {
            fields[am.adoFieldRefName] = rawStr;
          }
        }

        // Set identifier field
        if (profile.reqIfIdentifierField) {
          fields[profile.reqIfIdentifierField] = obj.identifier;
        }

        // Apply user-supplied defaults for required fields not covered by mappings.
        // System.IterationId / System.AreaId are integer fields in ADO — the REST PATCH
        // API requires setting the *Path* variant with the full path string instead.
        const FIELD_ALIASES: Record<string, string> = {
          'System.IterationId': 'System.IterationPath',
          'System.AreaId': 'System.AreaPath',
        };
        for (const [refName, defaultValue] of Object.entries(fieldDefaults)) {
          if (!defaultValue) continue;
          const targetRef = FIELD_ALIASES[refName] ?? refName;
          if (!fields[targetRef]) {
            fields[targetRef] = defaultValue;
          }
        }

        // Truncate System.Title to 255 chars (ADO hard limit, error TF401324)
        if (fields[TITLE_FIELD_REF] && fields[TITLE_FIELD_REF].length > TITLE_MAX_LENGTH) {
          fields[TITLE_FIELD_REF] = fields[TITLE_FIELD_REF].slice(0, TITLE_MAX_LENGTH - 1) + '\u2026';
        }

        const existingWorkItemId = existingIdMap.get(obj.identifier);

        try {
          let result: { id: number; url: string };
          let stateDropped = false;

          const tryOperation = async (f: Record<string, string>) => {
            if (existingWorkItemId != null) {
              return updateWorkItem(project, existingWorkItemId, f);
            } else {
              return createWorkItem(project, typeMapping.adoWorkItemType, f);
            }
          };

          try {
            result = await tryOperation(fields);
          } catch (firstErr) {
            // If the error is about a state field value not being in the allowed list,
            // retry without System.State so the item is imported in its default state.
            const errMsg = firstErr instanceof Error ? firstErr.message : String(firstErr);
            const isStateError =
              /not in the list of supported values/i.test(errMsg) &&
              'System.State' in fields;
            if (!isStateError) throw firstErr;
            const fieldsWithoutState = { ...fields };
            delete fieldsWithoutState['System.State'];
            result = await tryOperation(fieldsWithoutState);
            stateDropped = true;
            allWarnings.push({
              level: 'warning',
              message: `Work item for "${obj.longName}" (${obj.identifier}): State value "${fields['System.State']}" was rejected by ADO and omitted — item imported in default state.`,
              specObjectId: obj.identifier,
            });
          }

          const namePreview = obj.longName.length > 60 ? obj.longName.slice(0, 59) + '\u2026' : obj.longName;
          if (existingWorkItemId != null) {
            updatedItems.push({
              specObjectId: displayId,
              specObjectName: obj.longName,
              workItemId: result.id,
              workItemUrl: result.url,
              workItemType: typeMapping.adoWorkItemType,
            });
            processedItems++;
            emitProgress({
              timestamp: new Date().toISOString(),
              level: 'info',
              message: `${processedItems}/${totalItems} \u2191 Updated #${result.id}${stateDropped ? ' (default state)' : ''} \u2014 ${namePreview}`,
              specObjectId: displayId,
            });
          } else {
            createdItems.push({
              specObjectId: displayId,
              specObjectName: obj.longName,
              workItemId: result.id,
              workItemUrl: result.url,
              workItemType: typeMapping.adoWorkItemType,
            });
            processedItems++;
            emitProgress({
              timestamp: new Date().toISOString(),
              level: 'info',
              message: `${processedItems}/${totalItems} \u2713 Created #${result.id}${stateDropped ? ' (default state)' : ''} \u2014 ${namePreview}`,
              specObjectId: displayId,
            });
          }
        } catch (err) {
          const isUpdateAttempt = existingWorkItemId != null;
          const status = (err as { status?: number }).status;
          const errMsg = isUpdateAttempt && status === 404
            ? `ADO work item #${existingWorkItemId} was found during the initial lookup but no longer exists (deleted from ADO). To fix: re-import or remove this requirement.`
            : extractAdoErrorMessage(err);
          failedItems.push({
            specObjectId: displayId,
            specObjectName: obj.longName,
            errorMessage: errMsg,
          });
          processedItems++;
          emitProgress({
            timestamp: new Date().toISOString(),
            level: 'error',
            message: `${processedItems}/${totalItems} \u2717 Failed \u2014 ${errMsg}`,
            specObjectId: displayId,
          });
        }
      })
    );
  }

  const report: ImportReport = {
    completedAt: new Date().toISOString(),
    totalCreated: createdItems.length,
    totalUpdated: updatedItems.length,
    totalSkipped: skippedItems.length,
    totalFailed: failedItems.length,
    createdItems,
    updatedItems,
    skippedItems,
    failedItems,
    allWarnings,
  };

  return report;
}
