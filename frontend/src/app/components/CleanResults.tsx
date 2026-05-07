'use client';

import { useMemo, useState } from 'react';

interface CleanResultProps {
  data: any[] | { cleaned_data?: any[] }; // Accept both formats
}

export default function CleanResult({ data }: CleanResultProps) {
  // Handle both array and object formats
  const cleanedData = Array.isArray(data) ? data : data?.cleaned_data || [];
  
  console.log('CleanResult data:', cleanedData); // Debug log

  if (!cleanedData || cleanedData.length === 0) {
    return <p className="text-gray-400">No data available.</p>;
  }

  const allColumns = useMemo(() => Array.from(new Set(cleanedData.flatMap((row) => Object.keys(row)))), [cleanedData]);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);

  const start = page * rowsPerPage;
  const end = start + rowsPerPage;
  const paginated = cleanedData.slice(start, end);

  return (
    <div className="flex flex-col space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-300">Rows per page</span>
        <select value={rowsPerPage} onChange={(e) => { setRowsPerPage(Number(e.target.value)); setPage(0); }} className="bg-black border border-gray-700 rounded px-2 py-1">
          {[20,50,100,200].map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>

      <div className="overflow-auto max-h-[420px] border border-gray-700 rounded p-2 bg-gray-800">
        <table className="min-w-full border-collapse">
          <thead>
            <tr className="bg-gray-700">
              {allColumns.map(col => <th key={col} className="px-2 py-1 border border-gray-600 text-left text-sm">{col}</th>)}
            </tr>
          </thead>
          <tbody>
            {paginated.map((row, i) => (
              <tr key={i} className="border-b border-gray-700">
                {allColumns.map(col => <td key={col} className="px-2 py-1 border border-gray-600 text-sm">{String(row?.[col] ?? '')}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between text-sm text-gray-300">
        <button onClick={() => setPage(p => Math.max(p-1,0))} disabled={page===0} className="px-2 py-1 bg-gray-700 rounded disabled:opacity-40">◀ Prev</button>
        <div>Page {page+1} of {Math.ceil(cleanedData.length / rowsPerPage)}</div>
        <button onClick={() => setPage(p => ((p+1)*rowsPerPage < cleanedData.length ? p+1 : p))} disabled={(page+1)*rowsPerPage >= cleanedData.length} className="px-2 py-1 bg-gray-700 rounded disabled:opacity-40">Next ▶</button>
      </div>
    </div>
  );
}