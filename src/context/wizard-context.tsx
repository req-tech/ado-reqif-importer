import React, { createContext, useContext, useReducer } from 'react';
import type { ReqIfDocument } from '../parser/reqif-types';
import type { AdoWorkItemType } from '../models/ado-metadata';
import type { MappingProfile } from '../models/mapping';
import type { ImportPreview } from '../models/preview';
import type { ImportStatus, ImportReport } from '../models/report';

// ---------------------------------------------------------------------------
// Step type
// ---------------------------------------------------------------------------

export type WizardStep = 'upload' | 'mapping' | 'preview' | 'import';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface WizardState {
  currentStep: WizardStep;
  parsedDocument: ReqIfDocument | null;
  mappingProfile: MappingProfile | null;
  savedProfiles: MappingProfile[];
  adoWorkItemTypes: AdoWorkItemType[];
  importPreview: ImportPreview | null;
  importStatus: ImportStatus | null;
  importReport: ImportReport | null;
  globalError: string | null;
}

const initialState: WizardState = {
  currentStep: 'upload',
  parsedDocument: null,
  mappingProfile: null,
  savedProfiles: [],
  adoWorkItemTypes: [],
  importPreview: null,
  importStatus: null,
  importReport: null,
  globalError: null,
};

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type WizardAction =
  | { type: 'SET_STEP'; step: WizardStep }
  | { type: 'SET_PARSED_DOCUMENT'; document: ReqIfDocument }
  | { type: 'SET_MAPPING_PROFILE'; profile: MappingProfile }
  | { type: 'SET_SAVED_PROFILES'; profiles: MappingProfile[] }
  | { type: 'SET_ADO_WORK_ITEM_TYPES'; types: AdoWorkItemType[] }
  | { type: 'SET_IMPORT_PREVIEW'; preview: ImportPreview }
  | { type: 'SET_IMPORT_STATUS'; status: ImportStatus }
  | { type: 'SET_IMPORT_REPORT'; report: ImportReport }
  | { type: 'SET_ERROR'; message: string }
  | { type: 'CLEAR_ERROR' };

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'SET_STEP':
      return { ...state, currentStep: action.step };
    case 'SET_PARSED_DOCUMENT':
      return { ...state, parsedDocument: action.document };
    case 'SET_MAPPING_PROFILE':
      return { ...state, mappingProfile: action.profile };
    case 'SET_SAVED_PROFILES':
      return { ...state, savedProfiles: action.profiles };
    case 'SET_ADO_WORK_ITEM_TYPES':
      return { ...state, adoWorkItemTypes: action.types };
    case 'SET_IMPORT_PREVIEW':
      return { ...state, importPreview: action.preview };
    case 'SET_IMPORT_STATUS':
      return { ...state, importStatus: action.status };
    case 'SET_IMPORT_REPORT':
      return { ...state, importReport: action.report };
    case 'SET_ERROR':
      return { ...state, globalError: action.message };
    case 'CLEAR_ERROR':
      return { ...state, globalError: null };
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface WizardContextValue {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
}

const WizardContext = createContext<WizardContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export const WizardProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(wizardReducer, initialState);
  return <WizardContext.Provider value={{ state, dispatch }}>{children}</WizardContext.Provider>;
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useWizard(): WizardContextValue {
  const ctx = useContext(WizardContext);
  if (!ctx) {
    throw new Error('useWizard must be used inside <WizardProvider>');
  }
  return ctx;
}
