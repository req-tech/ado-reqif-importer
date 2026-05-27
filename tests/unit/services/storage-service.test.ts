/**
 * storage-service tests — file-based export / import
 */

import { exportProfile, importProfileFromFile } from '../../../src/services/storage-service';
import type { MappingProfile } from '../../../src/models/mapping';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const profile: MappingProfile = {
  id: 'profile-1',
  displayName: 'My Profile',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  reqIfIdentifierField: 'Custom.ReqIFId',
  typeMappings: [
    {
      reqIfSpecTypeId: 'type-1',
      reqIfSpecTypeName: 'System Requirement',
      adoWorkItemType: 'System Requirement',
      attributeMappings: [],
    },
  ],
};

// ---------------------------------------------------------------------------
// DOM mocks needed by exportProfile
// ---------------------------------------------------------------------------

beforeEach(() => {
  const anchor = {
    href: '',
    download: '',
    click: jest.fn(),
  } as unknown as HTMLAnchorElement;

  jest.spyOn(document, 'createElement').mockReturnValue(anchor);
  jest.spyOn(document.body, 'appendChild').mockImplementation(() => anchor);
  jest.spyOn(document.body, 'removeChild').mockImplementation(() => anchor);

  (URL as unknown as { createObjectURL: jest.Mock }).createObjectURL = jest.fn(() => 'blob:mock');
  (URL as unknown as { revokeObjectURL: jest.Mock }).revokeObjectURL = jest.fn();
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// exportProfile
// ---------------------------------------------------------------------------

describe('exportProfile', () => {
  it('creates a blob URL and triggers a download click', () => {
    exportProfile(profile);

    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    const anchor = document.createElement('a') as unknown as { click: jest.Mock; download: string };
    expect(anchor.click).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock');
  });

  it('uses a safe filename derived from displayName', () => {
    exportProfile({ ...profile, displayName: 'My Profile (v2)' });

    const anchor = document.createElement('a') as unknown as { download: string };
    expect(anchor.download).toMatch(/My_Profile__v2_\.json/);
  });

  it('serialises all typeMappings into the downloaded JSON', () => {
    let capturedBlob: Blob | undefined;
    (URL.createObjectURL as jest.Mock).mockImplementation((b: Blob) => {
      capturedBlob = b;
      return 'blob:mock';
    });

    exportProfile(profile);

    expect(capturedBlob).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// importProfileFromFile
// ---------------------------------------------------------------------------

function makeFile(content: string, name = 'config.json'): File {
  const file = new File([content], name, { type: 'application/json' });
  // jsdom's File doesn't implement .text() — polyfill it for tests
  Object.defineProperty(file, 'text', {
    value: () => Promise.resolve(content),
  });
  return file;
}

describe('importProfileFromFile', () => {
  it('parses a valid mapping config file', async () => {
    const file = makeFile(JSON.stringify(profile));
    const result = await importProfileFromFile(file);
    expect(result.typeMappings).toHaveLength(1);
    expect(result.displayName).toBe('My Profile');
  });

  it('throws when the file is not valid JSON', async () => {
    const file = makeFile('not json');
    await expect(importProfileFromFile(file)).rejects.toThrow('File is not valid JSON.');
  });

  it('throws when typeMappings is missing', async () => {
    const file = makeFile(JSON.stringify({ id: 'x', displayName: 'x' }));
    await expect(importProfileFromFile(file)).rejects.toThrow('missing typeMappings array');
  });

  it('throws when typeMappings is not an array', async () => {
    const file = makeFile(JSON.stringify({ ...profile, typeMappings: 'bad' }));
    await expect(importProfileFromFile(file)).rejects.toThrow('missing typeMappings array');
  });
});

