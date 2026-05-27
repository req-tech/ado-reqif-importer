/**
 * T029 — MappingStep tests (must fail before T030 implementation)
 */

import { render, waitFor } from '@testing-library/react';
import MappingStep from '../../../src/components/MappingStep/MappingStep';
import * as WizardContext from '../../../src/context/wizard-context';
import type { WizardState } from '../../../src/context/wizard-context';
import type { ReqIfDocument } from '../../../src/parser/reqif-types';
import type { AdoWorkItemType } from '../../../src/models/ado-metadata';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('../../../src/services/ado-metadata-service', () => ({
  getAdoWorkItemTypes: jest.fn(async () => mockAdoTypes),
}));

jest.mock('../../../src/services/storage-service', () => ({
  saveProfile: jest.fn(async () => undefined),
  listProfiles: jest.fn(async () => []),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockAdoTypes: AdoWorkItemType[] = [
  {
    name: 'Requirement',
    referenceName: 'Custom.Requirement',
    fields: [
      { name: 'Title', referenceName: 'System.Title', type: 'string', isRequired: true },
      { name: 'Description', referenceName: 'System.Description', type: 'html', isRequired: false },
    ],
  },
  {
    name: 'User Story',
    referenceName: 'Microsoft.VSTS.WorkItemTypes.UserStory',
    fields: [
      { name: 'Title', referenceName: 'System.Title', type: 'string', isRequired: true },
    ],
  },
];

function makeSpecType(id: string, name: string, attrs: string[] = []) {
  const attributeDefinitions = new Map(
    attrs.map((a) => [a, { identifier: a, longName: a, type: 'STRING' as const }])
  );
  return { identifier: id, longName: name, attributeDefinitions };
}

const mockDocument: ReqIfDocument = {
  header: {
    identifier: 'doc-1',
    title: 'Test Doc',
    creationTime: '2024-01-01T00:00:00Z',
    reqIfVersion: '1.0',
  },
  specTypes: new Map([
    ['ST-001', makeSpecType('ST-001', 'SoftwareReq', ['ATTR-TITLE', 'ATTR-DESC'])],
    ['ST-002', makeSpecType('ST-002', 'HardwareReq', ['ATTR-ID'])],
  ]),
  specObjects: new Map(),
  specObjectCount: 0,
  specObjectOrder: [],
  parseWarnings: [],
};

// ---------------------------------------------------------------------------
// Helper — wrap component with mock context
// ---------------------------------------------------------------------------

function renderWithContext(statePatch?: Partial<WizardState>) {
  const dispatch = jest.fn();

  const state: WizardState = {
    currentStep: 'mapping',
    parsedDocument: mockDocument,
    mappingProfile: null,
    savedProfiles: [],
    adoWorkItemTypes: [],
    importPreview: null,
    importStatus: null,
    importReport: null,
    globalError: null,
    fieldDefaults: {},
    ...statePatch,
  };

  jest.spyOn(WizardContext, 'useWizard').mockReturnValue({ state, dispatch });

  return render(<MappingStep />);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MappingStep', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders one row per SpecType from the parsed document', async () => {
    const { getAllByRole } = renderWithContext();
    // Rows for each spec type (plus possibly a header row)
    await waitFor(() => {
      const rows = getAllByRole('row');
      // At least one row per spec type
      expect(rows.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('shows ADO work item type options in a dropdown', async () => {
    const { getAllByRole } = renderWithContext();
    await waitFor(() => {
      const combos = getAllByRole('combobox');
      expect(combos.length).toBeGreaterThanOrEqual(1);
      expect(combos[0]).toBeTruthy();
    });
  });

  it('Next button is disabled when no WI type is selected', async () => {
    const { getByRole } = renderWithContext();
    await waitFor(() => {
      const nextBtn = getByRole('button', { name: /next/i });
      expect((nextBtn as HTMLButtonElement).disabled).toBe(true);
    });
  });
});
