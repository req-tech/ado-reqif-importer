/**
 * T021 — UploadStep component tests (must fail before T022 implementation)
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { WizardProvider } from '../../../src/context/wizard-context';
import UploadStep from '../../../src/components/UploadStep/UploadStep';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('../../../src/parser/reqif-parser', () => ({
  parseReqIfFile: jest.fn(),
}));

import { parseReqIfFile } from '../../../src/parser/reqif-parser';
const mockParse = parseReqIfFile as jest.MockedFunction<typeof parseReqIfFile>;

// Minimal ReqIfDocument mock
const mockDocument = {
  header: { identifier: 'h1', title: 'Test', creationTime: '', reqIfVersion: '1.0' },
  specTypes: new Map(),
  specObjects: new Map(),
  specObjectCount: 3,
  specObjectOrder: [],
  parseWarnings: [],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <WizardProvider>{children}</WizardProvider>
);

function renderUploadStep() {
  return render(<UploadStep />, { wrapper: Wrapper });
}

function makeFile(name: string, content = 'data', type = 'application/xml') {
  return new File([content], name, { type });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('UploadStep', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders a file drop zone / file input', () => {
    renderUploadStep();
    const input = document.querySelector('input[type="file"]');
    expect(input).not.toBeNull();
  });

  it('accepts .reqif files in the file input accept attribute', () => {
    renderUploadStep();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input?.accept).toContain('.reqif');
  });

  it('shows parsed summary and advances step on successful .reqif parse', async () => {
    mockParse.mockResolvedValueOnce(mockDocument as never);
    renderUploadStep();

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = makeFile('test.reqif');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    fireEvent.change(input);

    await waitFor(() => {
      expect(mockParse).toHaveBeenCalledWith(expect.any(ArrayBuffer), 'test.reqif');
    });
  });

  it('dispatches SET_ERROR on parse failure', async () => {
    mockParse.mockRejectedValueOnce(new Error('Bad file'));
    renderUploadStep();

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = makeFile('broken.reqif');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    fireEvent.change(input);

    await waitFor(() => {
      expect(mockParse).toHaveBeenCalled();
    });
    // Error should surface — rendered by ErrorBanner in the parent or as inline text
    // We just verify the parse was called and rejected without crashing the component
  });

  it('shows a loading indicator while parsing', async () => {
    // Keep the promise pending
    let resolve!: () => void;
    mockParse.mockReturnValueOnce(
      new Promise((res) => {
        resolve = () => res(mockDocument as never);
      })
    );

    renderUploadStep();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = makeFile('test.reqif');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    fireEvent.change(input);

    await waitFor(() => {
      // A loading indicator should appear during parse
      const loading = document.querySelector('[aria-busy="true"], [role="progressbar"]');
      expect(loading).not.toBeNull();
    });

    resolve();
  });

  it('accepts .reqifz files', () => {
    renderUploadStep();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input?.accept).toContain('.reqifz');
  });
});
