import React from 'react';
import { SavedCV, CVData } from '../types';
import { Button } from './ui/Button';
import { Trash, Eye, Target } from './icons';

interface SavedCVsProps {
  savedCVs: SavedCV[];
  onLoad: (cvData: CVData) => void;
  onDelete: (id: string) => void;
}

const SavedCVs: React.FC<SavedCVsProps> = ({ savedCVs, onLoad, onDelete }) => {
  return (
    <div className="space-y-2 max-h-96 overflow-y-auto pr-2 -mr-2">
      {savedCVs.map(cv => (
        <div key={cv.id} className="p-3 bg-zinc-50 dark:bg-neutral-700/30 rounded-lg flex items-center justify-between gap-2 transition-colors hover:bg-zinc-100 dark:hover:bg-neutral-700/60">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate text-zinc-800 dark:text-zinc-200">{cv.name}</p>
            <div className="flex items-center gap-2">
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {new Date(cv.createdAt).toLocaleDateString()}
                </p>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${cv.purpose === 'academic' ? 'bg-purple-200 text-purple-800' : 'bg-sky-200 text-sky-800'}`}>
                    {cv.purpose === 'academic' ? 'ACADEMIC' : 'JOB'}
                </span>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <Button variant="ghost" size="sm" onClick={() => onLoad(cv.data)} className="p-2 h-auto" aria-label="Load CV">
              <Eye className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onDelete(cv.id)} className="p-2 h-auto text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50 hover:text-red-600" aria-label="Delete CV">
              <Trash className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default SavedCVs;