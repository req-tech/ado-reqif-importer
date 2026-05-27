import React from 'react';
import { useWizard } from '../../context/wizard-context';
import type { WizardStep } from '../../context/wizard-context';
import './WizardNav.css';

const STEPS: { id: WizardStep; label: string }[] = [
  { id: 'upload', label: '1. Upload' },
  { id: 'mapping', label: '2. Mapping' },
  { id: 'valuemapping', label: '3. Values' },
  { id: 'preview', label: '4. Preview' },
  { id: 'import', label: '5. Import' },
];

const WizardNav: React.FC = () => {
  const { state } = useWizard();
  const currentIndex = STEPS.findIndex((s) => s.id === state.currentStep);

  return (
    <nav className="wizard-nav" aria-label="Import wizard steps">
      {STEPS.map((step, index) => {
        const isActive = step.id === state.currentStep;
        const isCompleted = index < currentIndex;

        return (
          <span
            key={step.id}
            className={[
              'wizard-nav__step',
              isActive ? 'wizard-nav__step--active' : '',
              isCompleted ? 'wizard-nav__step--completed' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            aria-current={isActive ? 'step' : undefined}
          >
            {step.label}
            {index < STEPS.length - 1 && (
              <span className="wizard-nav__separator" aria-hidden="true">
                {' › '}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
};

export default WizardNav;
