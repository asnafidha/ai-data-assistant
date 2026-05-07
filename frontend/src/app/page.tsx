'use client';
import EDADisplay from './components/EDADIsplay'
import AIChat from './components/AIChat';
import Layout from './components/Layout';
import { useState, useRef } from 'react';

export default function Home() {
  const [message, setMessage] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [edaData, setEdaData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [aiChatQuery, setAiChatQuery] = useState<string>('');
  const [sqlQuery, setSqlQuery] = useState<string>('SELECT * FROM sqlite_master');
  const [apiUrl, setApiUrl] = useState<string>('https://api.example.com/data');
  
  const uploadedFileRef = useRef<File | null>(null);
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  // --- CSV/XLSX Upload ---
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';

    setIsLoading(true);
    setMessage('');
    uploadedFileRef.current = file;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${API_BASE}/api/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      if (data?.error) {
        setMessage(`❌ Error: ${data.error}`);
        setIsLoading(false);
        return;
      }

      const columnCount = data?.columns?.length || 0;
      const visibleCols = Math.min(50, columnCount);
      const filename = data?.filename || 'uploaded file';

      const smartMessage = `💡 Uploaded "${filename}" with ${columnCount} columns. Showing ${visibleCols} for speed. Full dataset preserved.`;
      setMessage(smartMessage);
      setEdaData(data);
      setActiveTab('overview');
    } catch (error: any) {
      console.error('Upload failed:', error);
      setMessage(`❌ Upload failed! ${error.message || 'Check console for details.'}`);
    } finally {
      setIsLoading(false);
    }
  };

  // --- SQL Upload ---
  const handleSQLUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';

    setIsLoading(true);
    setMessage('');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('query', sqlQuery);

    try {
      const response = await fetch(`${API_BASE}/api/connect-sql`, {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

      const data = await response.json();
      setMessage(`💡 SQL data loaded successfully from ${file.name}!`);
      setEdaData(data);
      setActiveTab('overview');
    } catch (error: any) {
      console.error(error);
      setMessage(`❌ SQL upload failed! ${error.message || 'Check console for details.'}`);
    } finally {
      setIsLoading(false);
    }
  };

  // --- API Fetch ---
  const handleAPIFetch = async () => {
    if (!apiUrl) return;
    
    setIsLoading(true);
    setMessage('');

    try {
      const response = await fetch(`${API_BASE}/api/fetch-api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: apiUrl }),
      });
      
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

      const data = await response.json();
      setMessage('💡 API data loaded successfully!');
      setEdaData(data);
      setActiveTab('overview');
    } catch (error: any) {
      console.error(error);
      setMessage(`❌ API fetch failed! ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // --- Demo Data ---
  const handleDemoData = async () => {
    setIsLoading(true);
    setMessage('Loading demo data...');
    
    try {
      // Create a simple demo CSV in memory
      const demoCSV = `id,name,age,score,city,department
1,John,25,85.5,New York,Marketing
2,Jane,30,92.3,London,Sales
3,Bob,22,78.9,Paris,Engineering
4,Alice,28,88.2,Tokyo,Marketing
5,Charlie,35,95.7,San Francisco,Engineering
6,Diana,29,87.1,Berlin,Sales
7,Evan,31,91.4,Sydney,Engineering
8,Fiona,26,83.7,Toronto,Marketing`;

      // Convert to a file object
      const blob = new Blob([demoCSV], { type: 'text/csv' });
      const file = new File([blob], 'demo_data.csv', { type: 'text/csv' });
      
      // Use your existing file upload handler
      const event = {
        target: {
          files: [file],
          value: ''
        }
      } as any;
      
      await handleFileUpload(event);
      
    } catch (error: any) {
      setMessage(`❌ Demo data failed: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
  };

  const handleCleanClick = () => {
    console.log("Deep clean requested");
  };

  const handleExportClick = () => {
    if (edaData?.session_id) {
      console.log("Export requested for session:", edaData.session_id);
      window.open(`${API_BASE}/export?session_id=${edaData.session_id}`, '_blank');
    }
  };

  const handleAIAnalyze = (query: string) => {
    setAiChatQuery(query);
  };

  return (
    <Layout
      activeTab={activeTab}
      onTabChange={handleTabChange}
      onCleanClick={handleCleanClick}
      onExportClick={handleExportClick}
    >
      <div className="p-6 w-full">
        <div className="flex flex-col gap-4 mb-6">
          {/* CSV/XLSX Upload */}
          <div className="flex items-center gap-4">
            <label className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold py-2 px-4 rounded cursor-pointer shadow-lg">
              📁 Choose CSV / Excel
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileUpload}
                className="hidden"
                disabled={isLoading}
              />
            </label>
            
            {/* Demo Data Button */}
            <button
              onClick={handleDemoData}
              disabled={isLoading}
              className="bg-blue-600 text-white font-bold py-2 px-4 rounded shadow-lg"
            >
              🚀 Load Demo Data
            </button>
          </div>

          {/* SQL Upload */}
          <div className="flex items-center gap-4">
            <label className="bg-green-600 text-white font-bold py-2 px-4 rounded cursor-pointer shadow-lg">
              🗄️ Upload SQL Database
              <input
                type="file"
                accept=".db,.sqlite,.sqlite3,.db3"
                onChange={handleSQLUpload}
                className="hidden"
                disabled={isLoading}
              />
            </label>
            
            <input
              type="text"
              placeholder="SQL Query (e.g., SELECT * FROM users)"
              value={sqlQuery}
              onChange={(e) => setSqlQuery(e.target.value)}
              className="px-3 py-2 border rounded text-black flex-grow"
              disabled={isLoading}
            />
          </div>

          {/* API Fetch */}
          <div className="flex items-center gap-4">
            <input
              type="text"
              placeholder="API URL (e.g., https://api.example.com/data)"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              className="px-3 py-2 border rounded text-black flex-grow"
              disabled={isLoading}
            />
            <button
              onClick={handleAPIFetch}
              disabled={isLoading}
              className="bg-yellow-500 text-white font-bold py-2 px-4 rounded shadow-lg"
            >
              🌐 Fetch API
            </button>
          </div>

          {isLoading && <div className="text-gray-300">⏳ Processing…</div>}
          {message && <div className="text-green-300">{message}</div>}
        </div>

        {edaData ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <EDADisplay
                data={edaData}
                originalFile={uploadedFileRef.current}
                activeTab={activeTab}
                onTabChange={setActiveTab}
                onAIAnalyze={handleAIAnalyze}
              />
            </div>
            <div>
              <AIChat data={edaData} initialQuery={aiChatQuery} />
            </div>
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="text-gray-400 text-lg mb-4">Upload data to start analysis</div>
            <div className="text-sm text-gray-500">
              <p>Supported sources: CSV, Excel, SQL databases, APIs</p>
              <p className="mt-2">✨ AI-powered data analysis awaits!</p>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}