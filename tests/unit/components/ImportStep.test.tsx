/**
 * T042 — ImportStep tests (must fail before T043 implementation)
 */
/// <reference types="@testing-library/jest-dom" />

import { render, fireEvent, waitFor } from '@testing-library/react';
import ImportStep from '../../../src/components/ImportStep/ImportStep';
import * as WizardContext from '../../../src/context/wizard-context';
import type { WizardState } from '../../../src/context/wizard-context';
import type { ImportPreview } from '../../../src/models/preview';
import type { ImportReport } from '../../../src/models/report';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockExecuteImport = jest.fn();

jest.mock('../../../src/services/import-service', () => ({
  executeImport: (...args: unknown[]) => mockExecuteImport(...args),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makePreview(): ImportPreview {
  return {
    items: Array.from({ length: 5 }, (_, i) => ({
      specObjectId: `OBJ-${i + 1}`,
      specObjectName: `Object ${i + 1}`,
      operation: 'create' as const,
      targetWorkItemType: 'Requirement',
      fieldPreview: {},
      warnings: [],
    })),
    totalCount: 5,
    sampleSize: 5,
    warnings: [],
    canExecute: true,
  };
}

const mockReport: ImportReport = {
  completedAt: '2024-01-01T00:00:00Z',
  totalCreated: 5,
  totalSkipped: 0,
  totalFailed: 0,
  createdItems: Array.from({ length: 5 }, (_, i) => ({
    specObjectId: `OBJ-${i + 1}`,
    specObjectName: `Object ${i + 1}`,
    workItemId: i + 100,
    workItemUrl: `https://dev.azure.com/work/${i + 100}`,
    workItemType: 'Requirement',
  })),
  skippedItems: [],
  failedItems: [],
  allWarnings: [],
};

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function renderWithContext(statePatch?: Partial<WizardState>) {
  const dispatch = jest.fn();
  const state: WizardState = {
    currentStep: 'import',
    parsedDocument: null,
    mappingProfile: {
      id: 'p1',
      displayName: 'Test',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      reqIfIdentifierField: 'Custom.ReqIFIdentifier',
      typeMappings: [],
    },
    savedProfiles: [],
    adoWorkItemTypes: [],
    importPreview: makePreview(),
    importStatus: null,
    importReport: null,
    globalError: null,
    ...statePatch,
  };

  jest.spyOn(WizardContext, 'useWizard').mockReturnValue({ state, dispatch });
  return { result: render(<ImportStep />), dispatch };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ImportStep', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExecuteImport.mockImplementation(
      async (_preview: unknown, _profile: unknown, _project: unknown, onProgress: (s: unknown) => void) => {
        onProgress({ phase: 'running', totalItems: 5, processedItems: 1, createdItems: 1, skippedItems: 0, failedItems: 0, logEntries: [] });
        return mockReport;
      }
    );
  });

  it('renders Execute button', () => {
    const { result } = renderWithContext();
    expect(result.getByRole('button', { name: /execute/i })).toBeTruthy();
  });

  it('triggers executeImport when Execute button is clicked', async () => {
    const { result } = renderWithContext();
    fireEvent.click(result.getByRole('button', { name: /execute/i }));
    await waitFor(() => {
      expect(mockExecuteImport).toHaveBeenCalledTimes(1);
    });
  });

  it('shows status log during import', async () => {
    const { result } = renderWithContext();
    fireEvent.click(result.getByRole('button', { name: /execute/i }));
    await waitFor(() => {
      expect(result.getByRole('log')).toBeTruthy();
    });
  });

  it('shows final report with created count after completion', async () => {
    const { result } = renderWithContext();
    fireEvent.click(result.getByRole('button', { name: /execute/i }));
    await waitFor(() => {
      expect(result.getByText(/Created: 5/)).toBeTruthy();
    });
  });

  it('shows failed items with error text in report', async () => {
    const failedReport = {
      ...mockReport,
      totalFailed: 1,
      failedItems: [
        {
          specObjectId: 'OBJ-1',
          specObjectName: 'Object 1',
          errorMessage: 'Connection refused',
        },
      ],
    };
    mockExecuteImport.mockImplementation(
      async (_p: unknown, _pr: unknown, _proj: unknown, onProgress: (s: unknown) => void) => {
        onProgress({ phase: 'running', totalItems: 5, processedItems: 1, createdItems: 0, skippedItems: 0, failedItems: 1, logEntries: [] });
        return failedReport;
      }
    );
    const { result } = renderWithContext();
    fireEvent.click(result.getByRole('button', { name: /execute/i }));
    await waitFor(() => {
      expect(result.getByText(/Connection refused/)).toBeTruthy();
    });
  });
});
