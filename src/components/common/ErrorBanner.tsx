import React from 'react';
import { useWizard } from '../../context/wizard-context';
import './ErrorBanner.css';

const ErrorBanner: React.FC = () => {
  const { state, dispatch } = useWizard();

  if (!state.globalError) {
    return null;
  }

  const handleDismiss = () => {
    dispatch({ type: 'CLEAR_ERROR' });
  };

  return (
    <div className="error-banner" role="alert" aria-live="assertive">
      <span className="error-banner__icon" aria-hidden="true">
        ⚠
      </span>
      <span className="error-banner__message">{state.globalError}</span>
      <button
        className="error-banner__dismiss"
        onClick={handleDismiss}
        aria-label="Dismiss error"
        type="button"
      >
        ✕
      </button>
    </div>
  );
};

export default ErrorBanner;
