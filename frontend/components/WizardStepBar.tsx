// WizardStepBar — 4-step chevron progress indicator for the CV Generator.
// Matches the design spec: navy/gold color palette, chevron connectors,
// gold-filled current step, checkmark for completed steps.
import React from 'react';

const GOLD = '#C9A84C';
const NAVY = '#1B2B4B';

export interface WizardStep {
  label: string;
  sublabel?: string;
}

interface Props {
  steps: WizardStep[];
  /** Zero-based index of the currently active step */
  currentStep: number;
  darkMode?: boolean;
  onStepClick?: (index: number) => void;
}

const CheckIcon: React.FC<{ size?: number }> = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const ChevronRight: React.FC<{ dark: boolean }> = ({ dark }) => (
  <svg
    className="flex-shrink-0"
    width="12"
    height="22"
    viewBox="0 0 12 22"
    fill="none"
  >
    <path
      d="M2 1 L10 11 L2 21"
      stroke={dark ? 'rgba(255,255,255,0.12)' : '#D1D5DB'}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const WizardStepBar: React.FC<Props> = ({
  steps,
  currentStep,
  darkMode = false,
  onStepClick,
}) => {
  const dark = darkMode;

  return (
    <div
      className="flex items-center gap-0 overflow-x-auto no-scrollbar"
      role="navigation"
      aria-label="CV wizard steps"
    >
      {steps.map((step, idx) => {
        const isCompleted = idx < currentStep;
        const isActive = idx === currentStep;
        const isPending = idx > currentStep;
        const isClickable = onStepClick && (isCompleted || isActive);

        return (
          <React.Fragment key={step.label}>
            {/* Step item */}
            <button
              onClick={() => isClickable && onStepClick(idx)}
              disabled={!isClickable}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all duration-150 flex-shrink-0 ${
                isClickable ? 'cursor-pointer' : 'cursor-default'
              } ${
                isActive
                  ? dark
                    ? 'bg-[#C9A84C]/15'
                    : 'bg-amber-50'
                  : ''
              }`}
              aria-current={isActive ? 'step' : undefined}
            >
              {/* Step circle */}
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-black transition-all duration-200"
                style={
                  isCompleted
                    ? { background: GOLD, color: '#fff' }
                    : isActive
                    ? { background: GOLD, color: NAVY }
                    : {
                        background: dark ? 'rgba(255,255,255,0.08)' : '#F3F4F6',
                        color: dark ? 'rgba(255,255,255,0.3)' : '#9CA3AF',
                      }
                }
              >
                {isCompleted ? (
                  <CheckIcon size={10} />
                ) : (
                  <span>{idx + 1}</span>
                )}
              </div>

              {/* Step label */}
              <div className="hidden sm:flex flex-col leading-none">
                <span
                  className="text-[11px] font-bold leading-tight transition-colors duration-150"
                  style={
                    isCompleted || isActive
                      ? { color: isActive ? GOLD : dark ? 'rgba(255,255,255,0.7)' : '#374151' }
                      : { color: dark ? 'rgba(255,255,255,0.25)' : '#9CA3AF' }
                  }
                >
                  {step.label}
                </span>
                {step.sublabel && (
                  <span
                    className="text-[9px] mt-0.5 leading-tight"
                    style={{ color: dark ? 'rgba(255,255,255,0.18)' : '#C4C9D4' }}
                  >
                    {step.sublabel}
                  </span>
                )}
              </div>
            </button>

            {/* Chevron connector (not after last item) */}
            {idx < steps.length - 1 && (
              <ChevronRight dark={dark} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default WizardStepBar;
