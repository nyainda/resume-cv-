
import React, { useState } from 'react';
import { Button } from './ui/Button';
import { ClipboardCopy, Download, Edit } from './icons';
import { downloadCoverLetterAsPDF } from '../services/pdfService';

interface CoverLetterPreviewProps {
  letterText: string;
  onTextChange: (newText: string) => void;
  fileName: string;
}

const CoverLetterPreview: React.FC<CoverLetterPreviewProps> = ({ letterText, onTextChange, fileName }) => {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [template, setTemplate] = useState<'modern' | 'professional'>('modern');

  const handleCopy = () => {
    navigator.clipboard.writeText(letterText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }, (err) => {
      console.error('Failed to copy text: ', err);
      alert('Failed to copy text.');
    });
  };

  const handleDownload = () => {
    downloadCoverLetterAsPDF(letterText, fileName, template);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
            <h2 className="text-2xl font-bold">Generated Cover Letter</h2>
            <div className="mt-2 flex items-center gap-2">
                <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Template:</span>
                <Button variant={template === 'modern' ? 'secondary' : 'ghost'} size="sm" onClick={() => setTemplate('modern')} className={template === 'modern' ? 'bg-zinc-200 dark:bg-neutral-700' : ''}>Modern</Button>
                <Button variant={template === 'professional' ? 'secondary' : 'ghost'} size="sm" onClick={() => setTemplate('professional')} className={template === 'professional' ? 'bg-zinc-200 dark:bg-neutral-700' : ''}>Professional</Button>
            </div>
        </div>
        <div className="flex flex-wrap gap-2">
            <Button onClick={() => setIsEditing(!isEditing)} variant="secondary" size="sm">
                <Edit className="h-4 w-4 mr-2" />
                {isEditing ? 'Finish Editing' : 'Edit'}
            </Button>
            <Button onClick={handleCopy} variant="secondary" size="sm">
              <ClipboardCopy className="h-4 w-4 mr-2" />
              {copied ? 'Copied!' : 'Copy Text'}
            </Button>
            <Button onClick={handleDownload} variant="secondary" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Download PDF
            </Button>
        </div>
      </div>
      <div 
        contentEditable={isEditing}
        suppressContentEditableWarning={true}
        onBlur={(e) => onTextChange(e.currentTarget.innerText)}
        className={`p-6 border border-zinc-200 dark:border-neutral-700 rounded-lg bg-zinc-50 dark:bg-neutral-900/50 whitespace-pre-wrap text-zinc-700 dark:text-zinc-300 leading-relaxed transition-all 
          ${template === 'professional' ? 'font-serif' : 'font-sans'}
          ${isEditing ? 'ring-2 ring-indigo-500 focus:outline-none' : ''}`}
      >
        {letterText}
      </div>
    </div>
  );
};

export default CoverLetterPreview;