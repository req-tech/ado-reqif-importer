/**
 * T038 — work-item-service tests (must fail before T039 implementation)
 */

import { createWorkItem } from '../../../src/services/work-item-service';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockCreateWorkItem = jest.fn();

jest.mock('azure-devops-extension-api', () => ({
  getClient: jest.fn(() => ({
    createWorkItem: mockCreateWorkItem,
  })),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const project = 'my-project';
const witType = 'Requirement';
const fields: Record<string, string> = {
  'System.Title': 'My Requirement',
  'Custom.ReqIFIdentifier': 'REQ-001',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('work-item-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('successful create returns WorkItem with id', async () => {
    mockCreateWorkItem.mockResolvedValueOnce({ id: 42, url: 'https://dev.azure.com/...' });

    const result = await createWorkItem(project, witType, fields);
    expect(result).toMatchObject({ id: 42 });
    expect(mockCreateWorkItem).toHaveBeenCalledTimes(1);
  });

  it('retries on HTTP 429 (Too Many Requests)', async () => {
    const rateLimitError = Object.assign(new Error('Too many requests'), { status: 429 });
    mockCreateWorkItem
      .mockRejectedValueOnce(rateLimitError)
      .mockResolvedValueOnce({ id: 100, url: '' });

    const result = await createWorkItem(project, witType, fields);
    expect(result).toMatchObject({ id: 100 });
    expect(mockCreateWorkItem).toHaveBeenCalledTimes(2);
  });

  it('retries on HTTP 503 (Service Unavailable)', async () => {
    const serverError = Object.assign(new Error('Service unavailable'), { status: 503 });
    mockCreateWorkItem
      .mockRejectedValueOnce(serverError)
      .mockResolvedValueOnce({ id: 200, url: '' });

    const result = await createWorkItem(project, witType, fields);
    expect(result).toMatchObject({ id: 200 });
    expect(mockCreateWorkItem).toHaveBeenCalledTimes(2);
  });

  it('throws after 3 consecutive failures', async () => {
    const error = Object.assign(new Error('Server Error'), { status: 503 });
    mockCreateWorkItem.mockRejectedValue(error);

    await expect(createWorkItem(project, witType, fields)).rejects.toThrow('Server Error');
    expect(mockCreateWorkItem).toHaveBeenCalledTimes(3);
  });

  it('does not retry on HTTP 400 (Bad Request)', async () => {
    const badRequest = Object.assign(new Error('Bad Request'), { status: 400 });
    mockCreateWorkItem.mockRejectedValueOnce(badRequest);

    await expect(createWorkItem(project, witType, fields)).rejects.toThrow('Bad Request');
    expect(mockCreateWorkItem).toHaveBeenCalledTimes(1);
  });
});
