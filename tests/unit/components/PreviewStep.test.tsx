/**
 * T035 — PreviewStep tests (must fail before T036 implementation)
 */
/// <reference types="@testing-library/jest-dom" />

import { render, fireEvent, waitFor } from '@testing-library/react';
import PreviewStep from '../../../src/components/PreviewStep/PreviewStep';
import * as WizardContext from '../../../src/context/wizard-context';
import type { WizardState } from '../../../src/context/wizard-context';
import type { ImportPreview } from '../../../src/models/preview';

// ---------------------------------------------------------------------------
// Mock computePreview
// ---------------------------------------------------------------------------

jest.mock('../../../src/services/import-service', () => ({
  computePreview: jest.fn(() => mockPreview),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makePreviewItem(id: string, op: 'create' | 'skip') {
  return {
    specObjectId: id,
    specObjectName: `Object ${id}`,
    operation: op,
    targetWorkItemType: op === 'create' ? 'Requirement' : '',
    fieldPreview: { Title: `Title ${id}` },
    warnings: [],
  };
}

const mockPreview: ImportPreview = {
  items: Array.from({ length: 10 }, (_, i) => makePreviewItem(`OBJ-${i + 1}`, 'create')),
  totalCount: 12,
  sampleSize: 10,
  warnings: [],
  canExecute: true,
};

const mockPreviewWithWarnings: ImportPreview = {
  ...mockPreview,
  warnings: [{ level: 'error', message: 'Identifier field missing' }],
  canExecute: false,
};

import type { ReqIfDocument } from '../../../src/parser/reqif-types';

const mockDocument: ReqIfDocument = {
  header: { identifier: 'h1', title: 'Test', creationTime: '', reqIfVersion: '1.0' },
  specTypes: new Map(),
  specObjects: new Map(),
  specObjectCount: 0,
  specObjectOrder: [],
  parseWarnings: [],
};

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function renderWithContext(statePatch?: Partial<WizardState>) {
  const dispatch = jest.fn();
  const state: WizardState = {
    currentStep: 'preview',
    parsedDocument: mockDocument,
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
    importPreview: null,
    importStatus: null,
    importReport: null,
    globalError: null,
    ...statePatch,
  };

  jest.spyOn(WizardContext, 'useWizard').mockReturnValue({ state, dispatch });
  return render(<PreviewStep />);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PreviewStep', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const { computePreview } = jest.requireMock('../../../src/services/import-service') as { computePreview: jest.Mock };
    computePreview.mockReturnValue(mockPreview);
  });

  it('renders N items from the preview', async () => {
    const { getAllByRole } = renderWithContext();
    await waitFor(() => {
      const rows = getAllByRole('row');
      // header row + 10 data rows = 11 total
      expect(rows.length).toBeGreaterThanOrEqual(10);
    });
  });

  it('shows the total count', async () => {
    const { getByText } = renderWithContext();
    await waitFor(() => {
      expect(getByText(/12/)).toBeTruthy();
    });
  });

  it('N selector changes visible rows', async () => {
    const { getByRole } = renderWithContext();
    await waitFor(() => {
      expect(getByRole('combobox', { name: /sample size/i })).toBeTruthy();
    });

    fireEvent.change(getByRole('combobox', { name: /sample size/i }), { target: { value: '5' } });

    // After change, computePreview should be called with sampleSize=5
    const { computePreview } = jest.requireMock('../../../src/services/import-service') as { computePreview: jest.Mock };
    await waitFor(() => {
      expect(computePreview).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        5
      );
    });
  });

  it('Execute button is enabled when canExecute is true', async () => {
    const { getByRole } = renderWithContext();
    await waitFor(() => {
      const btn = getByRole('button', { name: /run import/i });
      expect(btn).not.toBeDisabled();
    });
  });

  it('Execute button is disabled when canExecute is false', async () => {
    const { computePreview } = jest.requireMock('../../../src/services/import-service') as { computePreview: jest.Mock };
    computePreview.mockReturnValue(mockPreviewWithWarnings);

    const { getByRole } = renderWithContext();
    await waitFor(() => {
      const btn = getByRole('button', { name: /run import/i });
      expect(btn).toBeDisabled();
    });
  });

  it('warning rows are displayed when preview has warnings', async () => {
    const { computePreview } = jest.requireMock('../../../src/services/import-service') as { computePreview: jest.Mock };
    computePreview.mockReturnValue(mockPreviewWithWarnings);

    const { getByText } = renderWithContext();
    await waitFor(() => {
      expect(getByText(/identifier field missing/i)).toBeTruthy();
    });
  });
});
