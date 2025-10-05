
import React from 'react';
import { SavedCV, CVData } from '../types';
import { Button } from './ui/Button';
import { Trash, Eye } from './icons';

interface SavedCVsProps {
  savedCVs: SavedCV[];
  onLoad: (cvData: CVData) => void;
  onDelete: (id: string) => void;
}

const SavedCVs: React.FC<SavedCVsProps> = ({ savedCVs, onLoad, onDelete }) => {
  return (
    <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
      {savedCVs.map(cv => (
        <div key={cv.id} className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg flex items-center justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{cv.name}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {new Date(cv.createdAt).toLocaleDateString()}
            </p>
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
