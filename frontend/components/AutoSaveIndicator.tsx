// components/AutoSaveIndicator.tsx
// Drive has been removed — this component is intentionally a no-op stub.
// It is kept to avoid breaking any future imports; it renders nothing.

import React from 'react';
import { SaveStatus } from '../hooks/useAutoSave';

interface Props {
    status: SaveStatus;
}

export const AutoSaveIndicator: React.FC<Props> = (_props) => {
    return null;
};

export default AutoSaveIndicator;
