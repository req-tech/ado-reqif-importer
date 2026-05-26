import 'azure-devops-ui/Core/override.css';
import * as SDK from 'azure-devops-extension-sdk';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { WizardProvider, useWizard } from '../context/wizard-context';
import WizardNav from '../components/common/WizardNav';
import ErrorBanner from '../components/common/ErrorBanner';
import UploadStep from '../components/UploadStep/UploadStep';
import MappingStep from '../components/MappingStep/MappingStep';
import PreviewStep from '../components/PreviewStep/PreviewStep';
import ImportStep from '../components/ImportStep/ImportStep';

const StepRouter: React.FC = () => {
  const { state } = useWizard();
  switch (state.currentStep) {
    case 'upload':
      return <UploadStep />;
    case 'mapping':
      return <MappingStep />;
    case 'preview':
      return <PreviewStep />;
    case 'import':
      return <ImportStep />;
  }
};

const App: React.FC = () => {
  return (
    <WizardProvider>
      <div className="flex-column" style={{ height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <WizardNav />
        <ErrorBanner />
        <main style={{ flex: 1, overflowY: 'auto' }}>
          <StepRouter />
        </main>
      </div>
    </WizardProvider>
  );
};

SDK.init()
  .then(() => {
    const container = document.getElementById('root');
    if (!container) {
      throw new Error('Root element #root not found in hub.html');
    }
    const root = createRoot(container);
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
    SDK.notifyLoadSucceeded();
  })
  .catch((err: unknown) => {
    console.error('[ReqIF Importer] SDK init failed:', err);
    SDK.notifyLoadFailed(err instanceof Error ? err : String(err));
  });
