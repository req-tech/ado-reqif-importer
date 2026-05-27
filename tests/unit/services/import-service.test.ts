/**
 * T033 — computePreview tests (must fail before T034 implementation)
 */

import { computePreview, executeImport } from '../../../src/services/import-service';
import type { ReqIfDocument, SpecType, SpecObject } from '../../../src/parser/reqif-types';
import type { MappingProfile } from '../../../src/models/mapping';
import type { AdoWorkItemType } from '../../../src/models/ado-metadata';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeSpecType(id: string, name: string, attrIds: string[] = []): SpecType {
  return {
    identifier: id,
    longName: name,
    attributeDefinitions: new Map(
      attrIds.map((a) => [a, { identifier: a, longName: a, type: 'STRING' as const }])
    ),
  };
}

function makeSpecObject(id: string, typeId: string, name = `Obj ${id}`): SpecObject {
  return {
    identifier: id,
    specTypeId: typeId,
    longName: name,
    lastChange: '2024-01-01T00:00:00Z',
    attributeValues: new Map([
      ['ATTR-TITLE', { type: 'STRING', value: name }],
    ]),
  };
}

const specTypeId = 'ST-001';
const specTypeIdUnmapped = 'ST-002';

const specObjects = new Map<string, SpecObject>();
for (let i = 1; i <= 10; i++) {
  specObjects.set(`OBJ-${i}`, makeSpecObject(`OBJ-${i}`, specTypeId));
}
// Add two from an unmapped type
specObjects.set('OBJ-11', makeSpecObject('OBJ-11', specTypeIdUnmapped));
specObjects.set('OBJ-12', makeSpecObject('OBJ-12', specTypeIdUnmapped));

const specObjectOrder = Array.from(specObjects.keys());

const doc: ReqIfDocument = {
  header: { identifier: 'h1', title: 'Test', creationTime: '', reqIfVersion: '1.0' },
  specTypes: new Map([
    [specTypeId, makeSpecType(specTypeId, 'SoftwareReq', ['ATTR-TITLE'])],
    [specTypeIdUnmapped, makeSpecType(specTypeIdUnmapped, 'HardwareReq', ['ATTR-TITLE'])],
  ]),
  specObjects,
  specObjectCount: specObjects.size,
  specObjectOrder,
  parseWarnings: [],
};

const adoTypes: AdoWorkItemType[] = [
  {
    name: 'Requirement',
    referenceName: 'Custom.Requirement',
    fields: [
      { name: 'Title', referenceName: 'System.Title', type: 'string', isRequired: true },
      { name: 'ID Field', referenceName: 'Custom.ReqIFIdentifier', type: 'string', isRequired: false },
    ],
  },
];

const profile: MappingProfile = {
  id: 'p1',
  displayName: 'Test Profile',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  reqIfIdentifierField: 'Custom.ReqIFIdentifier',
  typeMappings: [
    {
      reqIfSpecTypeId: specTypeId,
      reqIfSpecTypeName: 'SoftwareReq',
      adoWorkItemType: 'Requirement',
      attributeMappings: [
        {
          reqIfAttributeId: 'ATTR-TITLE',
          reqIfAttributeName: 'Title',
          adoFieldRefName: 'System.Title',
          adoFieldName: 'Title',
          enabled: true,
        },
      ],
    },
    // No mapping for ST-002 intentionally
  ],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('computePreview', () => {
  it('returns create for all items with a valid TypeMapping', () => {
    const preview = computePreview(doc, profile, adoTypes, 10);
    const created = preview.items.filter((i) => i.operation === 'create');
    expect(created).toHaveLength(10);
  });

  it('returns skip for items whose SpecType has no TypeMapping', () => {
    const preview = computePreview(doc, profile, adoTypes, 12); // sampleSize large enough to include all
    const skipped = preview.items.filter((i) => i.operation === 'skip');
    expect(skipped).toHaveLength(2);
  });

  it('totalCount equals total SpecObject count', () => {
    const preview = computePreview(doc, profile, adoTypes, 5);
    expect(preview.totalCount).toBe(12);
  });

  it('sampleSize is respected (only first N items in items[])', () => {
    const preview = computePreview(doc, profile, adoTypes, 5);
    expect(preview.items).toHaveLength(5);
  });

  it('sets canExecute to true when identifier field exists in ADO metadata', () => {
    const preview = computePreview(doc, profile, adoTypes, 10);
    expect(preview.canExecute).toBe(true);
  });

  it('sets canExecute to false when identifier field is missing from ADO', () => {
    const noIdTypes: AdoWorkItemType[] = [
      {
        name: 'Requirement',
        referenceName: 'Custom.Requirement',
        fields: [
          { name: 'Title', referenceName: 'System.Title', type: 'string', isRequired: true },
          // No Custom.ReqIFIdentifier
        ],
      },
    ];
    const preview = computePreview(doc, profile, noIdTypes, 10);
    expect(preview.canExecute).toBe(false);
    expect(preview.warnings.some((w) => w.level === 'error')).toBe(true);
  });

  it('adds a warning when a required ADO field has no attribute mapping', () => {
    const profileMissingTitle: MappingProfile = {
      ...profile,
      typeMappings: [
        {
          ...profile.typeMappings[0],
          attributeMappings: [], // no mappings at all
        },
      ],
    };
    const preview = computePreview(doc, profileMissingTitle, adoTypes, 10);
    expect(preview.warnings.some((w) => w.message.toLowerCase().includes('title'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T040 — executeImport tests
// ---------------------------------------------------------------------------

const mockCreateWorkItem = jest.fn();
const mockUpdateWorkItem = jest.fn();
const mockQueryExistingIdentifiers = jest.fn();

jest.mock('../../../src/services/work-item-service', () => ({
  createWorkItem: (...args: unknown[]) => mockCreateWorkItem(...args),
  updateWorkItem: (...args: unknown[]) => mockUpdateWorkItem(...args),
  queryExistingIdentifiers: (...args: unknown[]) => mockQueryExistingIdentifiers(...args),
}));

/** A small ReqIfDocument with `count` spec objects, all of known type. */
function makeDoc(count = 5, typeId = specTypeId): ReqIfDocument {
  const objs = new Map<string, SpecObject>();
  const order: string[] = [];
  for (let i = 1; i <= count; i++) {
    const id = `DOC-OBJ-${i}`;
    objs.set(id, makeSpecObject(id, typeId));
    order.push(id);
  }
  return {
    header: { identifier: 'h-exec', title: 'Exec Test', creationTime: '', reqIfVersion: '1.0' },
    specTypes: new Map([[typeId, makeSpecType(typeId, 'SoftwareReq', ['ATTR-TITLE'])]]),
    specObjects: objs,
    specObjectCount: count,
    specObjectOrder: order,
    parseWarnings: [],
  };
}

describe('executeImport', () => {
  beforeEach(() => {
    mockCreateWorkItem.mockReset();
    mockUpdateWorkItem.mockReset();
    mockQueryExistingIdentifiers.mockReset();
    mockCreateWorkItem.mockResolvedValue({ id: 1, url: 'https://dev.azure.com/...' });
    mockUpdateWorkItem.mockResolvedValue({ id: 1, url: 'https://dev.azure.com/...' });
    mockQueryExistingIdentifiers.mockResolvedValue(new Map<string, number>());
  });

  it('creates work items for all spec objects with a matching type mapping', async () => {
    const d = makeDoc(5);
    const report = await executeImport(d, profile, 'my-project', jest.fn());
    expect(mockCreateWorkItem).toHaveBeenCalledTimes(5);
    expect(report.createdItems).toHaveLength(5);
    expect(report.totalCreated).toBe(5);
  });

  it('calls onProgress after each item', async () => {
    const onProgress = jest.fn();
    const d = makeDoc(5);
    await executeImport(d, profile, 'my-project', onProgress);
    expect(onProgress).toHaveBeenCalledTimes(5);
  });

  it('marks failed items and continues remaining items', async () => {
    const error = new Error('Server Error');
    mockCreateWorkItem
      .mockRejectedValueOnce(error)
      .mockResolvedValue({ id: 2, url: '' });

    const d = makeDoc(5);
    const report = await executeImport(d, profile, 'my-project', jest.fn());
    expect(report.failedItems).toHaveLength(1);
    expect(report.createdItems).toHaveLength(4);
  });

  it('skips items with no type mapping and records the reason', async () => {
    const d = makeDoc(3, specTypeIdUnmapped); // ST-002 has no mapping in profile
    const report = await executeImport(d, profile, 'my-project', jest.fn());
    expect(mockCreateWorkItem).not.toHaveBeenCalled();
    expect(report.skippedItems).toHaveLength(3);
    expect(report.skippedItems[0].reason).toMatch(/no type mapping/i);
  });

  it('updates existing work items instead of creating them', async () => {
    const d = makeDoc(3);
    // Two items already exist in ADO
    mockQueryExistingIdentifiers.mockResolvedValue(
      new Map([['DOC-OBJ-1', 101], ['DOC-OBJ-2', 102]])
    );

    const report = await executeImport(d, profile, 'my-project', jest.fn());
    expect(mockUpdateWorkItem).toHaveBeenCalledTimes(2);
    expect(mockCreateWorkItem).toHaveBeenCalledTimes(1);
    expect(report.totalUpdated).toBe(2);
    expect(report.totalCreated).toBe(1);
  });

  it('report totals match created + updated + skipped + failed', async () => {
    const d = makeDoc(5);
    const report = await executeImport(d, profile, 'my-project', jest.fn());
    expect(
      report.totalCreated + report.totalUpdated + report.totalSkipped + report.totalFailed
    ).toBe(5);
  });
});
