import React, { useState, useRef, useCallback, useEffect } from 'react';
import { PDFDocument } from 'pdf-lib';
import { SavedCV, UserProfile, MergeItem, SavedMerge, TemplateName, FontName } from '../types';
import { getCVAsPDFBytes, getCoverLetterAsPDFBytes } from '../services/pdfService';
import { Button } from './ui/Button';
import { Trash, Download, Save, Eye, X } from './icons';

const ACCEPTED_TYPES = 'application/pdf,image/jpeg,image/jpg,image/png,image/webp,image/gif';
const IMAGE_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];

const imageToPdfBytes = (base64: string, mimeType: string): Promise<Uint8Array> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = async () => {
      const maxW = 595;
      const maxH = 842;
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      if (w > maxW || h > maxH) {
        const scale = Math.min(maxW / w, maxH / h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas not available'));
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(async (blob) => {
        if (!blob) return reject(new Error('Canvas conversion failed'));
        const pngBytes = new Uint8Array(await blob.arrayBuffer());
        const doc = await PDFDocument.create();
        const pdfImage = await doc.embedPng(pngBytes);
        const page = doc.addPage([w, h]);
        page.drawImage(pdfImage, { x: 0, y: 0, width: w, height: h });
        resolve(await doc.save());
      }, 'image/png');
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = `data:${mimeType};base64,${base64}`;
  });

interface PDFMergerProps {
  savedCVs: SavedCV[];
  userProfile: UserProfile;
  savedMerges: SavedMerge[];
  onSaveMerge: (merge: SavedMerge) => void;
  onDeleteMerge: (id: string) => void;
}

const MoveUpIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 19V5M5 12l7-7 7 7" />
  </svg>
);

const MoveDownIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 5v14M5 12l7 7 7-7" />
  </svg>
);

const FilePlusIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="12" y1="18" x2="12" y2="12" />
    <line x1="9" y1="15" x2="15" y2="15" />
  </svg>
);

const MergeIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 6H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3" />
    <path d="M16 6h3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-3" />
    <line x1="12" y1="2" x2="12" y2="22" />
    <path d="M9 9l3-3 3 3" />
    <path d="M9 15l3 3 3-3" />
  </svg>
);

const TEMPLATE_OPTIONS: TemplateName[] = ['professional', 'modern', 'minimalist', 'corporate', 'creative', 'twoColumnBlue', 'executive', 'classic', 'standard-pro'];
const FONT_OPTIONS: { value: FontName; label: string }[] = [
  { value: 'inter', label: 'Inter' },
  { value: 'helvetica', label: 'Helvetica' },
  { value: 'times-new-roman', label: 'Times New Roman' },
  { value: 'georgia', label: 'Georgia' },
];

const STORAGE_KEY = 'cv_builder:merger_queue';

const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
};

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
  });

const loadQueueFromStorage = (): MergeItem[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as MergeItem[];
  } catch {
    return [];
  }
};

const PDFMerger: React.FC<PDFMergerProps> = ({
  savedCVs,
  userProfile,
  savedMerges,
  onSaveMerge,
  onDeleteMerge,
}) => {
  const [items, setItems] = useState<MergeItem[]>(loadQueueFromStorage);
  const [isMerging, setIsMerging] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [addMode, setAddMode] = useState<'none' | 'cv' | 'cover-letter'>('none');
  const [selectedCvId, setSelectedCvId] = useState<string>('');
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateName>('professional');
  const [selectedFont, setSelectedFont] = useState<FontName>('inter');
  const [coverLetterText, setCoverLetterText] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'merge' | 'saved'>('merge');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewFileName, setPreviewFileName] = useState<string>('');
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<string | null>(null);

  const coverLetterFromStorage = localStorage.getItem('coverLetter') || localStorage.getItem('toolkit_cl') || '';

  useEffect(() => {
    try {
      const toSave = items.map(item => {
        if (item.source === 'uploaded-pdf' && item.uploadedPdfBase64 && item.uploadedPdfBase64.length > 2_000_000) {
          return { ...item, uploadedPdfBase64: undefined };
        }
        return item;
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch {
      // quota exceeded — silently skip
    }
  }, [items]);

  useEffect(() => {
    return () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    };
  }, []);

  const setItemsAndPersist = (updater: MergeItem[] | ((prev: MergeItem[]) => MergeItem[])) => {
    setItems(updater);
  };

  const moveItem = (index: number, direction: 'up' | 'down') => {
    const newItems = [...items];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newItems.length) return;
    [newItems[index], newItems[targetIndex]] = [newItems[targetIndex], newItems[index]];
    setItemsAndPersist(newItems);
  };

  const removeItem = (id: string) => {
    setItemsAndPersist(prev => prev.filter(item => item.id !== id));
  };

  const addCVItem = () => {
    if (!selectedCvId) return;
    const cv = savedCVs.find(c => c.id === selectedCvId);
    if (!cv) return;
    const item: MergeItem = {
      id: Date.now().toString() + Math.random(),
      source: 'saved-cv',
      label: `CV: ${cv.name}`,
      cvId: cv.id,
      cvTemplate: selectedTemplate,
      cvFont: selectedFont,
    };
    setItemsAndPersist(prev => [...prev, item]);
    setAddMode('none');
  };

  const addCoverLetterItem = () => {
    if (!coverLetterText.trim()) return;
    const item: MergeItem = {
      id: Date.now().toString() + Math.random(),
      source: 'cover-letter',
      label: 'Cover Letter',
      coverLetterText,
    };
    setItemsAndPersist(prev => [...prev, item]);
    setAddMode('none');
  };

  const addUploadedFile = useCallback(async (file: File) => {
    const isPDF = file.type === 'application/pdf';
    const isImage = IMAGE_MIME_TYPES.includes(file.type);
    if (!isPDF && !isImage) {
      setMergeError('Unsupported file type. Please upload a PDF or an image (JPG, PNG, WEBP).');
      return;
    }
    const base64 = await fileToBase64(file);
    const cleanName = file.name.replace(/\.[^.]+$/, '');
    const item: MergeItem = isImage
      ? {
          id: Date.now().toString() + Math.random(),
          source: 'uploaded-image',
          label: cleanName,
          uploadedImageBase64: base64,
          uploadedImageType: file.type,
        }
      : {
          id: Date.now().toString() + Math.random(),
          source: 'uploaded-pdf',
          label: cleanName,
          uploadedPdfBase64: base64,
        };
    setItemsAndPersist(prev => [...prev, item]);
    setMergeError(null);
  }, []);

  const handleUploadPDF = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await addUploadedFile(file);
    e.target.value = '';
  };

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const files = (Array.from(e.dataTransfer.files) as File[]).filter(f =>
      f.type === 'application/pdf' || IMAGE_MIME_TYPES.includes(f.type)
    );
    for (const file of files) {
      await addUploadedFile(file);
    }
  }, [addUploadedFile]);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };

  const handleDragLeave = () => setIsDraggingOver(false);

  const closePreview = () => {
    if (previewRef.current) {
      URL.revokeObjectURL(previewRef.current);
      previewRef.current = null;
    }
    setPreviewUrl(null);
  };

  const handleDownloadPreview = () => {
    if (!previewUrl) return;
    const a = document.createElement('a');
    a.href = previewUrl;
    a.download = previewFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleMerge = useCallback(async () => {
    if (items.length < 2) {
      setMergeError('Please add at least 2 items to merge.');
      return;
    }
    setIsMerging(true);
    setMergeError(null);
    closePreview();

    try {
      const mergedPdf = await PDFDocument.create();

      for (const item of items) {
        let pdfBytes: Uint8Array | null = null;

        if (item.source === 'saved-cv') {
          const cv = savedCVs.find(c => c.id === item.cvId);
          if (!cv) continue;
          const buf = getCVAsPDFBytes({
            cvData: cv.data,
            personalInfo: userProfile.personalInfo,
            template: item.cvTemplate ?? 'professional',
            font: item.cvFont ?? 'inter',
            fileName: item.label,
          });
          pdfBytes = new Uint8Array(buf);
        } else if (item.source === 'cover-letter' && item.coverLetterText) {
          const buf = getCoverLetterAsPDFBytes(item.coverLetterText, userProfile.personalInfo);
          pdfBytes = new Uint8Array(buf);
        } else if (item.source === 'uploaded-pdf' && item.uploadedPdfBase64) {
          pdfBytes = new Uint8Array(base64ToArrayBuffer(item.uploadedPdfBase64));
        } else if (item.source === 'uploaded-image' && item.uploadedImageBase64 && item.uploadedImageType) {
          pdfBytes = await imageToPdfBytes(item.uploadedImageBase64, item.uploadedImageType);
        }

        if (!pdfBytes) continue;

        const srcDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
        const pages = await mergedPdf.copyPages(srcDoc, srcDoc.getPageIndices());
        pages.forEach(page => mergedPdf.addPage(page));
      }

      const mergedBytes = await mergedPdf.save();
      const blob = new Blob([mergedBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      previewRef.current = url;
      setPreviewUrl(url);
      const fileName = `merged_${Date.now()}.pdf`;
      setPreviewFileName(fileName);
    } catch (err) {
      setMergeError(`Merge failed: ${err instanceof Error ? err.message : 'Unknown error'}. Try re-uploading any external PDFs.`);
    } finally {
      setIsMerging(false);
    }
  }, [items, savedCVs, userProfile]);

  const handleSaveMerge = () => {
    if (items.length === 0) return;
    const name = window.prompt('Name this merge preset:', `Merge ${new Date().toLocaleDateString()}`);
    if (!name) return;
    const savedMerge: SavedMerge = {
      id: Date.now().toString(),
      name,
      createdAt: new Date().toISOString(),
      items,
    };
    onSaveMerge(savedMerge);
  };

  const handleLoadMerge = (merge: SavedMerge) => {
    setItemsAndPersist(merge.items);
    setActiveTab('merge');
    closePreview();
  };

  const itemSourceIcon = (source: MergeItem['source']) => {
    if (source === 'saved-cv') return '📄';
    if (source === 'cover-letter') return '✉️';
    if (source === 'uploaded-image') return '🖼️';
    return '📎';
  };

  const itemSourceColor = (source: MergeItem['source']) => {
    if (source === 'saved-cv') return 'bg-indigo-50 border-indigo-200 dark:bg-indigo-900/20 dark:border-indigo-700';
    if (source === 'cover-letter') return 'bg-violet-50 border-violet-200 dark:bg-violet-900/20 dark:border-violet-700';
    if (source === 'uploaded-image') return 'bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-700';
    return 'bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-700';
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-800 p-6 sm:p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-extrabold text-zinc-900 dark:text-zinc-50 flex items-center gap-3">
              <MergeIcon className="h-7 w-7 text-indigo-500" />
              PDF Merge Studio
            </h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
              Combine CVs, cover letters, and uploaded PDFs into one document
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-zinc-200 dark:border-neutral-700 mb-6">
          <button
            onClick={() => setActiveTab('merge')}
            className={`px-5 py-2.5 text-sm font-semibold border-b-2 transition-colors ${activeTab === 'merge' ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
          >
            Merge Builder
          </button>
          <button
            onClick={() => setActiveTab('saved')}
            className={`px-5 py-2.5 text-sm font-semibold border-b-2 transition-colors ${activeTab === 'saved' ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
          >
            Saved Merges {savedMerges.length > 0 && <span className="ml-1.5 bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 text-[10px] font-bold px-1.5 py-0.5 rounded-full">{savedMerges.length}</span>}
          </button>
        </div>

        {activeTab === 'merge' && (
          <div className="space-y-6">
            {/* Queue */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wide">
                  Documents to Merge ({items.length})
                </h3>
                {items.length > 0 && (
                  <button
                    onClick={() => { setItemsAndPersist([]); closePreview(); }}
                    className="text-xs text-red-500 hover:underline font-medium"
                  >
                    Clear All
                  </button>
                )}
              </div>

              {items.length === 0 ? (
                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  className={`text-center py-14 border-2 border-dashed rounded-xl transition-colors ${isDraggingOver ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-900/20' : 'border-zinc-200 dark:border-neutral-700'}`}
                >
                  <MergeIcon className="h-10 w-10 text-zinc-300 dark:text-zinc-600 mx-auto mb-3" />
                  <p className="text-zinc-500 dark:text-zinc-400 text-sm font-medium">No documents yet</p>
                  <p className="text-zinc-400 dark:text-zinc-500 text-xs mt-1">Add items below or drop PDF / image files here</p>
                </div>
              ) : (
                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  className={`space-y-2 rounded-xl transition-colors ${isDraggingOver ? 'ring-2 ring-indigo-400 ring-offset-2' : ''}`}
                >
                  {items.map((item, index) => (
                    <div
                      key={item.id}
                      className={`flex items-center gap-3 p-3 rounded-xl border ${itemSourceColor(item.source)}`}
                    >
                      <span className="text-base flex-shrink-0 w-6 text-center text-zinc-400 dark:text-zinc-500 font-mono text-xs">{index + 1}</span>
                      <span className="text-lg flex-shrink-0">{itemSourceIcon(item.source)}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 truncate">{item.label}</p>
                        {item.source === 'saved-cv' && (
                          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{item.cvTemplate} · {item.cvFont}</p>
                        )}
                        {item.source === 'uploaded-pdf' && (
                          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Uploaded PDF</p>
                        )}
                        {item.source === 'uploaded-image' && (
                          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Image → PDF page</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => moveItem(index, 'up')}
                          disabled={index === 0}
                          className="p-1.5 rounded-lg hover:bg-white/60 dark:hover:bg-neutral-700/60 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          title="Move up"
                        >
                          <MoveUpIcon className="h-4 w-4 text-zinc-500" />
                        </button>
                        <button
                          onClick={() => moveItem(index, 'down')}
                          disabled={index === items.length - 1}
                          className="p-1.5 rounded-lg hover:bg-white/60 dark:hover:bg-neutral-700/60 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          title="Move down"
                        >
                          <MoveDownIcon className="h-4 w-4 text-zinc-500" />
                        </button>
                        <button
                          onClick={() => removeItem(item.id)}
                          className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 text-red-500 transition-colors"
                          title="Remove"
                        >
                          <Trash className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {isDraggingOver && (
                    <div className="flex items-center gap-3 p-4 rounded-xl border-2 border-dashed border-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 text-center justify-center">
                      <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400">Drop PDF here to add</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Add Document Panel */}
            <div className="border border-zinc-200 dark:border-neutral-700 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wide">Add Document</h3>
                {addMode !== 'none' && (
                  <button onClick={() => setAddMode('none')} className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 flex items-center gap-1">
                    <X className="h-3 w-3" /> Cancel
                  </button>
                )}
              </div>

              {addMode === 'none' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <button
                    onClick={() => setAddMode('cv')}
                    className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-dashed border-indigo-200 dark:border-indigo-700 hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-all"
                  >
                    <span className="text-2xl">📄</span>
                    <span className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">Saved CV</span>
                    <span className="text-[11px] text-zinc-500 text-center">Pick a saved CV from your library</span>
                  </button>

                  <button
                    onClick={() => { setAddMode('cover-letter'); setCoverLetterText(coverLetterFromStorage); }}
                    disabled={!coverLetterFromStorage}
                    className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-dashed border-violet-200 dark:border-violet-700 hover:border-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="text-2xl">✉️</span>
                    <span className="text-sm font-semibold text-violet-700 dark:text-violet-300">Cover Letter</span>
                    <span className="text-[11px] text-zinc-500 text-center">{coverLetterFromStorage ? 'Use your last generated cover letter' : 'No cover letter found — generate one first'}</span>
                  </button>

                  <button
                    onClick={() => uploadRef.current?.click()}
                    className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-dashed border-amber-200 dark:border-amber-700 hover:border-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-all"
                  >
                    <span className="text-2xl">📎</span>
                    <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">Upload File</span>
                    <span className="text-[11px] text-zinc-500 text-center">PDF, JPG, PNG, WEBP or screenshot</span>
                  </button>
                  <input ref={uploadRef} type="file" accept={ACCEPTED_TYPES} className="hidden" onChange={handleUploadPDF} />
                </div>
              )}

              {addMode === 'cv' && (
                <div className="space-y-4">
                  {savedCVs.length === 0 ? (
                    <p className="text-sm text-zinc-500 text-center py-4">No saved CVs found. Generate and save a CV first.</p>
                  ) : (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-1.5">Select CV</label>
                        <select
                          value={selectedCvId}
                          onChange={e => setSelectedCvId(e.target.value)}
                          className="w-full text-sm border border-zinc-200 dark:border-neutral-600 rounded-lg px-3 py-2 bg-white dark:bg-neutral-700 text-zinc-900 dark:text-zinc-100"
                        >
                          <option value="">-- Select a saved CV --</option>
                          {savedCVs.map(cv => (
                            <option key={cv.id} value={cv.id}>{cv.name} ({new Date(cv.createdAt).toLocaleDateString()})</option>
                          ))}
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-1.5">Template</label>
                          <select
                            value={selectedTemplate}
                            onChange={e => setSelectedTemplate(e.target.value as TemplateName)}
                            className="w-full text-sm border border-zinc-200 dark:border-neutral-600 rounded-lg px-3 py-2 bg-white dark:bg-neutral-700 text-zinc-900 dark:text-zinc-100"
                          >
                            {TEMPLATE_OPTIONS.map(t => (
                              <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1).replace(/-/g, ' ')}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-1.5">Font</label>
                          <select
                            value={selectedFont}
                            onChange={e => setSelectedFont(e.target.value as FontName)}
                            className="w-full text-sm border border-zinc-200 dark:border-neutral-600 rounded-lg px-3 py-2 bg-white dark:bg-neutral-700 text-zinc-900 dark:text-zinc-100"
                          >
                            {FONT_OPTIONS.map(f => (
                              <option key={f.value} value={f.value}>{f.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <Button onClick={addCVItem} disabled={!selectedCvId}>
                        <FilePlusIcon className="h-4 w-4 mr-2" /> Add CV to Merge
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {addMode === 'cover-letter' && (
                <div className="space-y-4">
                  <textarea
                    value={coverLetterText}
                    onChange={e => setCoverLetterText(e.target.value)}
                    rows={8}
                    className="w-full text-sm border border-zinc-200 dark:border-neutral-600 rounded-xl px-3 py-2.5 bg-white dark:bg-neutral-700 text-zinc-900 dark:text-zinc-100 resize-none"
                    placeholder="Paste or edit your cover letter text here..."
                  />
                  <Button onClick={addCoverLetterItem} disabled={!coverLetterText.trim()}>
                    <FilePlusIcon className="h-4 w-4 mr-2" /> Add Cover Letter to Merge
                  </Button>
                </div>
              )}
            </div>

            {/* Error */}
            {mergeError && (
              <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-700 dark:text-red-300">
                {mergeError}
              </div>
            )}

            {/* Actions */}
            {items.length > 0 && (
              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={handleMerge}
                  disabled={isMerging || items.length < 2}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2"
                >
                  {isMerging ? (
                    <><span className="animate-spin inline-block">⏳</span> Merging...</>
                  ) : (
                    <><Eye className="h-4 w-4" /> Merge & Preview</>
                  )}
                </Button>
                <Button variant="secondary" onClick={handleSaveMerge}>
                  <Save className="h-4 w-4 mr-2" /> Save Preset
                </Button>
              </div>
            )}

            {items.length === 1 && (
              <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">Add at least one more document to enable merging.</p>
            )}
          </div>
        )}

        {activeTab === 'saved' && (
          <div className="space-y-4">
            {savedMerges.length === 0 ? (
              <div className="text-center py-12">
                <Save className="h-10 w-10 text-zinc-300 dark:text-zinc-600 mx-auto mb-3" />
                <p className="text-zinc-500 dark:text-zinc-400 text-sm font-medium">No saved merge presets yet</p>
                <p className="text-zinc-400 dark:text-zinc-500 text-xs mt-1">Build a merge and click "Save Preset" to store it here</p>
              </div>
            ) : (
              savedMerges.map(merge => (
                <div key={merge.id} className="flex items-center gap-4 p-4 bg-zinc-50 dark:bg-neutral-700/40 rounded-xl border border-zinc-200 dark:border-neutral-700">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-zinc-800 dark:text-zinc-200 text-sm truncate">{merge.name}</p>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                      {merge.items.length} item{merge.items.length !== 1 ? 's' : ''} · {new Date(merge.createdAt).toLocaleDateString()}
                    </p>
                    <div className="flex gap-1 mt-1.5 flex-wrap">
                      {merge.items.map(item => (
                        <span key={item.id} className="text-[10px] px-1.5 py-0.5 bg-zinc-200 dark:bg-neutral-600 text-zinc-600 dark:text-zinc-300 rounded-full truncate max-w-[120px]">
                          {itemSourceIcon(item.source)} {item.label}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button variant="secondary" onClick={() => handleLoadMerge(merge)}>
                      Load
                    </Button>
                    <button
                      onClick={() => onDeleteMerge(merge.id)}
                      className="p-2 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 text-red-500 transition-colors"
                      title="Delete preset"
                    >
                      <Trash className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* PDF Preview Panel */}
      {previewUrl && (
        <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-800 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-neutral-700">
            <div className="flex items-center gap-3">
              <Eye className="h-5 w-5 text-indigo-500" />
              <div>
                <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-50">Merged PDF Preview</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">{items.length} document{items.length !== 1 ? 's' : ''} merged · {previewFileName}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={handleDownloadPreview}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                <Download className="h-4 w-4 mr-2" />
                Download PDF
              </Button>
              <button
                onClick={closePreview}
                className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-neutral-700 text-zinc-500 transition-colors"
                title="Close preview"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
          <div className="relative bg-zinc-100 dark:bg-neutral-900" style={{ height: '75vh' }}>
            <iframe
              src={previewUrl}
              className="w-full h-full border-0"
              title="Merged PDF Preview"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default PDFMerger;
