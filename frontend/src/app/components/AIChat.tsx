'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Send, Bot, User, Loader2, RefreshCw, Copy, Cpu, Code, BarChart3, Play, AlertCircle, X } from 'lucide-react';
import { langChainService, StructuredResponse } from '@/services/LangChainService';

type ChatRole = 'user' | 'assistant';

interface Message {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: Date;
  isLoading?: boolean;
  code?: string;
  chartData?: any;
  executionResult?: any;
  type?: 'text' | 'code' | 'chart' | 'suggestion' | 'execution' | 'error';
  proactiveQuestion?: string;
  domainInsights?: string;
  domain?: string;
}

interface EDADataShape {
  rows: number;
  columns: number;
}

interface EDAData {
  session_id?: string;
  filename?: string;
  shape?: EDADataShape;
  columns?: string[];
  numerical_columns?: string[];
  categorical_columns?: string[];
  missing_values?: Record<string, number>;
  auto_insights?: string[];
  outliers_iqr?: Record<string, number>;
  outliers_iso?: any;
  outliers_zscore?: Record<string, number>;
  basic_stats?: any;
  categorical_stats?: any;
  sample_data?: any[];
  correlation_chart?: string;
  distribution_plots?: { [col: string]: string };
  missingness_plots?: { [k: string]: string };
  duplicates?: any[];
  message?: string;
  full_data_preserved?: boolean;
}

interface AIChatProps {
  data: EDAData | null;
  initialQuery?: string;
  onClose?: () => void;
}

interface AIChatSession {
  messages: Message[];
  datasetContext: any;
  analysisState: {
    currentFocus: string;
    suggestedNextSteps: string[];
    completedAnalyses: string[];
    domain?: string;
  };
}

export default function AIChat({ data, initialQuery, onClose }: AIChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [hasUserAsked, setHasUserAsked] = useState(false);
  const [chatSession, setChatSession] = useState<AIChatSession>({
    messages: [],
    datasetContext: null,
    analysisState: {
      currentFocus: '',
      suggestedNextSteps: [],
      completedAnalyses: []
    }
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const datasetName = data?.filename || 'uploaded file';
  const rowCount = data?.shape?.rows ?? 0;
  const colCount = data?.shape?.columns ?? 0;
  const totalMissing = useMemo(() => {
    const missingValues = data?.missing_values || {};
    return Object.values(missingValues).reduce((sum: number, v: unknown) => {
      const value = typeof v === 'number' ? v : 0;
      return sum + value;
    }, 0);
  }, [data?.missing_values]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (initialQuery && initialQuery.trim() && data?.session_id) {
      setInput(initialQuery);
    }
  }, [initialQuery, data?.session_id]);

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_GEMINI_API_KEY || '';
    setGeminiApiKey(key.replace(/['"]/g, ''));
  }, []);

  useEffect(() => {
    if (data && messages.length === 0) {
      const numericalCount = data.numerical_columns?.length || 0;
      const categoricalCount = data.categorical_columns?.length || 0;
      const columnExamples = data.columns?.slice(0, 5).join(', ') || '';

      const columnNames = data.columns?.join(' ').toLowerCase() || '';
      let domain = 'General';
      if (columnNames.includes('price') || columnNames.includes('sales') || columnNames.includes('revenue')) {
        domain = 'Financial';
      } else if (columnNames.includes('patient') || columnNames.includes('medical') || columnNames.includes('health')) {
        domain = 'Healthcare';
      } else if (columnNames.includes('customer') || columnNames.includes('order') || columnNames.includes('product')) {
        domain = 'E-commerce';
      }

      const initialSession: AIChatSession = {
        messages: [],
        datasetContext: {
          filename: datasetName,
          shape: { rows: rowCount, columns: colCount },
          columns: data.columns || [],
          numerical_columns: data.numerical_columns || [],
          categorical_columns: data.categorical_columns || [],
          missing_values: data.missing_values || {},
          sample_data: data.sample_data?.slice(0, 2),
          basic_stats: data.basic_stats,
          outliers: data.outliers_iqr,
          duplicates_count: data.duplicates?.length,
          domain: domain
        },
        analysisState: {
          currentFocus: 'initial_analysis',
          suggestedNextSteps: [
            'Perform missing value analysis',
            'Check correlation between numerical features',
            'Explore categorical variable distributions',
            'Identify potential outliers',
            'Suggest appropriate ML models'
          ],
          completedAnalyses: [],
          domain: domain
        }
      };

      setChatSession(initialSession);

      const welcomeMessage: Message = {
        id: `${Date.now()}`,
        role: 'assistant',
        content: `🔍 **Analyzing "${datasetName}"**\n\n` +
          `📊 **Dataset Overview:**\n` +
          `• ${rowCount} rows × ${colCount} columns\n` +
          `• ${numericalCount} numerical features\n` +
          `• ${categoricalCount} categorical features\n` +
          `• ${totalMissing} missing values detected\n` +
          `• Domain: ${domain}\n` +
          `• Sample columns: ${columnExamples}${data.columns && data.columns.length > 5 ? '...' : ''}\n\n` +
          `💡 **I can help you:**\n` +
          `• Clean and preprocess this data\n` +
          `• Generate Python code for analysis\n` +
          `• Suggest ML models and provide code\n` +
          `• Create visualizations and plots\n` +
          `• Explain patterns and insights\n\n` +
          `**Try asking:** "How should I clean this data?" or "Show me Python code for correlation analysis"`,
        timestamp: new Date(),
        type: 'text',
        domain: domain
      };

      setMessages([welcomeMessage]);
      setChatSession(prev => ({
        ...prev,
        messages: [welcomeMessage]
      }));
    }
  }, [data, datasetName, rowCount, colCount, totalMissing]);

  const isCodeSafeToAutoExecute = (code: string): boolean => {
    const safePatterns = [
      /\.head\(/i, /\.describe\(/i, /\.info\(/i, /\.isna\(/i, /\.notna\(/i,
      /\.value_counts\(/i, /\.corr\(/i, /\.shape/i, /\.dtypes/i, /plt\./i, /sns\./i
    ];
    const unsafePatterns = [
      /\.to_csv\(/i, /\.to_excel\(/i, /\.write\(/i, /exec\(/i, /eval\(/i,
      /open\(/i, /system\(/i, /subprocess/i, /os\./i, /shutil/i
    ];
    for (const pattern of unsafePatterns) {
      if (pattern.test(code)) return false;
    }
    for (const pattern of safePatterns) {
      if (pattern.test(code)) return true;
    }
    return false;
  };

  const executeAndDisplayCode = async (sessionId: string, code: string, message: Message): Promise<void> => {
    try {
      const executionResult = await langChainService.executeCode(sessionId, code);
      if (executionResult.success) {
        message.executionResult = executionResult;
        if (executionResult.type === 'plot') {
          message.chartData = { type: 'image', data: executionResult.result };
          message.content += `\n\n**Generated Chart:**`;
        } else if (executionResult.type === 'text') {
          message.content += `\n\n**Output:**\n${executionResult.result}`;
        } else if (executionResult.type === 'dataframe') {
          message.content += `\n\n**Result (${executionResult.rows} rows):**\n\`\`\`\n${JSON.stringify(executionResult.result.slice(0, 3), null, 2)}\n\`\`\``;
        } else {
          message.content += `\n\n**✓** ${executionResult.result}`;
        }
      } else {
        message.content += `\n\n**Execution Error:**\n${executionResult.error}`;
        message.type = 'error';
      }
    } catch (execError) {
      console.error('Code execution failed:', execError);
      message.content += `\n\n**Failed to execute code:** ${execError}`;
      message.type = 'error';
    }
  };

  const enhancedRuleBasedAnswer = async (userMessage: string): Promise<Message> => {
    await new Promise((r) => setTimeout(r, 800));
    const ctx = chatSession.datasetContext || {};
    const q = userMessage.toLowerCase();
    const numericalCount = ctx.numerical_columns?.length || 0;
    const categoricalCount = ctx.categorical_columns?.length || 0;
    const domain = ctx.domain || 'general';
    const totalMissingValues = ctx.missing_values ? Object.values(ctx.missing_values).reduce((sum: number, v: unknown) => {
      const value = typeof v === 'number' ? v : 0;
      return sum + value;
    }, 0) : 0;

    if (q.includes('clean') || q.includes('missing') || q.includes('null')) {
      let domainAdvice = '';
      if (domain === 'financial') domainAdvice = 'For financial data, consider conservative imputation methods like forward fill.';
      else if (domain === 'healthcare') domainAdvice = 'For healthcare data, consult domain experts before imputing missing values.';
      return {
        id: `${Date.now()}-rule`, role: 'assistant',
        content: `🧹 **Data Cleaning Recommendations**\n\nFor your ${domain} dataset with ${totalMissingValues} missing values:\n\n**Immediate Actions:**\n1. Use Deep Clean feature\n2. Numerical: Impute with median/mean\n3. Categorical: Use mode or "Unknown"\n4. Remove columns >50% missing\n\n${domainAdvice}`,
        timestamp: new Date(), type: 'suggestion', domain: domain
      };
    }
    if (q.includes('model') || q.includes('train') || q.includes('predict') || q.includes('ml')) {
      const models = numericalCount >= 2 ? ['Linear Regression', 'Random Forest', 'XGBoost'] : ['Random Forest', 'CatBoost'];
      return {
        id: `${Date.now()}-rule`, role: 'assistant',
        content: `🤖 **ML Model Recommendations**\n\n• ${models.join('\n• ')}\n\n**Next Steps:**\n1. Preprocess data\n2. Feature engineering\n3. Train-validation split\n4. Model evaluation`,
        timestamp: new Date(), type: 'suggestion', domain: domain
      };
    }
    return {
      id: `${Date.now()}-rule`, role: 'assistant',
      content: `💡 I can help with:\n• Data cleaning\n• ML models\n• Python code\n• Visualizations\n• Statistical analysis`,
      timestamp: new Date(), type: 'text', domain: domain
    };
  };

  const callAIAPI = async (userMessage: string): Promise<Message> => {
    const sessionId = data?.session_id;
    const currentContext = chatSession.datasetContext;
    try {
      const response = await langChainService.enhancedLlmAnalyze({
        session_id: sessionId || '', query: userMessage, data_context: currentContext,
        chat_history: chatSession.messages.slice(-5), response_format: 'structured'
      });
      if (response.success) {
        setIsConnected(true);
        const aiResponse: Message = {
          id: `${Date.now()}-ai`, role: 'assistant', content: response.explanation,
          code: response.code, chartData: response.chartType ? { type: response.chartType, suggestion: true } : undefined,
          domainInsights: response.domainInsights, proactiveQuestion: response.proactiveQuestion,
          domain: response.domain || currentContext?.domain, timestamp: new Date(),
          type: response.code ? 'code' : response.chartType ? 'chart' : 'text'
        };
        if (response.code && isCodeSafeToAutoExecute(response.code)) {
          await executeAndDisplayCode(sessionId!, response.code, aiResponse);
        }
        return aiResponse;
      } else {
        throw new Error(response.error || 'Analysis failed');
      }
    } catch (error) {
      console.error('AI API call failed:', error);
      return await enhancedRuleBasedAnswer(userMessage);
    }
  };

  const handleExecuteCode = async (code: string, messageId: string) => {
    if (!data?.session_id) return;
    setIsLoading(true);
    try {
      const executionResult = await langChainService.executeCode(data.session_id, code);
      setMessages(prev => prev.map(msg => {
        if (msg.id === messageId) {
          return { ...msg, executionResult, content: executionResult.success ? `${msg.content}\n\n**Execution Result:**\n${JSON.stringify(executionResult.result, null, 2)}` : `${msg.content}\n\n**Execution Failed:**\n${executionResult.error}` };
        }
        return msg;
      }));
    } catch (error) { console.error('Manual execution failed:', error); }
    finally { setIsLoading(false); }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    const userMessage = input.trim();
    setHasUserAsked(true);
    const userMsg: Message = { id: `${Date.now()}-u`, role: 'user', content: userMessage, timestamp: new Date(), type: 'text' };
    const loadingMsg: Message = { id: `${Date.now()}-l`, role: 'assistant', content: '', timestamp: new Date(), isLoading: true };
    setMessages((prev) => [...prev, userMsg, loadingMsg]);
    setInput('');
    setIsLoading(true);
    try {
      const aiResponse = await callAIAPI(userMessage);
      setMessages((prev) => prev.map((m) => (m.isLoading ? aiResponse : m)));
    } catch (error: any) {
      setMessages((prev) => prev.map((m) => m.isLoading ? { ...m, content: '❌ Temporary Issue. Please try again.', isLoading: false } : m));
    } finally { setIsLoading(false); }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const copyCode = (code: string) => { navigator.clipboard.writeText(code); };

  const clearChat = () => {
    const welcome: Message = { id: `${Date.now()}`, role: 'assistant', content: `🔄 Chat Cleared. What would you like to explore?`, timestamp: new Date(), type: 'text' };
    setMessages([welcome]); setHasUserAsked(false);
  };

  const suggestedQuestions = [
    'How should I clean this dataset?', 'Show me Python code for correlation analysis',
    'What ML models should I use for this data?', 'Generate visualization code',
    'Help with feature engineering', 'Check for data quality issues',
    'Suggest next analysis steps', 'Perform outlier detection',
    'Show me statistical summaries', 'Explain the data patterns'
  ];

  const renderMessageContent = (message: Message) => {
    return (
      <div className="space-y-3">
        <div className="whitespace-pre-wrap leading-relaxed">{message.content}</div>
        {message.domainInsights && (
          <div className="bg-blue-900/20 rounded-lg p-3 border border-blue-700/30">
            <div className="flex items-center gap-2 text-blue-400 text-sm mb-2"><Cpu className="h-4 w-4" /><span>Domain Insights</span></div>
            <p className="text-blue-300 text-sm">{message.domainInsights}</p>
          </div>
        )}
        {message.code && (
          <div className="bg-gray-900 rounded-lg p-3 border border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-green-400 text-sm"><Code className="h-4 w-4" /><span>Python Code</span></div>
              <div className="flex items-center gap-2">
                <button onClick={() => handleExecuteCode(message.code!, message.id)} className="text-green-400 hover:text-green-300 flex items-center gap-1" disabled={isLoading}><Play className="h-3 w-3" /><span className="text-xs">Run</span></button>
                <button onClick={() => copyCode(message.code!)} className="text-gray-400 hover:text-white"><Copy className="h-3 w-3" /></button>
              </div>
            </div>
            <pre className="text-green-400 text-xs overflow-auto"><code>{message.code}</code></pre>
          </div>
        )}
        {message.executionResult && (
          <div className={`rounded-lg p-3 border ${message.executionResult.success ? 'bg-green-900/20 border-green-700/30' : 'bg-red-900/20 border-red-700/30'}`}>
            <pre className="text-xs overflow-auto">{JSON.stringify(message.executionResult.result, null, 2)}</pre>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="bg-gray-900 rounded-xl shadow-2xl border border-gray-700 flex flex-col h-[550px]">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-700 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Cpu className="h-4 w-4 text-purple-400" />
          <h3 className="font-bold text-sm">AI Data Scientist</h3>
          <span className="text-xs bg-purple-600 px-2 py-0.5 rounded-full">PRO</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={clearChat} className="p-1.5 hover:bg-gray-700 rounded-lg"><RefreshCw className="h-3.5 w-3.5" /></button>
          <button onClick={onClose} className="p-1.5 hover:bg-red-600 rounded-lg"><X className="h-4 w-4" /></button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.map((m) => (
          <div key={m.id} className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {m.role === 'assistant' && <div className="flex-shrink-0 w-6 h-6 bg-purple-600 rounded-full flex items-center justify-center"><Bot className="h-3 w-3 text-white" /></div>}
            <div className={`max-w-[85%] rounded-lg p-3 text-sm ${m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-100'}`}>
              {m.isLoading ? <div className="flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" /><span>Thinking...</span></div> : renderMessageContent(m)}
            </div>
            {m.role === 'user' && <div className="flex-shrink-0 w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center"><User className="h-3 w-3 text-white" /></div>}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Questions */}
      {!hasUserAsked && (
        <div className="px-3 pb-2 flex-shrink-0">
          <div className="text-xs text-gray-400 mb-1.5">Try asking:</div>
          <div className="flex flex-wrap gap-1.5">
            {suggestedQuestions.slice(0, 5).map((q, i) => (
              <button key={i} onClick={() => setInput(q)} className="text-xs bg-gray-800 hover:bg-gray-700 px-2 py-1 rounded-full border border-gray-700">{q}</button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="p-3 border-t border-gray-700 flex-shrink-0">
        <div className="flex gap-2">
          <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder="Ask about your data..." className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" disabled={isLoading} />
          <button onClick={handleSend} disabled={!input.trim() || isLoading} className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 px-3 py-2 rounded-lg"><Send className="h-4 w-4" /></button>
        </div>
      </div>
    </div>
  );
}