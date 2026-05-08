'use client';
import EDADisplay from './components/EDADIsplay'
import AIChat from './components/AIChat';
import Layout from './components/Layout';
import { useState, useRef } from 'react';
import { Upload, Database, Globe, Zap, Loader2, AlertCircle, CheckCircle2, FileSpreadsheet, MessageCircle } from 'lucide-react';

export default function Home() {
  const [message, setMessage] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [edaData, setEdaData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [aiChatQuery, setAiChatQuery] = useState<string>('');
  const [sqlQuery, setSqlQuery] = useState<string>('SELECT * FROM sqlite_master');
  const [apiUrl, setApiUrl] = useState<string>('https://api.example.com/data');
  const [showChat, setShowChat] = useState<boolean>(false);

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
        setMessage(`Error: ${data.error}`);
        setIsLoading(false);
        return;
      }

      const columnCount = data?.columns?.length || 0;
      const visibleCols = Math.min(50, columnCount);
      const filename = data?.filename || 'uploaded file';

      const smartMessage = `Uploaded "${filename}" with ${columnCount} columns. Showing ${visibleCols} for speed. Full dataset preserved.`;
      setMessage(smartMessage);
      setEdaData(data);
      setActiveTab('overview');
    } catch (error: any) {
      console.error('Upload failed:', error);
      setMessage(`Upload failed! ${error.message || 'Check console for details.'}`);
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
      setMessage(`SQL data loaded successfully from ${file.name}`);
      setEdaData(data);
      setActiveTab('overview');
    } catch (error: any) {
      console.error(error);
      setMessage(`SQL upload failed! ${error.message || 'Check console for details.'}`);
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
      setMessage('API data loaded successfully');
      setEdaData(data);
      setActiveTab('overview');
    } catch (error: any) {
      console.error(error);
      setMessage(`API fetch failed! ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // --- Demo Data ---
  const handleDemoData = async () => {
    setIsLoading(true);
    setMessage('Loading demo data...');

    try {
      const demoCSV = `id,name,age,score,city,department
1,John,25,85.5,New York,Marketing
2,Jane,30,92.3,London,Sales
3,Bob,22,78.9,Paris,Engineering
4,Alice,28,88.2,Tokyo,Marketing
5,Charlie,35,95.7,San Francisco,Engineering
6,Diana,29,87.1,Berlin,Sales
7,Evan,31,91.4,Sydney,Engineering
8,Fiona,26,83.7,Toronto,Marketing`;

      const blob = new Blob([demoCSV], { type: 'text/csv' });
      const file = new File([blob], 'demo_data.csv', { type: 'text/csv' });

      const event = {
        target: {
          files: [file],
          value: ''
        }
      } as any;

      await handleFileUpload(event);

    } catch (error: any) {
      setMessage(`Demo data failed: ${error.message}`);
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
    setShowChat(true);
  };

  return (
    <>
      <Layout
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onCleanClick={handleCleanClick}
        onExportClick={handleExportClick}
      >
        <div className="p-6 w-full">
          <div className="flex flex-col gap-3 mb-6">
            {/* Row 1: File upload + Demo */}
            <div className="flex items-center gap-3 flex-wrap">
              <label className="btn-primary cursor-pointer">
                <Upload className="h-4 w-4" />
                Upload CSV / Excel
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileUpload}
                  className="hidden"
                  disabled={isLoading}
                />
              </label>

              <button
                onClick={handleDemoData}
                disabled={isLoading}
                className="btn-ghost"
              >
                <Zap className="h-4 w-4" />
                Demo Data
              </button>
            </div>

            {/* Row 2: SQL Upload */}
            <div className="flex items-center gap-3">
              <label className="btn-ghost cursor-pointer">
                <Database className="h-4 w-4" />
                Upload SQL DB
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
                className="px-3 py-2 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-lg text-[var(--text-primary)] text-sm flex-grow focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                disabled={isLoading}
              />
            </div>

            {/* Row 3: API Fetch */}
            <div className="flex items-center gap-3">
              <input
                type="text"
                placeholder="API URL (e.g., https://api.example.com/data)"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                className="px-3 py-2 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-lg text-[var(--text-primary)] text-sm flex-grow focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                disabled={isLoading}
              />
              <button
                onClick={handleAPIFetch}
                disabled={isLoading}
                className="btn-ghost"
              >
                <Globe className="h-4 w-4" />
                Fetch API
              </button>
            </div>

            {isLoading && (
              <div className="flex items-center gap-2 text-[var(--text-secondary)] text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Processing...</span>
              </div>
            )}
            {message && (
              <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${message.toLowerCase().includes('failed') || message.toLowerCase().includes('error')
                  ? 'bg-[var(--red-dim)] text-[var(--red)]'
                  : 'bg-[var(--green-dim)] text-[var(--green)]'
                }`}>
                {message.toLowerCase().includes('failed') || message.toLowerCase().includes('error')
                  ? <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  : <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                }
                {message}
              </div>
            )}
          </div>

          {edaData ? (
            <div className="w-full">
              <EDADisplay
                data={edaData}
                originalFile={uploadedFileRef.current}
                activeTab={activeTab}
                onTabChange={setActiveTab}
                onAIAnalyze={handleAIAnalyze}
              />
            </div>
          ) : (
            <div className="text-center py-16">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[var(--accent-dim)] mb-4">
                <FileSpreadsheet className="h-8 w-8 text-[var(--accent)]" />
              </div>
              <div className="text-[var(--text-secondary)] text-lg mb-2">Upload data to start analysis</div>
              <div className="text-sm text-[var(--text-muted)]">
                <p>Supported sources: CSV, Excel, SQL databases, APIs</p>
                <p className="mt-1">AI-powered data analysis awaits</p>
              </div>
            </div>
          )}
        </div>
      </Layout>

      {/* FLOATING CHAT BUTTON */}
      {!showChat && edaData && (
        <button
          onClick={() => setShowChat(true)}
          style={{
            position: 'fixed',
            bottom: '30px',
            right: '30px',
            zIndex: 99999,
          }}
          className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-3 rounded-full shadow-2xl flex items-center gap-2 font-semibold border-2 border-purple-300"
        >
          <MessageCircle className="h-5 w-5" />
          💬 AI Chat
        </button>
      )}

      {/* SMALL FLOATING CHAT BOX - TOP RIGHT */}
      {showChat && edaData && (
        <div style={{ position: 'fixed', top: '20px', right: '20px', width: '400px', zIndex: 99999 }}>
          <AIChat 
            data={edaData} 
            initialQuery={aiChatQuery} 
            onClose={() => {
              setShowChat(false);
              setAiChatQuery('');
            }}
          />
        </div>
      )}
    </>
  );
}