'use client';

import { useEffect, useState } from 'react';

interface Props { onClose: () => void; onConfirm: () => Promise<void>; }

export default function DeepCleanModal({ onClose, onConfirm }: Props) {
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);

  const confirm = async () => {
    setLoading(true);
    try { await onConfirm(); } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-60 z-50" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="bg-gray-900 text-white p-6 rounded w-96" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-xl font-bold mb-2">🧹 Deep Clean</h3>
        <p className="text-sm text-gray-300 mb-4">This will perform automated cleaning steps and produce a preview. You can export the cleaned file after.</p>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} disabled={loading} className="px-3 py-1 bg-gray-700 rounded">Cancel</button>
          <button onClick={confirm} disabled={loading} className="px-3 py-1 bg-purple-600 rounded">{loading ? 'Cleaning…' : 'Confirm'}</button>
        </div>
      </div>
    </div>
  );
}
