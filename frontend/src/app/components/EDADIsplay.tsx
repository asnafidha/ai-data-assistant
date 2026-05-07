'use client';

import React, { useEffect, useMemo, useState } from 'react';
import CleanResult from './CleanResults';
import DeepCleanModal from './DeepCleanModal';
import { langChainService } from '@/services/LangChainService';

interface EDAData {
  session_id: string;
  filename: string;
  shape: { rows: number; columns: number };
  columns: string[];
  missing_values: { [key: string]: number };
  numerical_columns: string[];
  categorical_columns: string[];
  basic_stats: Record<string, any>;
  categorical_stats: Record<string, any>;
  sample_data: any[];
  correlation_chart?: string;
  distribution_plots?: { [col: string]: string };
  missingness_plots?: { [k: string]: string };
  auto_insights?: string[];
  outliers_iqr?: { [col: string]: number };
  outliers_iso?: any;
  outliers_zscore?: { [col: string]: number };
  duplicates?: any[];
  message?: string;
  full_data_preserved?: boolean;
}

interface EDADisplayProps {
  data?: EDAData | null;
  originalFile?: File | null;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  onAIAnalyze?: (query: string) => void;
}

export default function EDADisplay({ 
  data = null, 
  originalFile = null, 
  activeTab = 'overview', 
  onTabChange,
  onAIAnalyze
}: EDADisplayProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState<EDAData | null>(null);
  const [showDeepCleanModal, setShowDeepCleanModal] = useState(false);
  const [cleanPreview, setCleanPreview] = useState<any[] | null>(null);
  const [cleanedSessionId, setCleanedSessionId] = useState<string | null>(null);
  const [samplePage, setSamplePage] = useState(0);
  const [sampleSize, setSampleSize] = useState(50);
  const [serverSample, setServerSample] = useState<any[] | null>(null);
  const [serverTotal, setServerTotal] = useState<number | null>(null);
  const [loadingSample, setLoadingSample] = useState(false);
  const [trendResult, setTrendResult] = useState<any | null>(null);
  const [columnDtypes, setColumnDtypes] = useState<Record<string, string> | null>(null);
  const [healthStatus, setHealthStatus] = useState<{status: string; sessions: number} | null>(null);
  
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  
  // Get current data with proper typing
  const currentData: EDAData | null = data || uploadResult;

  // Handle file upload and analysis
  const handleUpload = async () => {
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/eda', {
        method: 'POST',
        body: formData,
      });
      const resultData = await res.json();
      setUploadResult(resultData);
      
      // Check backend health
      const health = await langChainService.getHealth();
      setHealthStatus(health);
      
    } catch (error) {
      console.error(error);
    }
  };

  // fetch server-side sample when sample tab opens
  useEffect(() => {
    if (activeTab === 'sample' && currentData?.session_id) {
      fetchServerSample(samplePage, sampleSize);
    }
  }, [activeTab, samplePage, sampleSize, currentData?.session_id]);

  // Check backend health on mount
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const health = await langChainService.getHealth();
        setHealthStatus(health);
      } catch (error) {
        console.error('Health check failed:', error);
      }
    };
    
    checkHealth();
  }, []);

  const fetchServerSample = async (page: number, size: number) => {
    if (!currentData?.session_id) return;
    setLoadingSample(true);
    try {
      const res = await fetch(`${API_BASE}/api/sample?session_id=${encodeURIComponent(currentData.session_id)}&page=${page}&size=${size}`);
      const json = await res.json();
      if (!json.error) {
        setServerSample(json.data || []);
        setServerTotal(json.total || 0);
      }
    } catch (e) {
      console.error('sample fetch failed', e);
    } finally {
      setLoadingSample(false);
    }
  };

  const handleDeepClean = async () => {
    if (!originalFile) return alert('Original file missing. Re-upload to deep-clean.');
    setShowDeepCleanModal(false);
    try {
      const form = new FormData();
      form.append('file', originalFile);
      form.append('cleanup_column_names', 'true');
      form.append('handle_missing_values', 'flag');
      form.append('detect_data_types', 'true');
      form.append('trim_whitespace', 'true');
      form.append('drop_duplicates', 'true');

      const res = await fetch(`${API_BASE}/api/clean-data`, { method: 'POST', body: form });
      const json = await res.json();
      if (json.error) return alert('Deep clean failed: ' + json.error);
      setCleanPreview(json.cleaned_data || []);
      setCleanedSessionId(json.cleaned_session_id || null);
      onTabChange?.('deepclean');
    } catch (e) {
      console.error(e);
      alert('Deep clean failed (see console).');
    }
  };

  const handleExport = () => {
    if (!cleanedSessionId) return alert('No cleaned result to export. Run Deep Clean first.');
    const url = `${API_BASE}/export-clean?cleaned_session_id=${encodeURIComponent(cleanedSessionId)}`;
    window.open(url, '_blank');
  };

  const runTrend = async (xCol: string, yCol: string) => {
    if (!currentData?.session_id) return alert('No session id');
    try {
      const form = new FormData();
      form.append('x_col', xCol);
      form.append('y_col', yCol);
      const res = await fetch(`${API_BASE}/trend?session_id=${encodeURIComponent(currentData.session_id)}`, { method: 'POST', body: form });
      const json = await res.json();
      if (json.error) return alert('Trend error: ' + json.error);
      setTrendResult(json);
      onTabChange?.('visuals');
    } catch (e) {
      console.error(e);
      alert('Trend failed');
    }
  };

  const fetchColumnDtypes = async () => {
    if (!currentData?.session_id) return;
    try {
      const res = await fetch(`${API_BASE}/columns?session_id=${encodeURIComponent(currentData.session_id)}`);
      const json = await res.json();
      if (!json.error) setColumnDtypes(json.dtypes || null);
    } catch (e) {
      console.error('columns fetch failed', e);
    }
  };

  // AI Analysis shortcuts
  const handleAIAnalysis = (question: string) => {
    if (onAIAnalyze) {
      onAIAnalyze(question);
    }
  };

  // when columns tab opened, fetch dtypes
  useEffect(() => {
    if (activeTab === 'columns' && currentData?.session_id) {
      fetchColumnDtypes();
    }
  }, [activeTab, currentData?.session_id]);

  // Memoized values with safe defaults
  const numericalSampleCols = useMemo(() => currentData?.numerical_columns || [], [currentData]);
  const safeNumericalColumns = currentData?.numerical_columns || [];
  const safeCategoricalColumns = currentData?.categorical_columns || [];
  const safeBasicStats = currentData?.basic_stats || {};
  const safeCategoricalStats = currentData?.categorical_stats || {};
  const safeMissingValues = currentData?.missing_values || {};
  const safeColumns = currentData?.columns || [];
  const safeDuplicates = currentData?.duplicates || [];
  const safeOutliersIqr = currentData?.outliers_iqr || {};
  const safeOutliersIso = currentData?.outliers_iso || {};
  const safeOutliersZscore = currentData?.outliers_zscore || {};
  const safeAutoInsights = currentData?.auto_insights || [];
  const safeDistributionPlots = currentData?.distribution_plots || {};
  const safeMissingnessPlots = currentData?.missingness_plots || {};

  // If no data is available, show the upload interface
  if (!currentData) {
    return (
      <div className="p-6 space-y-4">
        <input
          type="file"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="mb-4 p-2 border rounded"
        />
        <button
          onClick={handleUpload}
          className="bg-green-600 text-white px-4 py-2 rounded-lg"
        >
          Upload & Analyze
        </button>

        {uploadResult && (
          <div className="mt-6 p-4 border rounded-lg bg-gray-50">
            <h2 className="text-lg font-bold">Results for {uploadResult.filename}</h2>
            <p>
              Shape: {uploadResult.shape.rows} rows × {uploadResult.shape.columns} columns
            </p>
            <p>Columns: {uploadResult.columns.join(', ')}</p>
            <p>Numerical: {uploadResult.numerical_columns.join(', ')}</p>
            <p>Categorical: {uploadResult.categorical_columns.join(', ')}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-gray-900 rounded-xl shadow-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold">📊 {currentData.filename || 'Unknown file'}</h2>
          <div className="text-sm text-gray-400">{currentData.shape?.rows || 0} rows × {currentData.shape?.columns || 0} cols</div>
          {healthStatus && (
            <div className="text-xs mt-1">
              <span className={`px-2 py-1 rounded ${
                healthStatus.status === 'healthy' ? 'bg-green-600' : 'bg-red-600'
              }`}>
                Backend: {healthStatus.status} ({healthStatus.sessions} sessions)
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowDeepCleanModal(true)} className="px-3 py-2 bg-purple-600 rounded">Deep Clean</button>
          <button onClick={handleExport} className="px-3 py-2 bg-green-600 rounded">Export Clean</button>
        </div>
      </div>

      {showDeepCleanModal && <DeepCleanModal onClose={() => setShowDeepCleanModal(false)} onConfirm={handleDeepClean} />}

      {/* Tabs */}
      <div className="flex gap-2 mb-3 overflow-x-auto">
        {['overview','missing','stats','sample','visuals','insights','outliers','duplicates','columns','deepclean'].map(tab => (
          <button
            key={tab}
            onClick={() => onTabChange?.(tab)}
            className={`px-3 py-1 rounded ${activeTab===tab ? 'bg-purple-600' : 'bg-gray-700 hover:bg-gray-600'}`}
          >
            {tab === 'deepclean' ? 'Clean Result' : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-2 bg-black rounded min-h-[220px] max-h-[720px] overflow-auto">
        {activeTab === 'overview' && (
          <div>
            <p><strong>File:</strong> {currentData.filename || 'Unknown'}</p>
            <p><strong>Shape:</strong> {currentData.shape?.rows || 0} rows × {currentData.shape?.columns || 0} cols</p>
            <p className="mt-2"><strong>Numerical:</strong> {safeNumericalColumns.join(', ') || 'None'}</p>
            <p><strong>Categorical:</strong> {safeCategoricalColumns.join(', ') || 'None'}</p>
            {currentData.message && <p className="text-green-400 mt-2">{currentData.message}</p>}
            
            {/* AI Analysis Quick Actions */}
            <div className="mt-4 p-3 bg-gray-800 rounded">
              <h4 className="font-semibold mb-2">🤖 AI Analysis Quick Actions</h4>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => handleAIAnalysis('How should I clean this dataset?')} className="text-xs bg-blue-600 px-2 py-1 rounded">
                  Clean Data
                </button>
                <button onClick={() => handleAIAnalysis('Show me correlation analysis')} className="text-xs bg-green-600 px-2 py-1 rounded">
                  Correlations
                </button>
                <button onClick={() => handleAIAnalysis('Detect outliers and anomalies')} className="text-xs bg-red-600 px-2 py-1 rounded">
                  Find Outliers
                </button>
                <button onClick={() => handleAIAnalysis('Suggest ML models for this data')} className="text-xs bg-purple-600 px-2 py-1 rounded">
                  ML Models
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'missing' && (
          <div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {safeMissingnessPlots?.matrix && <img src={safeMissingnessPlots.matrix} alt="missing matrix" className="rounded w-full" />}
              {safeMissingnessPlots?.bar && <img src={safeMissingnessPlots.bar} alt="missing bar" className="rounded w-full" />}
            </div>
            <div className="mt-4">
              <h4 className="font-semibold mb-2">Missing counts</h4>
              <table className="w-full text-sm">
                <thead><tr className="text-left text-gray-300"><th>Column</th><th>Missing</th><th>Action</th></tr></thead>
                <tbody>
                  {Object.entries(safeMissingValues).map(([c, v]) => (
                    <tr key={c}>
                      <td className="py-1">{c}</td>
                      <td>{v}</td>
                      <td>
                        {v > 0 && (
                          <button 
                            onClick={() => handleAIAnalysis(`How should I handle missing values in ${c}?`)}
                            className="text-xs bg-blue-600 px-2 py-1 rounded"
                          >
                            Fix
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'stats' && (
          <div className="space-y-6">
            {/* Numerical statistics */}
            <div>
              <h4 className="font-semibold mb-2">Numerical statistics</h4>
              {Object.keys(safeBasicStats).length > 0 ? (
                <div className="overflow-auto max-h-[360px]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-800">
                        <th>Feature</th><th>Count</th><th>Mean</th>
                        <th>Std</th><th>Min</th><th>Max</th>
                        <th>Analyze</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(safeBasicStats).map(([col, stats]: any) => (
                        <tr key={col}>
                          <td className="p-1">{col}</td>
                          <td className="p-1">{stats.count}</td>
                          <td className="p-1">{Number(stats.mean ?? 0).toFixed(2)}</td>
                          <td className="p-1">{Number(stats.std ?? 0).toFixed(2)}</td>
                          <td className="p-1">{stats.min}</td>
                          <td className="p-1">{stats.max}</td>
                          <td className="p-1">
                            <button 
                              onClick={() => handleAIAnalysis(`Analyze the distribution of ${col}`)}
                              className="text-xs bg-purple-600 px-2 py-1 rounded"
                            >
                              AI
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-gray-400">No numerical stats available</div>
              )}
            </div>

            {/* Categorical statistics */}
            <div>
              <h4 className="font-semibold mb-2">Categorical statistics</h4>
              {Object.keys(safeCategoricalStats).length > 0 ? (
                <div className="space-y-4">
                  {Object.entries(safeCategoricalStats).map(([col, values]: any) => (
                    <div key={col}>
                      <div className="flex justify-between items-center">
                        <p className="font-semibold">{col}</p>
                        <button 
                          onClick={() => handleAIAnalysis(`Analyze the categorical variable ${col}`)}
                          className="text-xs bg-purple-600 px-2 py-1 rounded"
                        >
                          AI Analysis
                        </button>
                      </div>
                      <table className="w-full text-sm border border-gray-700 mb-2">
                        <thead>
                          <tr className="bg-gray-800">
                            <th>Value</th><th>Count</th><th>%</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(values || {}).slice(0, 5).map(([val, cnt]: any) => (
                            <tr key={val}>
                              <td className="p-1">{val}</td>
                              <td className="p-1">{cnt}</td>
                              <td className="p-1">{((cnt / currentData.shape.rows) * 100).toFixed(1)}%</td>
                            </tr>
                          ))}
                          {Object.keys(values || {}).length > 5 && (
                            <tr>
                              <td colSpan={3} className="p-1 text-center text-gray-400">
                                ... and {Object.keys(values || {}).length - 5} more values
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-gray-400">No categorical stats available</div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'sample' && (
          <div>
            <div className="flex items-center gap-3 mb-2">
              <label className="text-sm text-gray-300">Rows per page:</label>
              <select value={sampleSize} onChange={(e) => { setSampleSize(Number(e.target.value)); setSamplePage(0); }} className="bg-black border border-gray-700 px-2 py-1">
                {[20,50,100,200].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              <button 
                onClick={() => handleAIAnalysis('Analyze patterns in this sample data')}
                className="text-xs bg-purple-600 px-2 py-1 rounded ml-auto"
              >
                AI Analyze Sample
              </button>
            </div>

            {loadingSample ? <div>Loading…</div> : serverSample && serverSample.length > 0 ? (
              <>
                <div className="overflow-auto max-h-[360px] border border-gray-700 rounded p-1 bg-gray-800">
                  <table className="min-w-full">
                    <thead><tr className="bg-gray-700">
                      {Object.keys(serverSample[0]).map(k => <th key={k} className="px-2 py-1 text-left">{k}</th>)}
                    </tr></thead>
                    <tbody>
                      {serverSample.map((row, i) => (
                        <tr key={i} className="border-b">
                          {Object.keys(serverSample[0]).map((k) => <td key={k} className="px-2 py-1">{String(row[k] ?? '')}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex justify-between items-center mt-2">
                  <button onClick={() => setSamplePage(p => Math.max(p-1, 0))} disabled={samplePage === 0} className="px-3 py-1 bg-gray-700 rounded">◀ Prev</button>
                  <div>Page {samplePage+1}{serverTotal ? ` of ${Math.ceil(serverTotal / sampleSize)}` : ''}</div>
                  <button onClick={() => setSamplePage(p => (serverTotal && (p+1)*sampleSize < serverTotal ? p+1 : p))} disabled={!serverTotal || (samplePage+1)*sampleSize >= (serverTotal||0)} className="px-3 py-1 bg-gray-700 rounded">Next ▶</button>
                </div>
              </>
            ) : <div className="text-gray-400">No sample data available. Open Upload tab and ensure you uploaded file.</div>}
          </div>
        )}

        {activeTab === 'visuals' && (
          <div>
            {currentData.correlation_chart && (
              <div className="mb-4">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="font-semibold">Correlation Heatmap</h4>
                  <button 
                    onClick={() => handleAIAnalysis('Explain the correlation patterns in this heatmap')}
                    className="text-xs bg-purple-600 px-2 py-1 rounded"
                  >
                    AI Explain
                  </button>
                </div>
                <img src={currentData.correlation_chart} alt="corr" className="w-full rounded" />
              </div>
            )}
            
            <div className="mb-3">
              <h4 className="font-semibold">Quick trend (linear regression)</h4>
              <div className="flex gap-2 mb-2">
                <select id="xcol" className="bg-black border border-gray-700 px-2 py-1">
                  <option value="">Choose X</option>
                  {numericalSampleCols.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select id="ycol" className="bg-black border border-gray-700 px-2 py-1">
                  <option value="">Choose Y</option>
                  {numericalSampleCols.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <button onClick={() => {
                  const x = (document.getElementById('xcol') as HTMLSelectElement).value;
                  const y = (document.getElementById('ycol') as HTMLSelectElement).value;
                  if (!x || !y) return alert('Choose both columns');
                  runTrend(x, y);
                }} className="px-3 py-1 bg-indigo-600 rounded">Run Trend</button>
              </div>
              {trendResult && (
                <div className="mt-3 p-3 bg-gray-800 rounded">
                  <div>Slope: {trendResult.slope?.toFixed(4)} | Intercept: {trendResult.intercept?.toFixed(4)}</div>
                  <button 
                    onClick={() => handleAIAnalysis(`Interpret this trend: slope ${trendResult.slope?.toFixed(4)}, intercept ${trendResult.intercept?.toFixed(4)} between ${(document.getElementById('xcol') as HTMLSelectElement).value} and ${(document.getElementById('ycol') as HTMLSelectElement).value}`)}
                    className="text-xs bg-purple-600 px-2 py-1 rounded mt-2"
                  >
                    AI Interpretation
                  </button>
                </div>
              )}
            </div>

            <div>
              <h4 className="font-semibold mb-2">Distribution Plots</h4>
              {Object.entries(safeDistributionPlots).map(([col, img]) => (
                <div key={col} className="mb-4">
                  <div className="flex justify-between items-center mb-2">
                    <p className="font-semibold">{col}</p>
                    <button 
                      onClick={() => handleAIAnalysis(`Analyze the distribution of ${col}`)}
                      className="text-xs bg-purple-600 px-2 py-1 rounded"
                    >
                      AI Analyze
                    </button>
                  </div>
                  <img src={img as string} alt={col} className="rounded w-full" />
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'insights' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h4 className="font-semibold">Auto Insights</h4>
              <button 
                onClick={() => handleAIAnalysis('Provide detailed analysis based on these insights')}
                className="text-xs bg-purple-600 px-2 py-1 rounded"
              >
                Deep Analysis
              </button>
            </div>
            <ul className="list-disc pl-6">
              {safeAutoInsights.map((ins: string, i: number) => (
                <li key={i} className="mb-2 cursor-pointer hover:text-purple-300" onClick={() => {
                  if (ins.toLowerCase().includes('missing')) setShowDeepCleanModal(true);
                  else handleAIAnalysis(ins);
                }}>
                  {ins}
                </li>
              ))}
            </ul>
          </div>
        )}

        {activeTab === 'outliers' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h4 className="font-semibold">Outlier Detection</h4>
              <button 
                onClick={() => handleAIAnalysis('Analyze all outliers and suggest treatment strategies')}
                className="text-xs bg-purple-600 px-2 py-1 rounded"
              >
                AI Outlier Analysis
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-gray-800 p-3 rounded">
                <h5 className="font-semibold text-green-400 mb-2">IQR Method</h5>
                {Object.keys(safeOutliersIqr).length > 0 ? (
                  <table className="w-full text-sm"><tbody>
                    {Object.entries(safeOutliersIqr).map(([col, cnt]) => 
                      cnt > 0 ? <tr key={col}><td className="p-1">{col}</td><td className="p-1">{cnt}</td></tr> : null
                    )}
                  </tbody></table>
                ) : <div className="text-gray-400">No outliers</div>}
              </div>
              
              <div className="bg-gray-800 p-3 rounded">
                <h5 className="font-semibold text-blue-400 mb-2">Isolation Forest</h5>
                {safeOutliersIso?.count > 0 ? (
                  <div>{safeOutliersIso.count} outliers detected</div>
                ) : <div className="text-gray-400">No outliers</div>}
              </div>
              
              <div className="bg-gray-800 p-3 rounded">
                <h5 className="font-semibold text-yellow-400 mb-2">Z-Score (σ=3)</h5>
                {Object.keys(safeOutliersZscore).length > 0 ? (
                  <table className="w-full text-sm"><tbody>
                    {Object.entries(safeOutliersZscore).map(([col, cnt]) => 
                      cnt > 0 ? <tr key={col}><td className="p-1">{col}</td><td className="p-1">{cnt}</td></tr> : null
                    )}
                  </tbody></table>
                ) : <div className="text-gray-400">No outliers</div>}
              </div>
            </div>

            <div>
              <h5 className="font-semibold mb-2">IsolationForest Sample</h5>
              {safeOutliersIso?.sample ? (
                <div className="overflow-auto max-h-[220px]">
                  <table className="min-w-full">
                    <thead><tr className="bg-gray-700">{Object.keys(safeOutliersIso.sample[0] || {}).map(k => <th key={k} className="px-2 py-1">{k}</th>)}</tr></thead>
                    <tbody>
                      {safeOutliersIso.sample.map((r: any, i: number) => <tr key={i}>{Object.keys(safeOutliersIso.sample[0]).map((k) => <td key={k} className="px-2 py-1">{String(r[k] ?? '')}</td>)}</tr>)}
                    </tbody>
                  </table>
                </div>
              ) : <div className="text-gray-400">No isolation outlier sample</div>}
            </div>
          </div>
        )}

        {activeTab === 'duplicates' && (
          <div>
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-lg font-bold">🔍 Duplicates</h3>
              <button 
                onClick={() => handleAIAnalysis('Analyze these duplicate rows and suggest handling strategies')}
                className="text-xs bg-purple-600 px-2 py-1 rounded"
              >
                AI Analysis
              </button>
            </div>
            {safeDuplicates.length > 0 ? (
              <div className="overflow-auto max-h-[300px] border border-gray-700 rounded p-2 bg-gray-800">
                <table className="min-w-full border-collapse">
                  <thead>
                    <tr className="bg-gray-700">
                      {Object.keys(safeDuplicates[0] || {}).map((col) => (
                        <th key={col} className="px-2 py-1 border border-gray-600 text-left text-sm">{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {safeDuplicates.map((row: any, i: number) => (
                      <tr key={i} className="border-b border-gray-700">
                        {Object.keys(row).map((col) => (
                          <td key={col} className="px-2 py-1 border border-gray-600 text-sm">{String(row[col] ?? '')}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-gray-400">✅ No duplicates detected.</p>
            )}
          </div>
        )}

        {activeTab === 'columns' && (
          <div>
            <div className="flex justify-between items-center mb-2">
              <h4 className="font-semibold">Columns & types</h4>
              <button 
                onClick={() => handleAIAnalysis('Analyze the schema and suggest data type optimizations')}
                className="text-xs bg-purple-600 px-2 py-1 rounded"
              >
                AI Schema Analysis
              </button>
            </div>
            <div className="overflow-auto max-h-[360px]">
              <table className="w-full text-sm">
                <thead><tr className="bg-gray-800"><th>Column</th><th>Type</th><th>Analyze</th></tr></thead>
                <tbody>
                  {safeColumns.map((c: string) => (
                    <tr key={c}>
                      <td className="p-1">{c}</td>
                      <td className="p-1">{columnDtypes ? columnDtypes[c] : '—'}</td>
                      <td className="p-1">
                        <button 
                          onClick={() => handleAIAnalysis(`Analyze column ${c} with type ${columnDtypes ? columnDtypes[c] : 'unknown'}`)}
                          className="text-xs bg-purple-600 px-2 py-1 rounded"
                        >
                          AI
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'deepclean' && (
          <div>
            <div className="flex justify-between items-center mb-2">
              <h4 className="font-semibold">Deep Clean Preview</h4>
              <button 
                onClick={() => handleAIAnalysis('Analyze the cleaned data and suggest further improvements')}
                className="text-xs bg-purple-600 px-2 py-1 rounded"
              >
                AI Quality Check
              </button>
            </div>
            {cleanPreview ? <CleanResult data={cleanPreview} /> : <div className="text-gray-400">No cleaned preview yet. Use Deep Clean button.</div>}
            {cleanedSessionId && <div className="mt-2 text-sm text-gray-300">Cleaned session id: {cleanedSessionId}</div>}
          </div>
        )}
      </div>
    </div>
  );
}