import React, { useState, useRef, useCallback } from 'react';
import { PDFDocument } from 'pdf-lib';
import { Download, Trash, UploadCloud, FileText } from './icons';

// ── Types ────────────────────────────────────────────────────────────────────

type ToolId = 'merge' | 'split' | 'remove' | 'extract' | 'image-to-pdf' | 'word-to-pdf' | 'sign';

interface PdfFile {
    name: string;
    bytes: Uint8Array;
    pageCount: number;
    size: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const readFileAsBytes = (file: File): Promise<Uint8Array> =>
    new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(new Uint8Array(r.result as ArrayBuffer));
        r.onerror = rej;
        r.readAsArrayBuffer(file);
    });

const readFileAsDataURL = (file: File): Promise<string> =>
    new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result as string);
        r.onerror = rej;
        r.readAsDataURL(file);
    });

const downloadBytes = (bytes: Uint8Array, filename: string) => {
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const parsePageRanges = (input: string, totalPages: number): number[] => {
    const pages = new Set<number>();
    const parts = input.split(',').map(s => s.trim());
    for (const part of parts) {
        if (part.includes('-')) {
            const [start, end] = part.split('-').map(Number);
            if (!isNaN(start) && !isNaN(end)) {
                for (let i = Math.max(1, start); i <= Math.min(totalPages, end); i++) pages.add(i);
            }
        } else {
            const n = Number(part);
            if (!isNaN(n) && n >= 1 && n <= totalPages) pages.add(n);
        }
    }
    return [...pages].sort((a, b) => a - b);
};

// ── Shared UI components ──────────────────────────────────────────────────────

const DropZone: React.FC<{
    accept?: string;
    multiple?: boolean;
    onFiles: (files: File[]) => void;
    label: string;
    hint?: string;
    disabled?: boolean;
}> = ({ accept = 'application/pdf', multiple = false, onFiles, label, hint, disabled }) => {
    const [dragging, setDragging] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragging(false);
        if (disabled) return;
        const files = [...e.dataTransfer.files].filter(f =>
            accept === '*' || accept.split(',').some(a => f.type.includes(a.trim().replace('*', '')) || f.name.endsWith(a.trim().replace('.', '')))
        );
        if (files.length) onFiles(files);
    };

    return (
        <div
            className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${dragging ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-900/20' : 'border-slate-300 dark:border-neutral-600 hover:border-indigo-400 hover:bg-slate-50 dark:hover:bg-neutral-800/50'} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => !disabled && inputRef.current?.click()}
        >
            <input ref={inputRef} type="file" accept={accept} multiple={multiple} className="hidden" onChange={e => { const f = [...(e.target.files || [])]; if (f.length) onFiles(f); e.target.value = ''; }} disabled={disabled} />
            <UploadCloud className="h-8 w-8 mx-auto mb-3 text-slate-400 dark:text-neutral-500" />
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">{label}</p>
            {hint && <p className="text-xs text-slate-400 dark:text-neutral-500 mt-1">{hint}</p>}
        </div>
    );
};

const StatusBadge: React.FC<{ type: 'success' | 'error' | 'info'; message: string }> = ({ type, message }) => {
    const styles = {
        success: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
        error: 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800',
        info: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
    };
    return <div className={`rounded-xl border px-4 py-3 text-sm font-medium ${styles[type]}`}>{message}</div>;
};

// ── Tool: MERGE PDFs ──────────────────────────────────────────────────────────

const MergeTool: React.FC = () => {
    const [files, setFiles] = useState<PdfFile[]>([]);
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

    const addFiles = useCallback(async (incoming: File[]) => {
        const newFiles: PdfFile[] = [];
        for (const f of incoming) {
            try {
                const bytes = await readFileAsBytes(f);
                const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
                newFiles.push({ name: f.name, bytes, pageCount: doc.getPageCount(), size: f.size });
            } catch { setStatus({ type: 'error', msg: `Could not read "${f.name}" — it may be corrupted or encrypted.` }); }
        }
        setFiles(prev => [...prev, ...newFiles]);
    }, []);

    const remove = (i: number) => setFiles(f => f.filter((_, idx) => idx !== i));
    const moveUp = (i: number) => { if (i === 0) return; setFiles(f => { const a = [...f]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; return a; }); };
    const moveDown = (i: number) => { if (i === files.length - 1) return; setFiles(f => { const a = [...f]; [a[i], a[i + 1]] = [a[i + 1], a[i]]; return a; }); };

    const merge = async () => {
        if (files.length < 2) return setStatus({ type: 'error', msg: 'Please add at least 2 PDF files to merge.' });
        setLoading(true); setStatus(null);
        try {
            const merged = await PDFDocument.create();
            for (const f of files) {
                const src = await PDFDocument.load(f.bytes, { ignoreEncryption: true });
                const pages = await merged.copyPages(src, src.getPageIndices());
                pages.forEach(p => merged.addPage(p));
            }
            const bytes = await merged.save();
            downloadBytes(bytes, 'merged.pdf');
            setStatus({ type: 'success', msg: `Merged ${files.length} PDFs (${merged.getPageCount()} pages) successfully!` });
        } catch (e: any) {
            setStatus({ type: 'error', msg: e.message || 'Merge failed.' });
        }
        setLoading(false);
    };

    return (
        <div className="space-y-5">
            <DropZone accept="application/pdf" multiple label="Drop PDF files here or click to browse" hint="You can add multiple files at once" onFiles={addFiles} />
            {files.length > 0 && (
                <div className="space-y-2">
                    {files.map((f, i) => (
                        <div key={i} className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-neutral-800 rounded-xl border border-slate-200 dark:border-neutral-700">
                            <FileText className="h-5 w-5 text-indigo-500 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{f.name}</p>
                                <p className="text-xs text-slate-400">{f.pageCount} pages · {formatSize(f.size)}</p>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                                <button onClick={() => moveUp(i)} disabled={i === 0} className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-neutral-700 disabled:opacity-30 text-slate-500 text-xs font-bold">↑</button>
                                <button onClick={() => moveDown(i)} disabled={i === files.length - 1} className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-neutral-700 disabled:opacity-30 text-slate-500 text-xs font-bold">↓</button>
                                <button onClick={() => remove(i)} className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500"><Trash className="h-3.5 w-3.5" /></button>
                            </div>
                        </div>
                    ))}
                    <button onClick={merge} disabled={loading || files.length < 2} className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors text-sm">
                        {loading ? 'Merging…' : <><Download className="h-4 w-4" />Merge & Download</>}
                    </button>
                </div>
            )}
            {status && <StatusBadge type={status.type} message={status.msg} />}
        </div>
    );
};

// ── Tool: SPLIT PDF ───────────────────────────────────────────────────────────

const SplitTool: React.FC = () => {
    const [pdfFile, setPdfFile] = useState<PdfFile | null>(null);
    const [mode, setMode] = useState<'each' | 'range'>('each');
    const [rangeInput, setRangeInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

    const loadFile = async (files: File[]) => {
        try {
            const bytes = await readFileAsBytes(files[0]);
            const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
            setPdfFile({ name: files[0].name, bytes, pageCount: doc.getPageCount(), size: files[0].size });
            setStatus(null);
        } catch { setStatus({ type: 'error', msg: 'Could not read the PDF file.' }); }
    };

    const split = async () => {
        if (!pdfFile) return;
        setLoading(true); setStatus(null);
        try {
            const src = await PDFDocument.load(pdfFile.bytes, { ignoreEncryption: true });
            if (mode === 'each') {
                for (let i = 0; i < pdfFile.pageCount; i++) {
                    const newDoc = await PDFDocument.create();
                    const [page] = await newDoc.copyPages(src, [i]);
                    newDoc.addPage(page);
                    downloadBytes(await newDoc.save(), `page-${i + 1}.pdf`);
                    await new Promise(r => setTimeout(r, 120));
                }
                setStatus({ type: 'success', msg: `Split into ${pdfFile.pageCount} individual PDFs.` });
            } else {
                const pages = parsePageRanges(rangeInput, pdfFile.pageCount);
                if (!pages.length) return setStatus({ type: 'error', msg: 'No valid pages found in range. Example: 1-3, 5, 7-9' });
                const newDoc = await PDFDocument.create();
                const copied = await newDoc.copyPages(src, pages.map(p => p - 1));
                copied.forEach(p => newDoc.addPage(p));
                downloadBytes(await newDoc.save(), `split-pages-${rangeInput.replace(/\s/g, '')}.pdf`);
                setStatus({ type: 'success', msg: `Exported ${pages.length} pages successfully.` });
            }
        } catch (e: any) { setStatus({ type: 'error', msg: e.message || 'Split failed.' }); }
        setLoading(false);
    };

    return (
        <div className="space-y-5">
            {!pdfFile ? (
                <DropZone accept="application/pdf" label="Drop a PDF to split" onFiles={loadFile} />
            ) : (
                <div className="p-4 bg-slate-50 dark:bg-neutral-800 rounded-xl border border-slate-200 dark:border-neutral-700 flex items-center gap-3">
                    <FileText className="h-5 w-5 text-indigo-500 flex-shrink-0" />
                    <div className="flex-1">
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{pdfFile.name}</p>
                        <p className="text-xs text-slate-400">{pdfFile.pageCount} pages · {formatSize(pdfFile.size)}</p>
                    </div>
                    <button onClick={() => setPdfFile(null)} className="p-1.5 rounded-lg hover:bg-red-100 text-red-500"><Trash className="h-3.5 w-3.5" /></button>
                </div>
            )}
            {pdfFile && (
                <div className="space-y-4">
                    <div className="flex gap-2">
                        {(['each', 'range'] as const).map(m => (
                            <button key={m} onClick={() => setMode(m)} className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${mode === m ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-neutral-700'}`}>
                                {m === 'each' ? 'Split all pages' : 'Extract range'}
                            </button>
                        ))}
                    </div>
                    {mode === 'range' && (
                        <div>
                            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5 block">Page Range ({pdfFile.pageCount} total pages)</label>
                            <input value={rangeInput} onChange={e => setRangeInput(e.target.value)} placeholder="e.g. 1-3, 5, 7-9" className="w-full px-4 py-2.5 border border-slate-200 dark:border-neutral-700 rounded-xl text-sm bg-white dark:bg-neutral-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                        </div>
                    )}
                    <button onClick={split} disabled={loading} className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors text-sm">
                        {loading ? 'Processing…' : <><Download className="h-4 w-4" />{mode === 'each' ? 'Split into pages' : 'Extract & Download'}</>}
                    </button>
                </div>
            )}
            {status && <StatusBadge type={status.type} message={status.msg} />}
        </div>
    );
};

// ── Tool: REMOVE PAGES ────────────────────────────────────────────────────────

const RemovePagesTool: React.FC = () => {
    const [pdfFile, setPdfFile] = useState<PdfFile | null>(null);
    const [pagesToRemove, setPagesToRemove] = useState('');
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

    const loadFile = async (files: File[]) => {
        try {
            const bytes = await readFileAsBytes(files[0]);
            const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
            setPdfFile({ name: files[0].name, bytes, pageCount: doc.getPageCount(), size: files[0].size });
            setStatus(null);
        } catch { setStatus({ type: 'error', msg: 'Could not read the PDF file.' }); }
    };

    const remove = async () => {
        if (!pdfFile) return;
        const pages = parsePageRanges(pagesToRemove, pdfFile.pageCount);
        if (!pages.length) return setStatus({ type: 'error', msg: 'Enter valid page numbers to remove. Example: 1, 3, 5-7' });
        if (pages.length >= pdfFile.pageCount) return setStatus({ type: 'error', msg: 'Cannot remove all pages.' });
        setLoading(true); setStatus(null);
        try {
            const doc = await PDFDocument.load(pdfFile.bytes, { ignoreEncryption: true });
            const removeSet = new Set(pages.map(p => p - 1));
            const keepIndices = Array.from({ length: pdfFile.pageCount }, (_, i) => i).filter(i => !removeSet.has(i));
            const newDoc = await PDFDocument.create();
            const copied = await newDoc.copyPages(doc, keepIndices);
            copied.forEach(p => newDoc.addPage(p));
            downloadBytes(await newDoc.save(), pdfFile.name.replace('.pdf', '-removed.pdf'));
            setStatus({ type: 'success', msg: `Removed ${pages.length} page(s). Result has ${keepIndices.length} pages.` });
        } catch (e: any) { setStatus({ type: 'error', msg: e.message || 'Operation failed.' }); }
        setLoading(false);
    };

    return (
        <div className="space-y-5">
            {!pdfFile ? (
                <DropZone accept="application/pdf" label="Drop a PDF to edit" onFiles={loadFile} />
            ) : (
                <div className="p-4 bg-slate-50 dark:bg-neutral-800 rounded-xl border border-slate-200 dark:border-neutral-700 flex items-center gap-3">
                    <FileText className="h-5 w-5 text-red-500 flex-shrink-0" />
                    <div className="flex-1">
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{pdfFile.name}</p>
                        <p className="text-xs text-slate-400">{pdfFile.pageCount} pages · {formatSize(pdfFile.size)}</p>
                    </div>
                    <button onClick={() => setPdfFile(null)} className="p-1.5 rounded-lg hover:bg-red-100 text-red-500"><Trash className="h-3.5 w-3.5" /></button>
                </div>
            )}
            {pdfFile && (
                <div className="space-y-4">
                    <div>
                        <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5 block">Pages to Remove ({pdfFile.pageCount} total)</label>
                        <input value={pagesToRemove} onChange={e => setPagesToRemove(e.target.value)} placeholder="e.g. 1, 3, 5-7" className="w-full px-4 py-2.5 border border-slate-200 dark:border-neutral-700 rounded-xl text-sm bg-white dark:bg-neutral-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-red-400" />
                        <p className="text-xs text-slate-400 mt-1">Use commas to separate pages and hyphens for ranges.</p>
                    </div>
                    <button onClick={remove} disabled={loading} className="w-full flex items-center justify-center gap-2 py-3 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors text-sm">
                        {loading ? 'Processing…' : <><Trash className="h-4 w-4" />Remove Pages & Download</>}
                    </button>
                </div>
            )}
            {status && <StatusBadge type={status.type} message={status.msg} />}
        </div>
    );
};

// ── Tool: EXTRACT PAGES ───────────────────────────────────────────────────────

const ExtractPagesTool: React.FC = () => {
    const [pdfFile, setPdfFile] = useState<PdfFile | null>(null);
    const [rangeInput, setRangeInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

    const loadFile = async (files: File[]) => {
        try {
            const bytes = await readFileAsBytes(files[0]);
            const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
            setPdfFile({ name: files[0].name, bytes, pageCount: doc.getPageCount(), size: files[0].size });
            setStatus(null);
        } catch { setStatus({ type: 'error', msg: 'Could not read the PDF file.' }); }
    };

    const extract = async () => {
        if (!pdfFile) return;
        const pages = parsePageRanges(rangeInput, pdfFile.pageCount);
        if (!pages.length) return setStatus({ type: 'error', msg: 'Enter valid pages to extract. Example: 2-5, 8' });
        setLoading(true); setStatus(null);
        try {
            const src = await PDFDocument.load(pdfFile.bytes, { ignoreEncryption: true });
            const newDoc = await PDFDocument.create();
            const copied = await newDoc.copyPages(src, pages.map(p => p - 1));
            copied.forEach(p => newDoc.addPage(p));
            downloadBytes(await newDoc.save(), pdfFile.name.replace('.pdf', `-pages-${rangeInput.replace(/\s/g, '')}.pdf`));
            setStatus({ type: 'success', msg: `Extracted ${pages.length} page(s) into a new PDF.` });
        } catch (e: any) { setStatus({ type: 'error', msg: e.message || 'Extract failed.' }); }
        setLoading(false);
    };

    return (
        <div className="space-y-5">
            {!pdfFile ? (
                <DropZone accept="application/pdf" label="Drop a PDF to extract from" onFiles={loadFile} />
            ) : (
                <div className="p-4 bg-slate-50 dark:bg-neutral-800 rounded-xl border border-slate-200 dark:border-neutral-700 flex items-center gap-3">
                    <FileText className="h-5 w-5 text-emerald-500 flex-shrink-0" />
                    <div className="flex-1">
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{pdfFile.name}</p>
                        <p className="text-xs text-slate-400">{pdfFile.pageCount} pages · {formatSize(pdfFile.size)}</p>
                    </div>
                    <button onClick={() => setPdfFile(null)} className="p-1.5 rounded-lg hover:bg-red-100 text-red-500"><Trash className="h-3.5 w-3.5" /></button>
                </div>
            )}
            {pdfFile && (
                <div className="space-y-4">
                    <div>
                        <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5 block">Pages to Extract ({pdfFile.pageCount} total)</label>
                        <input value={rangeInput} onChange={e => setRangeInput(e.target.value)} placeholder="e.g. 2-5, 8, 10" className="w-full px-4 py-2.5 border border-slate-200 dark:border-neutral-700 rounded-xl text-sm bg-white dark:bg-neutral-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                    </div>
                    <button onClick={extract} disabled={loading} className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors text-sm">
                        {loading ? 'Extracting…' : <><Download className="h-4 w-4" />Extract & Download</>}
                    </button>
                </div>
            )}
            {status && <StatusBadge type={status.type} message={status.msg} />}
        </div>
    );
};

// ── Tool: IMAGE TO PDF ────────────────────────────────────────────────────────

const ImageToPdfTool: React.FC = () => {
    const [images, setImages] = useState<{ name: string; dataUrl: string; file: File }[]>([]);
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

    const addImages = async (files: File[]) => {
        const imgs = await Promise.all(files.map(async f => ({ name: f.name, dataUrl: await readFileAsDataURL(f), file: f })));
        setImages(prev => [...prev, ...imgs]);
    };

    const convert = async () => {
        if (!images.length) return;
        setLoading(true); setStatus(null);
        try {
            const doc = await PDFDocument.create();
            for (const img of images) {
                const bytes = await readFileAsBytes(img.file);
                const isJpeg = img.file.type === 'image/jpeg' || img.file.type === 'image/jpg';

                // Use canvas to normalize all images to JPEG for embedding
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d')!;
                await new Promise<void>((res, rej) => {
                    const i = new Image();
                    i.onload = () => {
                        const maxW = 595;
                        let w = i.naturalWidth, h = i.naturalHeight;
                        if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
                        canvas.width = w; canvas.height = h;
                        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
                        ctx.drawImage(i, 0, 0, w, h);
                        res();
                    };
                    i.onerror = rej;
                    i.src = img.dataUrl;
                });
                const blob: Blob = await new Promise(r => canvas.toBlob(b => r(b!), 'image/jpeg', 0.92));
                const jpgBytes = new Uint8Array(await blob.arrayBuffer());
                const embedded = await doc.embedJpg(jpgBytes);
                const page = doc.addPage([canvas.width, canvas.height]);
                page.drawImage(embedded, { x: 0, y: 0, width: canvas.width, height: canvas.height });
            }
            downloadBytes(await doc.save(), 'images.pdf');
            setStatus({ type: 'success', msg: `Converted ${images.length} image(s) to PDF.` });
        } catch (e: any) { setStatus({ type: 'error', msg: e.message || 'Conversion failed.' }); }
        setLoading(false);
    };

    return (
        <div className="space-y-5">
            <DropZone accept="image/jpeg,image/jpg,image/png,image/webp" multiple label="Drop images here (JPG, PNG, WEBP)" hint="Each image becomes one page. Drag to reorder after adding." onFiles={addImages} />
            {images.length > 0 && (
                <div className="space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {images.map((img, i) => (
                            <div key={i} className="relative group rounded-xl overflow-hidden border border-slate-200 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800">
                                <img src={img.dataUrl} alt={img.name} className="w-full h-28 object-cover" />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <button onClick={() => setImages(imgs => imgs.filter((_, idx) => idx !== i))} className="p-2 bg-red-500 rounded-full text-white">
                                        <Trash className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                                <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] px-2 py-1 truncate">{i + 1}. {img.name}</div>
                            </div>
                        ))}
                    </div>
                    <button onClick={convert} disabled={loading} className="w-full flex items-center justify-center gap-2 py-3 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors text-sm">
                        {loading ? 'Converting…' : <><Download className="h-4 w-4" />Convert to PDF</>}
                    </button>
                </div>
            )}
            {status && <StatusBadge type={status.type} message={status.msg} />}
        </div>
    );
};

// ── Tool: WORD TO PDF ─────────────────────────────────────────────────────────

const WordToPdfTool: React.FC = () => {
    const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info'; msg: string } | null>(null);
    const [loading, setLoading] = useState(false);
    const [htmlPreview, setHtmlPreview] = useState('');

    const convert = async (files: File[]) => {
        const file = files[0];
        if (!file) return;
        setLoading(true); setStatus({ type: 'info', msg: 'Converting Word document…' });
        try {
            const mammoth = await import('mammoth');
            const arrayBuffer = await file.arrayBuffer();
            const result = await mammoth.convertToHtml({ arrayBuffer });
            setHtmlPreview(result.value);

            // Try Playwright server first
            const serverUrl = `${window.location.protocol}//${window.location.hostname}:3001`;
            let serverOk = false;
            try {
                const health = await fetch(`${serverUrl}/health`, { signal: AbortSignal.timeout(2000) });
                serverOk = health.ok;
            } catch { }

            if (serverOk) {
                const res = await fetch(`${serverUrl}/api/generate-pdf`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        html: `<div style="font-family:Georgia,serif;font-size:12pt;line-height:1.6;padding:40px;max-width:750px;margin:auto">${result.value}</div>`,
                        filename: file.name.replace(/\.(docx|doc)$/i, '.pdf'),
                    }),
                    signal: AbortSignal.timeout(30000),
                });
                if (res.ok) {
                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url; a.download = file.name.replace(/\.(docx|doc)$/i, '.pdf');
                    document.body.appendChild(a); a.click(); document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    setStatus({ type: 'success', msg: 'Converted and downloaded successfully (Chromium HD).' });
                    setLoading(false);
                    return;
                }
            }

            // Fallback: html2canvas → canvas → PDF
            const container = document.createElement('div');
            container.style.cssText = 'position:fixed;left:-9999px;top:0;width:795px;padding:40px;font-family:Georgia,serif;font-size:12pt;line-height:1.6;background:#fff;color:#000;';
            container.innerHTML = result.value;
            document.body.appendChild(container);
            const html2canvas = (await import('html2canvas')).default;
            const canvas = await html2canvas(container, { scale: 1.5, useCORS: true, backgroundColor: '#fff' });
            document.body.removeChild(container);

            const doc = await PDFDocument.create();
            const imgData = canvas.toDataURL('image/jpeg', 0.92);
            const blob = await fetch(imgData).then(r => r.blob());
            const imgBytes = new Uint8Array(await blob.arrayBuffer());
            const img = await doc.embedJpg(imgBytes);
            const pageWidth = 595.28;
            const scale = pageWidth / canvas.width;
            const pageHeight = canvas.height * scale;
            const page = doc.addPage([pageWidth, pageHeight]);
            page.drawImage(img, { x: 0, y: 0, width: pageWidth, height: pageHeight });
            downloadBytes(await doc.save(), file.name.replace(/\.(docx|doc)$/i, '.pdf'));
            setStatus({ type: 'success', msg: 'Converted successfully. For best quality, also start the PDF Server workflow.' });
        } catch (e: any) {
            setStatus({ type: 'error', msg: e.message || 'Conversion failed. Make sure the file is a valid .docx document.' });
        }
        setLoading(false);
    };

    return (
        <div className="space-y-5">
            <DropZone accept=".docx,.doc" label="Drop a Word document (.docx)" hint="Converts your Word document to a downloadable PDF" onFiles={convert} disabled={loading} />
            {loading && <div className="flex items-center gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800 text-sm text-blue-700 dark:text-blue-300 font-medium"><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Converting document…</div>}
            {status && !loading && <StatusBadge type={status.type} message={status.msg} />}
            {htmlPreview && (
                <details className="rounded-xl border border-slate-200 dark:border-neutral-700 overflow-hidden">
                    <summary className="px-4 py-3 text-sm font-semibold text-slate-700 dark:text-slate-300 cursor-pointer bg-slate-50 dark:bg-neutral-800 hover:bg-slate-100 dark:hover:bg-neutral-700">Document preview</summary>
                    <div className="p-4 prose prose-sm max-w-none text-slate-800 dark:text-slate-200 max-h-60 overflow-y-auto text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: htmlPreview }} />
                </details>
            )}
        </div>
    );
};

// ── Tool: SIGN PDF ────────────────────────────────────────────────────────────

const SignPdfTool: React.FC = () => {
    const [pdfFile, setPdfFile] = useState<PdfFile | null>(null);
    const [sigMode, setSigMode] = useState<'draw' | 'type'>('draw');
    const [typedSig, setTypedSig] = useState('');
    const [targetPage, setTargetPage] = useState(1);
    const [position, setPosition] = useState<'bottom-right' | 'bottom-left' | 'bottom-center'>('bottom-right');
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawing = useRef(false);
    const lastPos = useRef({ x: 0, y: 0 });

    const loadFile = async (files: File[]) => {
        try {
            const bytes = await readFileAsBytes(files[0]);
            const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
            setPdfFile({ name: files[0].name, bytes, pageCount: doc.getPageCount(), size: files[0].size });
            setStatus(null);
        } catch { setStatus({ type: 'error', msg: 'Could not read the PDF file.' }); }
    };

    const clearCanvas = () => {
        const c = canvasRef.current;
        if (!c) return;
        const ctx = c.getContext('2d')!;
        ctx.clearRect(0, 0, c.width, c.height);
    };

    const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
        const rect = canvas.getBoundingClientRect();
        if ('touches' in e) {
            return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
        }
        return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
    };

    const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
        drawing.current = true;
        const c = canvasRef.current!;
        lastPos.current = getPos(e, c);
    };

    const draw = (e: React.MouseEvent | React.TouchEvent) => {
        if (!drawing.current) return;
        e.preventDefault();
        const c = canvasRef.current!;
        const ctx = c.getContext('2d')!;
        const pos = getPos(e, c);
        ctx.beginPath();
        ctx.moveTo(lastPos.current.x, lastPos.current.y);
        ctx.lineTo(pos.x, pos.y);
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
        lastPos.current = pos;
    };

    const stopDraw = () => { drawing.current = false; };

    const getSignaturePng = async (): Promise<Uint8Array | null> => {
        if (sigMode === 'draw') {
            const c = canvasRef.current;
            if (!c) return null;
            const blob: Blob = await new Promise(r => c.toBlob(b => r(b!), 'image/png'));
            return new Uint8Array(await blob.arrayBuffer());
        } else {
            if (!typedSig.trim()) return null;
            const canvas = document.createElement('canvas');
            canvas.width = 400; canvas.height = 80;
            const ctx = canvas.getContext('2d')!;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.font = `italic 40px "Georgia", serif`;
            ctx.fillStyle = '#1e293b';
            ctx.textBaseline = 'middle';
            ctx.fillText(typedSig, 10, 40);
            const blob: Blob = await new Promise(r => canvas.toBlob(b => r(b!), 'image/png'));
            return new Uint8Array(await blob.arrayBuffer());
        }
    };

    const sign = async () => {
        if (!pdfFile) return;
        setLoading(true); setStatus(null);
        try {
            const sigPng = await getSignaturePng();
            if (!sigPng) return setStatus({ type: 'error', msg: 'Please draw or type your signature first.' });

            const doc = await PDFDocument.load(pdfFile.bytes, { ignoreEncryption: true });
            const pageIdx = Math.min(Math.max(0, targetPage - 1), doc.getPageCount() - 1);
            const page = doc.getPage(pageIdx);
            const { width, height } = page.getSize();

            const sigImg = await doc.embedPng(sigPng);
            const sigW = 180, sigH = sigW * sigImg.height / sigImg.width;
            const margin = 30;
            let x = width - sigW - margin;
            if (position === 'bottom-left') x = margin;
            if (position === 'bottom-center') x = (width - sigW) / 2;
            const y = margin;

            page.drawImage(sigImg, { x, y, width: sigW, height: sigH, opacity: 0.92 });

            downloadBytes(await doc.save(), pdfFile.name.replace('.pdf', '-signed.pdf'));
            setStatus({ type: 'success', msg: `Signed page ${targetPage} and downloaded.` });
        } catch (e: any) { setStatus({ type: 'error', msg: e.message || 'Signing failed.' }); }
        setLoading(false);
    };

    return (
        <div className="space-y-5">
            {!pdfFile ? (
                <DropZone accept="application/pdf" label="Drop a PDF to sign" onFiles={loadFile} />
            ) : (
                <div className="p-4 bg-slate-50 dark:bg-neutral-800 rounded-xl border border-slate-200 dark:border-neutral-700 flex items-center gap-3">
                    <FileText className="h-5 w-5 text-violet-500 flex-shrink-0" />
                    <div className="flex-1">
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{pdfFile.name}</p>
                        <p className="text-xs text-slate-400">{pdfFile.pageCount} pages · {formatSize(pdfFile.size)}</p>
                    </div>
                    <button onClick={() => setPdfFile(null)} className="p-1.5 rounded-lg hover:bg-red-100 text-red-500"><Trash className="h-3.5 w-3.5" /></button>
                </div>
            )}
            {pdfFile && (
                <div className="space-y-4">
                    {/* Signature mode tabs */}
                    <div className="flex gap-2">
                        {(['draw', 'type'] as const).map(m => (
                            <button key={m} onClick={() => setSigMode(m)} className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${sigMode === m ? 'bg-violet-600 text-white' : 'bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-neutral-700'}`}>
                                {m === 'draw' ? '✏️ Draw Signature' : '⌨️ Type Signature'}
                            </button>
                        ))}
                    </div>

                    {sigMode === 'draw' ? (
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Draw your signature</label>
                                <button onClick={clearCanvas} className="text-xs text-red-500 hover:underline font-semibold">Clear</button>
                            </div>
                            <canvas
                                ref={canvasRef}
                                width={600}
                                height={120}
                                className="w-full h-28 border-2 border-slate-300 dark:border-neutral-600 rounded-xl bg-white cursor-crosshair touch-none"
                                onMouseDown={startDraw}
                                onMouseMove={draw}
                                onMouseUp={stopDraw}
                                onMouseLeave={stopDraw}
                                onTouchStart={startDraw}
                                onTouchMove={draw}
                                onTouchEnd={stopDraw}
                            />
                            <p className="text-xs text-slate-400 mt-1 text-center">Draw with mouse or finger</p>
                        </div>
                    ) : (
                        <div>
                            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5 block">Type your signature</label>
                            <input value={typedSig} onChange={e => setTypedSig(e.target.value)} placeholder="Your full name" className="w-full px-4 py-3 border border-slate-200 dark:border-neutral-700 rounded-xl bg-white dark:bg-neutral-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-400 italic text-xl" style={{ fontFamily: 'Georgia, serif' }} />
                        </div>
                    )}

                    {/* Options */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5 block">Page</label>
                            <input type="number" min={1} max={pdfFile.pageCount} value={targetPage} onChange={e => setTargetPage(Number(e.target.value))} className="w-full px-3 py-2.5 border border-slate-200 dark:border-neutral-700 rounded-xl text-sm bg-white dark:bg-neutral-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-400" />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5 block">Position</label>
                            <select value={position} onChange={e => setPosition(e.target.value as any)} className="w-full px-3 py-2.5 border border-slate-200 dark:border-neutral-700 rounded-xl text-sm bg-white dark:bg-neutral-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-400">
                                <option value="bottom-right">Bottom Right</option>
                                <option value="bottom-center">Bottom Center</option>
                                <option value="bottom-left">Bottom Left</option>
                            </select>
                        </div>
                    </div>

                    <button onClick={sign} disabled={loading} className="w-full flex items-center justify-center gap-2 py-3 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors text-sm">
                        {loading ? 'Signing…' : <><Download className="h-4 w-4" />Sign & Download PDF</>}
                    </button>
                </div>
            )}
            {status && <StatusBadge type={status.type} message={status.msg} />}
        </div>
    );
};

// ── Main PDFTools Hub ─────────────────────────────────────────────────────────

const TOOLS: { id: ToolId; label: string; icon: string; desc: string; color: string }[] = [
    { id: 'merge',        label: 'Merge PDFs',    icon: '🔗', desc: 'Combine multiple PDFs into one',       color: 'indigo'  },
    { id: 'split',        label: 'Split PDF',     icon: '✂️', desc: 'Split by pages or custom range',       color: 'blue'    },
    { id: 'remove',       label: 'Remove Pages',  icon: '🗑️', desc: 'Delete specific pages from a PDF',    color: 'red'     },
    { id: 'extract',      label: 'Extract Pages', icon: '📤', desc: 'Save specific pages as a new PDF',     color: 'emerald' },
    { id: 'image-to-pdf', label: 'Image → PDF',   icon: '🖼️', desc: 'Convert JPG/PNG/WEBP images to PDF',  color: 'cyan'    },
    { id: 'word-to-pdf',  label: 'Word → PDF',    icon: '📝', desc: 'Convert .docx Word files to PDF',     color: 'sky'     },
    { id: 'sign',         label: 'Sign PDF',      icon: '✍️', desc: 'Add a drawn or typed signature',      color: 'violet'  },
];

const colorMap: Record<string, string> = {
    indigo:  'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/40',
    blue:    'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/40',
    red:     'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/40',
    emerald: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/40',
    cyan:    'bg-cyan-50 dark:bg-cyan-900/20 text-cyan-600 dark:text-cyan-400 border-cyan-200 dark:border-cyan-800 hover:bg-cyan-100 dark:hover:bg-cyan-900/40',
    sky:     'bg-sky-50 dark:bg-sky-900/20 text-sky-600 dark:text-sky-400 border-sky-200 dark:border-sky-800 hover:bg-sky-100 dark:hover:bg-sky-900/40',
    violet:  'bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 border-violet-200 dark:border-violet-800 hover:bg-violet-100 dark:hover:bg-violet-900/40',
};

const PDFTools: React.FC = () => {
    const [activeTool, setActiveTool] = useState<ToolId | null>(null);
    const tool = TOOLS.find(t => t.id === activeTool);

    return (
        <div className="max-w-3xl mx-auto space-y-6 p-4 sm:p-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                {activeTool && (
                    <button onClick={() => setActiveTool(null)} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-neutral-800 text-slate-500 transition-colors flex-shrink-0">
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                    </button>
                )}
                <div>
                    <h2 className="text-xl font-black text-slate-900 dark:text-slate-50">
                        {activeTool ? `${tool?.icon} ${tool?.label}` : '🛠️ PDF Tools'}
                    </h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                        {activeTool ? tool?.desc : 'All PDF operations — 100% private, processed in your browser'}
                    </p>
                </div>
            </div>

            {/* Tool grid */}
            {!activeTool && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {TOOLS.map(t => (
                        <button
                            key={t.id}
                            onClick={() => setActiveTool(t.id)}
                            className={`flex flex-col items-start gap-2 p-4 rounded-2xl border text-left transition-all group ${colorMap[t.color]}`}
                        >
                            <span className="text-2xl">{t.icon}</span>
                            <div>
                                <p className="text-sm font-bold leading-snug">{t.label}</p>
                                <p className="text-[11px] opacity-70 leading-snug mt-0.5">{t.desc}</p>
                            </div>
                        </button>
                    ))}
                </div>
            )}

            {/* Active tool panel */}
            {activeTool && (
                <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-slate-200 dark:border-neutral-700 p-6 shadow-sm">
                    {activeTool === 'merge'        && <MergeTool />}
                    {activeTool === 'split'        && <SplitTool />}
                    {activeTool === 'remove'       && <RemovePagesTool />}
                    {activeTool === 'extract'      && <ExtractPagesTool />}
                    {activeTool === 'image-to-pdf' && <ImageToPdfTool />}
                    {activeTool === 'word-to-pdf'  && <WordToPdfTool />}
                    {activeTool === 'sign'         && <SignPdfTool />}
                </div>
            )}

            {/* Privacy note */}
            {!activeTool && (
                <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-neutral-500">
                    <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                    Your files never leave your browser — all processing happens locally on your device.
                </div>
            )}
        </div>
    );
};

export default PDFTools;
