/**
 * T025 — storage-service tests (must fail before T026 implementation)
 */

import {
  listProfiles,
  loadProfile,
  saveProfile,
  deleteProfile,
} from '../../../src/services/storage-service';
import type { MappingProfile } from '../../../src/models/mapping';

// ---------------------------------------------------------------------------
// Mock IExtensionDataService
// ---------------------------------------------------------------------------

const mockDocuments: Map<string, unknown> = new Map();

const mockDataService = {
  getDocuments: jest.fn(async (_collection: string) => {
    return Array.from(mockDocuments.values());
  }),
  getDocument: jest.fn(async (_collection: string, id: string) => {
    const doc = mockDocuments.get(id);
    if (!doc) throw Object.assign(new Error('Not found'), { status: 404 });
    return doc;
  }),
  setDocument: jest.fn(async (_collection: string, doc: Record<string, unknown>) => {
    mockDocuments.set(doc.id as string, doc);
    return doc;
  }),
  deleteDocument: jest.fn(async (_collection: string, id: string) => {
    mockDocuments.delete(id);
  }),
};

jest.mock('azure-devops-extension-sdk', () => ({
  getService: jest.fn(async () => mockDataService),
  CommonServiceIds: { ExtensionDataService: 'ExtensionDataService' },
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const profile1: MappingProfile = {
  id: 'profile-1',
  displayName: 'My Profile',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  reqIfIdentifierField: 'Custom.ReqIFId',
  typeMappings: [],
};

const profile2: MappingProfile = {
  ...profile1,
  id: 'profile-2',
  displayName: 'Another Profile',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('storage-service', () => {
  beforeEach(() => {
    mockDocuments.clear();
    jest.clearAllMocks();
    // Re-attach mocks after clearAllMocks
    mockDataService.getDocuments.mockImplementation(async () =>
      Array.from(mockDocuments.values())
    );
    mockDataService.getDocument.mockImplementation(async (_c: string, id: string) => {
      const doc = mockDocuments.get(id);
      if (!doc) throw Object.assign(new Error('Not found'), { status: 404 });
      return doc;
    });
    mockDataService.setDocument.mockImplementation(async (_c: string, doc: Record<string, unknown>) => {
      mockDocuments.set(doc.id as string, doc);
      return doc;
    });
    mockDataService.deleteDocument.mockImplementation(async (_c: string, id: string) => {
      mockDocuments.delete(id);
    });
  });

  describe('listProfiles', () => {
    it('returns an empty array when no profiles exist', async () => {
      const profiles = await listProfiles();
      expect(profiles).toEqual([]);
    });

    it('returns all saved profiles', async () => {
      mockDocuments.set(profile1.id, profile1);
      mockDocuments.set(profile2.id, profile2);

      const profiles = await listProfiles();
      expect(profiles).toHaveLength(2);
    });
  });

  describe('loadProfile', () => {
    it('returns null when profile does not exist', async () => {
      const profile = await loadProfile('nonexistent');
      expect(profile).toBeNull();
    });

    it('returns the profile when it exists', async () => {
      mockDocuments.set(profile1.id, profile1);

      const profile = await loadProfile(profile1.id);
      expect(profile).toMatchObject({ id: 'profile-1', displayName: 'My Profile' });
    });
  });

  describe('saveProfile', () => {
    it('saves a new profile', async () => {
      await saveProfile(profile1);
      expect(mockDataService.setDocument).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ id: 'profile-1' })
      );
    });

    it('upserts an existing profile', async () => {
      mockDocuments.set(profile1.id, profile1);
      const updated = { ...profile1, displayName: 'Updated' };

      await saveProfile(updated);
      const saved = mockDocuments.get(profile1.id) as MappingProfile;
      expect(saved.displayName).toBe('Updated');
    });
  });

  describe('deleteProfile', () => {
    it('removes a profile by id', async () => {
      mockDocuments.set(profile1.id, profile1);

      await deleteProfile(profile1.id);
      expect(mockDocuments.has(profile1.id)).toBe(false);
    });
  });
});
