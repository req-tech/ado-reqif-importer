import type { ReqIfDocument } from '../parser/reqif-types';
import type { MappingProfile, TypeMapping } from '../models/mapping';
import type { AdoWorkItemType } from '../models/ado-metadata';
import type { ImportPreview, PreviewItem, ImportOperation } from '../models/preview';
import type { PreviewWarning, ImportStatus, ImportReport, ImportedItem, SkippedItem, FailedItem } from '../models/report';
import { createWorkItem } from './work-item-service';

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

    const operation: ImportOperation = typeMapping ? 'create' : 'skip';

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

// ---------------------------------------------------------------------------
// Public API — executeImport
// ---------------------------------------------------------------------------

const CONCURRENCY = 5;

/**
 * Execute the import, creating Work Items for all "create" preview items.
 * Processes items in batches of CONCURRENCY, emitting progress after each item.
 * Items that fail after retries are marked as failed; execution continues.
 */
export async function executeImport(
  preview: ImportPreview,
  profile: MappingProfile,
  project: string,
  onProgress: (status: ImportStatus) => void
): Promise<ImportReport> {
  const createdItems: ImportedItem[] = [];
  const skippedItems: SkippedItem[] = [];
  const failedItems: FailedItem[] = [];
  const allWarnings = [...preview.warnings];

  let processedItems = 0;
  const totalItems = preview.items.length;

  const emitProgress = () => {
    onProgress({
      phase: 'running',
      totalItems,
      processedItems,
      createdItems: createdItems.length,
      skippedItems: skippedItems.length,
      failedItems: failedItems.length,
      logEntries: [],
    });
  };

  // Process in batches of CONCURRENCY
  for (let i = 0; i < preview.items.length; i += CONCURRENCY) {
    const batch = preview.items.slice(i, i + CONCURRENCY);

    await Promise.all(
      batch.map(async (item) => {
        if (item.operation === 'skip') {
          skippedItems.push({
            specObjectId: item.specObjectId,
            specObjectName: item.specObjectName,
            reason: 'No TypeMapping found',
          });
          processedItems++;
          emitProgress();
          return;
        }

        // Build field map from preview fieldPreview (String-keyed by display name)
        // For actual field values we look up attribute mappings from profile
        const typeMapping = profile.typeMappings.find(
          (tm) => tm.adoWorkItemType === item.targetWorkItemType
        );

        const fields: Record<string, string> = {};

        if (typeMapping) {
          for (const am of typeMapping.attributeMappings) {
            if (am.enabled && am.adoFieldRefName) {
              // Use preview value if available, else empty string
              const displayValue = item.fieldPreview[am.adoFieldName] ?? '';
              fields[am.adoFieldRefName] = displayValue;
            }
          }
        }

        // Ensure identifier field is set
        if (profile.reqIfIdentifierField) {
          fields[profile.reqIfIdentifierField] = item.specObjectId;
        }

        try {
          const result = await createWorkItem(project, item.targetWorkItemType, fields);
          createdItems.push({
            specObjectId: item.specObjectId,
            specObjectName: item.specObjectName,
            workItemId: result.id,
            workItemUrl: result.url,
            workItemType: item.targetWorkItemType,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          failedItems.push({
            specObjectId: item.specObjectId,
            specObjectName: item.specObjectName,
            errorMessage: message,
          });
        }

        processedItems++;
        emitProgress();
      })
    );
  }

  const report: ImportReport = {
    completedAt: new Date().toISOString(),
    totalCreated: createdItems.length,
    totalSkipped: skippedItems.length,
    totalFailed: failedItems.length,
    createdItems,
    skippedItems,
    failedItems,
    allWarnings,
  };

  return report;
}
