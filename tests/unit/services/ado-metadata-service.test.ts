/**
 * T027 — ado-metadata-service tests (must fail before T028 implementation)
 */

import { getAdoWorkItemTypes, clearCache } from '../../../src/services/ado-metadata-service';
import type { AdoWorkItemType } from '../../../src/models/ado-metadata';

// ---------------------------------------------------------------------------
// Mock azure-devops-extension-api
// ---------------------------------------------------------------------------

const mockWitClient = {
  getWorkItemTypes: jest.fn(),
  getWorkItemTypeFieldsWithReferences: jest.fn(),
};

jest.mock('azure-devops-extension-api', () => ({
  getClient: jest.fn(() => mockWitClient),
}));

jest.mock('azure-devops-extension-sdk', () => ({
  getService: jest.fn(async () => ({
    getAccessToken: jest.fn(async () => 'token'),
  })),
  CommonServiceIds: {},
}));

// ADO REST API response shapes
const mockAdoWitTypes = [
  { name: 'Requirement', referenceName: 'Custom.Requirement' },
  { name: 'User Story', referenceName: 'Microsoft.VSTS.WorkItemTypes.UserStory' },
];

const mockAdoFields = [
  { name: 'Title', referenceName: 'System.Title', type: 'string', alwaysRequired: true },
  { name: 'Description', referenceName: 'System.Description', type: 'html', alwaysRequired: false },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ado-metadata-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearCache();
    mockWitClient.getWorkItemTypes.mockResolvedValue(mockAdoWitTypes);
    mockWitClient.getWorkItemTypeFieldsWithReferences.mockResolvedValue(mockAdoFields);
  });

  it('returns mapped AdoWorkItemType array', async () => {
    const types = await getAdoWorkItemTypes('my-project');

    expect(types).toHaveLength(2);
    const req = types.find((t: AdoWorkItemType) => t.name === 'Requirement');
    expect(req).toBeDefined();
    expect(req?.referenceName).toBe('Custom.Requirement');
    expect(req?.fields).toHaveLength(2);
    expect(req?.fields[0]).toMatchObject({
      name: 'Title',
      referenceName: 'System.Title',
      type: 'string',
      isRequired: true,
    });
  });

  it('caches results after first fetch', async () => {
    await getAdoWorkItemTypes('my-project');
    await getAdoWorkItemTypes('my-project');

    // getWorkItemTypes should only be called once despite two calls
    expect(mockWitClient.getWorkItemTypes).toHaveBeenCalledTimes(1);
  });

  it('handles empty field list gracefully', async () => {
    mockWitClient.getWorkItemTypeFieldsWithReferences.mockResolvedValue([]);
    const types = await getAdoWorkItemTypes('my-project');

    expect(types[0].fields).toEqual([]);
  });
});
