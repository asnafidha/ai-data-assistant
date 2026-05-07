'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Send, Bot, User, Loader2, RefreshCw, Copy, Cpu, Code, BarChart3, Play, AlertCircle } from 'lucide-react';
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

export default function AIChat({ data, initialQuery }: AIChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [geminiApiKey, setGeminiApiKey] = useState('');
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

  // Add this useEffect to handle initial queries
  useEffect(() => {
    if (initialQuery && initialQuery.trim() && data?.session_id && messages.length <= 2) {
      setInput(initialQuery);
      // Auto-send the query after a brief delay
      const timer = setTimeout(() => {
        handleSend();
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [initialQuery, data?.session_id, messages.length]);

  // Load Gemini API key from environment
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_GEMINI_API_KEY || '';
    setGeminiApiKey(key.replace(/['"]/g, ''));
  }, []);

  // Initialize chat session with dataset context
  useEffect(() => {
    if (data && messages.length === 0) {
      const numericalCount = data.numerical_columns?.length || 0;
      const categoricalCount = data.categorical_columns?.length || 0;
      const columnExamples = data.columns?.slice(0, 5).join(', ') || '';
      
      // Detect domain based on column names
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

  // Check if code is safe to auto-execute
  const isCodeSafeToAutoExecute = (code: string): boolean => {
    // Simple checks for safe operations
    const safePatterns = [
      /\.head\(/i,
      /\.describe\(/i,
      /\.info\(/i,
      /\.isna\(/i,
      /\.notna\(/i,
      /\.value_counts\(/i,
      /\.corr\(/i,
      /\.shape/i,
      /\.dtypes/i,
      /plt\./i,
      /sns\./i
    ];
    
    const unsafePatterns = [
      /\.to_csv\(/i,
      /\.to_excel\(/i,
      /\.write\(/i,
      /exec\(/i,
      /eval\(/i,
      /open\(/i,
      /system\(/i,
      /subprocess/i,
      /os\./i,
      /shutil/i
    ];

    // Check for unsafe patterns
    for (const pattern of unsafePatterns) {
      if (pattern.test(code)) {
        return false;
      }
    }

    // Check for at least one safe pattern
    for (const pattern of safePatterns) {
      if (pattern.test(code)) {
        return true;
      }
    }

    return false;
  };

  // Execute code and update message with results
  const executeAndDisplayCode = async (sessionId: string, code: string, message: Message): Promise<void> => {
    try {
      const executionResult = await langChainService.executeCode(sessionId, code);
      
      if (executionResult.success) {
        message.executionResult = executionResult;
        
        if (executionResult.type === 'plot') {
          // It's a plot, show the image
          message.chartData = { type: 'image', data: executionResult.result };
          message.content += `\n\n**Generated Chart:**`;
        } else if (executionResult.type === 'text') {
          // It's text output, append it
          message.content += `\n\n**Output:**\n${executionResult.result}`;
        } else if (executionResult.type === 'dataframe') {
          // Show dataframe sample
          message.content += `\n\n**Result (${executionResult.rows} rows):**\n\`\`\`\n${JSON.stringify(executionResult.result.slice(0, 3), null, 2)}\n\`\`\``;
        } else {
          // Success message
          message.content += `\n\n**✓** ${executionResult.result}`;
        }
      } else {
        // Execution failed, append the error
        message.content += `\n\n**Execution Error:**\n${executionResult.error}`;
        message.type = 'error';
      }
    } catch (execError) {
      console.error('Code execution failed:', execError);
      message.content += `\n\n**Failed to execute code:** ${execError}`;
      message.type = 'error';
    }
  };

  // Enhanced rule-based answers with domain context
  const enhancedRuleBasedAnswer = async (userMessage: string): Promise<Message> => {
    await new Promise((r) => setTimeout(r, 800));
    
    const ctx = chatSession.datasetContext || {};
    const q = userMessage.toLowerCase();
    const numericalCount = ctx.numerical_columns?.length || 0;
    const categoricalCount = ctx.categorical_columns?.length || 0;
    const domain = ctx.domain || 'general';

    // Calculate total missing values safely
    const totalMissingValues = ctx.missing_values ? Object.values(ctx.missing_values).reduce((sum: number, v: unknown) => {
      const value = typeof v === 'number' ? v : 0;
      return sum + value;
    }, 0) : 0;

    // Domain-specific responses
    if (q.includes('clean') || q.includes('missing') || q.includes('null')) {
      let domainAdvice = '';
      if (domain === 'financial') {
        domainAdvice = 'For financial data, consider conservative imputation methods like forward fill for time series data.';
      } else if (domain === 'healthcare') {
        domainAdvice = 'For healthcare data, consult domain experts before imputing missing values as they may carry clinical significance.';
      }

      return {
        id: `${Date.now()}-rule`,
        role: 'assistant',
        content: `🧹 **Data Cleaning Recommendations**\n\nFor your ${domain} dataset with ${totalMissingValues} missing values:\n\n` +
                `**Immediate Actions:**\n` +
                `1. Use Deep Clean feature for automated processing\n` +
                `2. For numerical columns: Impute with median/mean\n` +
                `3. For categorical columns: Use mode or "Unknown" category\n` +
                `4. Consider removing columns with >50% missing values\n\n` +
                `${domainAdvice}\n\n` +
                `**Python Code Suggestion:**\n"Would you like me to generate Python code for handling missing values?"`,
        timestamp: new Date(),
        type: 'suggestion',
        domain: domain
      };
    }

    if (q.includes('model') || q.includes('train') || q.includes('predict') || q.includes('ml')) {
      const models = [];
      if (numericalCount >= 2) models.push('Linear Regression', 'Random Forest', 'XGBoost');
      if (categoricalCount >= 1) models.push('Random Forest', 'CatBoost', 'LightGBM');
      if (numericalCount >= 3) models.push('Gradient Boosting', 'Neural Networks');

      let domainModels = '';
      if (domain === 'financial') {
        domainModels = 'For financial forecasting, consider ARIMA, Prophet, or LSTM models for time series data.';
      } else if (domain === 'healthcare') {
        domainModels = 'For healthcare prediction, consider logistic regression, random forests, or gradient boosting with proper cross-validation.';
      }

      return {
        id: `${Date.now()}-rule`,
        role: 'assistant',
        content: `🤖 **ML Model Recommendations**\n\nBased on your ${domain} data (${numericalCount} numerical, ${categoricalCount} categorical features):\n\n` +
                `**Top Model Choices:**\n${models.slice(0, 4).map(m => `• ${m}`).join('\n')}\n\n` +
                `${domainModels}\n\n` +
                `**Next Steps:**\n` +
                `1. Preprocess data (handle missing values, encoding)\n` +
                `2. Feature engineering\n` +
                `3. Train-validation split\n` +
                `4. Model training and evaluation\n\n` +
                `**Python Code Ready:**\n"I can generate complete ML pipeline code for you. Just ask!"`,
        timestamp: new Date(),
        type: 'suggestion',
        domain: domain
      };
    }

    // Add more domain-specific responses here...

    return {
      id: `${Date.now()}-rule`,
      role: 'assistant',
      content: `💡 **I understand you're asking about:**\n"${userMessage}"\n\n` +
              `**I can provide specific help with:**\n` +
              `• Data cleaning and preprocessing advice\n` +
              `• Machine learning model recommendations\n` +
              `• Python code generation\n` +
              `• Visualization suggestions\n` +
              `• Statistical analysis guidance\n\n` +
              `**Try being more specific or use the suggestions below!**`,
      timestamp: new Date(),
      type: 'text',
      domain: domain
    };
  };

  // Enhanced AI response with structured output and code execution
  const callAIAPI = async (userMessage: string): Promise<Message> => {
    const sessionId = data?.session_id;
    const currentContext = chatSession.datasetContext;
    
    try {
      // Use enhanced LLM analysis with structured response
      const response = await langChainService.enhancedLlmAnalyze({
        session_id: sessionId || '',
        query: userMessage,
        data_context: currentContext,
        chat_history: chatSession.messages.slice(-5),
        response_format: 'structured'
      });

      if (response.success) {
        setIsConnected(true);
        
        const aiResponse: Message = {
          id: `${Date.now()}-ai`,
          role: 'assistant',
          content: response.explanation,
          code: response.code,
          chartData: response.chartType ? { type: response.chartType, suggestion: true } : undefined,
          domainInsights: response.domainInsights,
          proactiveQuestion: response.proactiveQuestion,
          domain: response.domain || currentContext?.domain,
          timestamp: new Date(),
          type: response.code ? 'code' : response.chartType ? 'chart' : 'text'
        };

        // Execute code automatically if it's simple and safe
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

  // Manual code execution handler
  const handleExecuteCode = async (code: string, messageId: string) => {
    if (!data?.session_id) return;
    
    setIsLoading(true);
    try {
      const executionResult = await langChainService.executeCode(data.session_id, code);
      
      setMessages(prev => prev.map(msg => {
        if (msg.id === messageId) {
          return {
            ...msg,
            executionResult,
            content: executionResult.success ? 
              `${msg.content}\n\n**Execution Result:**\n${JSON.stringify(executionResult.result, null, 2)}` :
              `${msg.content}\n\n**Execution Failed:**\n${executionResult.error}`
          };
        }
        return msg;
      }));
    } catch (error) {
      console.error('Manual execution failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    const userMsg: Message = {
      id: `${Date.now()}-u`,
      role: 'user',
      content: userMessage,
      timestamp: new Date(),
      type: 'text'
    };

    const loadingMsg: Message = {
      id: `${Date.now()}-l`,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isLoading: true,
    };

    setMessages((prev) => [...prev, userMsg, loadingMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const aiResponse = await callAIAPI(userMessage);
      
      setMessages((prev) =>
        prev.map((m) => (m.isLoading ? aiResponse : m))
      );

      // Update chat session with new context
      setChatSession(prev => ({
        ...prev,
        messages: [...prev.messages, userMsg, aiResponse],
        analysisState: {
          ...prev.analysisState,
          currentFocus: userMessage.toLowerCase(),
          suggestedNextSteps: generateNextSteps(userMessage, aiResponse)
        }
      }));

    } catch (error: any) {
      console.error('Chat error:', error);
      setMessages((prev) =>
        prev.map((m) =>
          m.isLoading
            ? {
                ...m,
                content: '❌ **Temporary Issue**\n\nPlease try again or check your connection.',
                isLoading: false,
              }
            : m
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const generateNextSteps = (userMessage: string, response: Message): string[] => {
    const q = userMessage.toLowerCase();
    const steps = [];

    if (q.includes('clean') || response.content.includes('missing')) {
      steps.push('Show Python code for missing value handling', 'Run automated data cleaning', 'Check outlier treatment');
    }

    if (q.includes('model') || response.content.includes('ML')) {
      steps.push('Generate complete ML pipeline code', 'Show model evaluation metrics', 'Suggest hyperparameter tuning');
    }

    if (q.includes('visual') || response.content.includes('plot')) {
      steps.push('Create correlation heatmap', 'Generate distribution plots', 'Build interactive dashboard');
    }

    if (q.includes('python') || response.code) {
      steps.push('Export Python script', 'Modify code for specific needs', 'Run code in notebook');
    }

    // Domain-specific next steps
    const domain = response.domain || 'general';
    if (domain === 'financial') {
      steps.push('Analyze time series trends', 'Calculate financial ratios', 'Perform risk analysis');
    } else if (domain === 'healthcare') {
      steps.push('Analyze patient demographics', 'Calculate prevalence rates', 'Perform survival analysis');
    }

    return steps.length > 0 ? steps : [
      'Explore data patterns',
      'Check data quality',
      'Suggest visualizations',
      'Recommend ML models'
    ];
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const copyMessage = (content: string) => {
    navigator.clipboard.writeText(content);
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
  };

  const clearChat = () => {
    const numericalCount = data?.numerical_columns?.length || 0;
    const categoricalCount = data?.categorical_columns?.length || 0;
    const domain = chatSession.datasetContext?.domain || 'general';
    
    const welcome: Message = {
      id: `${Date.now()}`,
      role: 'assistant',
      content: `🔄 **Chat Cleared**\n\nReady to analyze "${datasetName}"\n• ${numericalCount} numerical features\n• ${categoricalCount} categorical features\n• ${totalMissing} missing values\n• Domain: ${domain}\n\nWhat would you like to explore?`,
      timestamp: new Date(),
      type: 'text',
      domain: domain
    };
    
    setMessages([welcome]);
    setChatSession({
      messages: [welcome],
      datasetContext: chatSession.datasetContext,
      analysisState: {
        currentFocus: '',
        suggestedNextSteps: [],
        completedAnalyses: [],
        domain: domain
      }
    });
  };

  const suggestedQuestions = [
    'How should I clean this dataset?',
    'Show me Python code for correlation analysis',
    'What ML models should I use for this data?',
    'Generate visualization code',
    'Help with feature engineering',
    'Check for data quality issues',
    'Suggest next analysis steps',
    'Perform outlier detection',
    'Show me statistical summaries',
    'Explain the data patterns'
  ];

  const renderMessageContent = (message: Message) => {
    return (
      <div className="space-y-3">
        {/* Main text content */}
        <div className="whitespace-pre-wrap leading-relaxed">
          {message.content}
        </div>

        {/* Domain insights */}
        {message.domainInsights && (
          <div className="bg-blue-900/20 rounded-lg p-3 border border-blue-700/30">
            <div className="flex items-center gap-2 text-blue-400 text-sm mb-2">
              <Cpu className="h-4 w-4" />
              <span>Domain Insights</span>
            </div>
            <p className="text-blue-300 text-sm">{message.domainInsights}</p>
          </div>
        )}

        {/* Proactive question */}
        {message.proactiveQuestion && (
          <div className="bg-purple-900/20 rounded-lg p-3 border border-purple-700/30">
            <div className="flex items-center gap-2 text-purple-400 text-sm mb-2">
              <AlertCircle className="h-4 w-4" />
              <span>Question</span>
            </div>
            <p className="text-purple-300 text-sm">{message.proactiveQuestion}</p>
          </div>
        )}

        {/* Code block */}
        {message.code && (
          <div className="bg-gray-900 rounded-lg p-3 border border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-green-400 text-sm">
                <Code className="h-4 w-4" />
                <span>Python Code</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleExecuteCode(message.code!, message.id)}
                  className="text-green-400 hover:text-green-300 transition-colors flex items-center gap-1"
                  title="Execute code"
                  disabled={isLoading}
                >
                  <Play className="h-3 w-3" />
                  <span className="text-xs">Run</span>
                </button>
                <button
                  onClick={() => copyCode(message.code!)}
                  className="text-gray-400 hover:text-white transition-colors"
                  title="Copy code"
                >
                  <Copy className="h-3 w-3" />
                </button>
              </div>
            </div>
            <pre className="text-green-400 text-xs overflow-auto">
              <code>{message.code}</code>
            </pre>
          </div>
        )}

        {/* Execution result */}
        {message.executionResult && (
          <div className={`rounded-lg p-3 border ${
            message.executionResult.success 
              ? 'bg-green-900/20 border-green-700/30' 
              : 'bg-red-900/20 border-red-700/30'
          }`}>
            <div className="flex items-center gap-2 text-sm mb-2">
              {message.executionResult.success ? (
                <>
                  <div className="h-2 w-2 bg-green-400 rounded-full"></div>
                  <span className="text-green-400">Execution Successful</span>
                </>
              ) : (
                <>
                  <div className="h-2 w-2 bg-red-400 rounded-full"></div>
                  <span className="text-red-400">Execution Failed</span>
                </>
              )}
            </div>
            <pre className="text-xs overflow-auto">
              {JSON.stringify(message.executionResult.result, null, 2)}
            </pre>
          </div>
        )}

        {/* Chart suggestion */}
        {message.chartData && !message.executionResult && (
          <div className="bg-blue-900/20 rounded-lg p-3 border border-blue-700/30">
            <div className="flex items-center gap-2 text-blue-400 text-sm mb-2">
              <BarChart3 className="h-4 w-4" />
              <span>Chart Suggestion</span>
            </div>
            <p className="text-blue-300 text-sm">
              I recommend a {message.chartData.type} chart for this analysis. 
              Would you like me to generate the code?
            </p>
          </div>
        )}

        {/* Executed Chart Result */}
        {message.chartData?.type === 'image' && (
          <div className="bg-gray-800 rounded-lg p-3 border border-gray-700">
            <div className="flex items-center gap-2 text-blue-400 text-sm mb-2">
              <BarChart3 className="h-4 w-4" />
              <span>Generated Chart</span>
            </div>
            <img 
              src={message.chartData.data} 
              alt="AI-generated chart" 
              className="rounded w-full"
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="bg-gray-900 rounded-xl shadow-lg flex flex-col h-[600px]">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Cpu className="h-5 w-5 text-purple-400" />
            <h3 className="text-lg font-bold">AI Data Scientist</h3>
            <span className="text-xs bg-purple-600 px-2 py-1 rounded-full">PRO</span>
          </div>
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-gray-400'}`} />
          {chatSession.datasetContext?.domain && (
            <span className="text-xs bg-blue-600 px-2 py-1 rounded-full">
              {chatSession.datasetContext.domain}
            </span>
          )}
        </div>
        <button
          onClick={clearChat}
          className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
          title="Clear chat"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((m) => (
          <div key={m.id} className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {m.role === 'assistant' && (
              <div className="flex-shrink-0 w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center">
                <Bot className="h-4 w-4 text-white" />
              </div>
            )}

            <div
              className={`max-w-[80%] rounded-lg p-4 ${
                m.role === 'user' 
                  ? 'bg-blue-600 text-white' 
                  : m.type === 'error'
                  ? 'bg-red-900/50 text-red-100'
                  : 'bg-gray-800 text-gray-100'
              }`}
            >
              {m.isLoading ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Analyzing with AI...</span>
                </div>
              ) : (
                renderMessageContent(m)
              )}
            </div>

            {m.role === 'user' && (
              <div className="flex-shrink-0 w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                <User className="h-4 w-4 text-white" />
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Questions */}
      {messages.length <= 3 && (
        <div className="px-4 pb-2">
          <div className="text-xs text-gray-400 mb-2">Try asking:</div>
          <div className="flex flex-wrap gap-2">
            {suggestedQuestions.map((q, i) => (
              <button
                key={i}
                onClick={() => setInput(q)}
                className="text-xs bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded-full transition-colors border border-gray-700"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="p-4 border-t border-gray-700">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything about your data or request Python code..."
            className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            disabled={isLoading}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-4 py-3 rounded-lg transition-colors flex items-center gap-2"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}