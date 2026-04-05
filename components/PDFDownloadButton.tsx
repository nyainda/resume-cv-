import React, { Suspense, lazy } from 'react';
import { CVData, PersonalInfo, TemplateName } from '../types';
import { Download } from './icons';

// @react-pdf/renderer disabled — all templates use jsPDF (reliable, text renders correctly)
const REACT_PDF_TEMPLATES: string[] = [];
type ReactPDFTemplateName = string;

const Spinner = () => (
  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);

const LoadingButton = () => (
  <button disabled className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold opacity-75">
    <Spinner /> Preparing PDF...
  </button>
);

const LazyInner = lazy(() =>
  Promise.all([
    import('@react-pdf/renderer'),
    import('../services/reactPdfTemplates'),
  ]).then(([renderer, templates]) => ({
    default: ({
      cvData,
      personalInfo,
      template,
      fileName,
      disabled,
    }: {
      cvData: CVData;
      personalInfo: PersonalInfo;
      template: TemplateName;
      fileName: string;
      disabled?: boolean;
    }) => {
      const doc = templates.buildReactPDFDocument(template, cvData, personalInfo);
      return (
        <renderer.PDFDownloadLink document={doc} fileName={fileName}>
          {({ loading, error }: { loading: boolean; error: Error | null }) => (
            <span
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer select-none ${
                loading || disabled
                  ? 'bg-indigo-400 text-white cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white'
              }`}
            >
              {loading ? (
                <><Spinner />Generating PDF...</>
              ) : error ? (
                <><Download className="h-4 w-4" />Download PDF</>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Download PDF
                  <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded-full font-medium">New</span>
                </>
              )}
            </span>
          )}
        </renderer.PDFDownloadLink>
      );
    },
  }))
);

interface PDFDownloadButtonProps {
  cvData: CVData;
  personalInfo: PersonalInfo;
  template: TemplateName;
  fileName: string;
  onFallback: () => void;
  disabled?: boolean;
}

const PDFDownloadButton: React.FC<PDFDownloadButtonProps> = ({
  cvData,
  personalInfo,
  template,
  fileName,
  onFallback,
  disabled,
}) => {
  const isSupported = REACT_PDF_TEMPLATES.includes(template as ReactPDFTemplateName);

  if (!isSupported) {
    return (
      <button
        onClick={onFallback}
        disabled={disabled}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Download className="h-4 w-4" />
        Download PDF
      </button>
    );
  }

  return (
    <Suspense fallback={<LoadingButton />}>
      <LazyInner
        cvData={cvData}
        personalInfo={personalInfo}
        template={template}
        fileName={fileName}
        disabled={disabled}
      />
    </Suspense>
  );
};

export default PDFDownloadButton;
