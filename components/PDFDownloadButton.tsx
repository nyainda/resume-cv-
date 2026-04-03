import React, { Suspense, lazy } from 'react';
import { CVData, PersonalInfo, TemplateName } from '../types';
import { REACT_PDF_TEMPLATES, ReactPDFTemplateName } from '../services/reactPdfTemplates';
import { Download } from './icons';

const PDFDownloadLink = lazy(() =>
  import('@react-pdf/renderer').then(mod => ({ default: mod.PDFDownloadLink }))
);

const buildDocument = lazy(() =>
  import('../services/reactPdfTemplates').then(mod => ({
    default: ({ template, cvData, personalInfo }: { template: TemplateName; cvData: CVData; personalInfo: PersonalInfo }) =>
      mod.buildReactPDFDocument(template, cvData, personalInfo),
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

const ReactPDFButton: React.FC<PDFDownloadButtonProps> = ({ cvData, personalInfo, template, fileName, onFallback, disabled }) => {
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
    <Suspense
      fallback={
        <button disabled className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold opacity-75">
          <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          Preparing PDF...
        </button>
      }
    >
      <PDFDownloadLinkInner cvData={cvData} personalInfo={personalInfo} template={template} fileName={fileName} disabled={disabled} />
    </Suspense>
  );
};

const PDFDownloadLinkInner: React.FC<Omit<PDFDownloadButtonProps, 'onFallback'>> = ({ cvData, personalInfo, template, fileName, disabled }) => {
  const { PDFDownloadLink: PDFLink } = require('@react-pdf/renderer');
  const { buildReactPDFDocument } = require('../services/reactPdfTemplates');
  const doc = buildReactPDFDocument(template, cvData, personalInfo);

  return (
    <PDFLink document={doc} fileName={fileName}>
      {({ loading, error }: { loading: boolean; error: Error | null }) => (
        <span
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer select-none ${
            loading || disabled
              ? 'bg-indigo-400 text-white cursor-not-allowed'
              : 'bg-indigo-600 hover:bg-indigo-700 text-white'
          }`}
        >
          {loading ? (
            <>
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              Generating PDF...
            </>
          ) : (
            <>
              <Download className="h-4 w-4" />
              Download PDF
              <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded-full font-medium">New</span>
            </>
          )}
        </span>
      )}
    </PDFLink>
  );
};

export default ReactPDFButton;
