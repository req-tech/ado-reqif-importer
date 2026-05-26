/**
 * T046 — Integration test: full import flow from fixture to computePreview
 * Uses real parser + real computePreview (no mocks for core logic).
 */
import * as fs from 'fs';
import * as path from 'path';

// Mock work-item-service to avoid ADO SDK dependency in integration tests
jest.mock('../../src/services/work-item-service', () => ({
  createWorkItem: jest.fn().mockResolvedValue({ id: 1, url: '' }),
}));

import { parseReqIfFile } from '../../src/parser/reqif-parser';
import { computePreview } from '../../src/services/import-service';
import type { MappingProfile } from '../../src/models/mapping';
import type { AdoWorkItemType } from '../../src/models/ado-metadata';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SAMPLE_REQIF = path.resolve(__dirname, '../fixtures/sample.reqif');
const SAMPLE_REQIFZ = path.resolve(__dirname, '../fixtures/sample.reqifz');

const sampleXml = fs.readFileSync(SAMPLE_REQIF);

const adoTypes: AdoWorkItemType[] = [
  {
    name: 'Requirement',
    referenceName: 'Microsoft.VSTS.WorkItemTypes.Requirement',
    fields: [
      { name: 'Title', referenceName: 'System.Title', type: 'string' as const, isRequired: true },
      { name: 'Description', referenceName: 'System.Description', type: 'html' as const, isRequired: false },
      { name: 'ReqIF ID', referenceName: 'Custom.ReqIFIdentifier', type: 'string' as const, isRequired: false },
    ],
  },
];

const profile: MappingProfile = {
  id: 'integration-profile',
  displayName: 'Integration Test Profile',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  reqIfIdentifierField: 'Custom.ReqIFIdentifier',
  typeMappings: [
    {
      reqIfSpecTypeId: 'sot-requirement',
      reqIfSpecTypeName: 'Requirement',
      adoWorkItemType: 'Requirement',
      attributeMappings: [
        {
          reqIfAttributeId: 'attr-title',
          reqIfAttributeName: 'Title',
          adoFieldName: 'Title',
          adoFieldRefName: 'System.Title',
          enabled: true,
        },
        {
          reqIfAttributeId: 'attr-desc',
          reqIfAttributeName: 'Description',
          adoFieldName: 'Description',
          adoFieldRefName: 'System.Description',
          enabled: true,
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Integration: ReqIF import flow', () => {
  it('parses sample.reqif and produces correct spec types and objects', async () => {
    const buffer = sampleXml.buffer.slice(sampleXml.byteOffset, sampleXml.byteOffset + sampleXml.byteLength) as ArrayBuffer;
    const doc = await parseReqIfFile(buffer, 'sample.reqif');
    expect(doc.specTypes.size).toBe(1);
    expect(doc.specTypes.get('sot-requirement')?.longName).toBe('Requirement');
    expect(doc.specObjects.size).toBe(2);
    expect(doc.specObjects.get('obj-001')?.identifier).toBe('obj-001');
    expect(doc.specObjects.get('obj-002')?.identifier).toBe('obj-002');
  });

  it('parses sample.reqifz (ZIP) and produces same result as .reqif', async () => {
    const zipBytes = fs.readFileSync(SAMPLE_REQIFZ);
    const buffer = zipBytes.buffer.slice(zipBytes.byteOffset, zipBytes.byteOffset + zipBytes.byteLength) as ArrayBuffer;
    const doc = await parseReqIfFile(buffer, 'sample.reqifz');
    expect(doc.specTypes.size).toBe(1);
    expect(doc.specObjects.size).toBe(2);
  });

  it('computePreview on parsed document produces "create" for both objects', async () => {
    const buffer = sampleXml.buffer.slice(sampleXml.byteOffset, sampleXml.byteOffset + sampleXml.byteLength) as ArrayBuffer;
    const doc = await parseReqIfFile(buffer, 'sample.reqif');
    const preview = computePreview(doc, profile, adoTypes, 10);
    expect(preview.totalCount).toBe(2);
    expect(preview.items).toHaveLength(2);
    preview.items.forEach((item) => {
      expect(item.operation).toBe('create');
      expect(item.targetWorkItemType).toBe('Requirement');
    });
  });

  it('computePreview respects sampleSize', async () => {
    const buffer = sampleXml.buffer.slice(sampleXml.byteOffset, sampleXml.byteOffset + sampleXml.byteLength) as ArrayBuffer;
    const doc = await parseReqIfFile(buffer, 'sample.reqif');
    const preview = computePreview(doc, profile, adoTypes, 1);
    expect(preview.items).toHaveLength(1);
    expect(preview.totalCount).toBe(2);
  });

  it('canExecute is true when identifier field is present', async () => {
    const buffer = sampleXml.buffer.slice(sampleXml.byteOffset, sampleXml.byteOffset + sampleXml.byteLength) as ArrayBuffer;
    const doc = await parseReqIfFile(buffer, 'sample.reqif');
    const preview = computePreview(doc, profile, adoTypes, 10);
    expect(preview.canExecute).toBe(true);
  });
});
