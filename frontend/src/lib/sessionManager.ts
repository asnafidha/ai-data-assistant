// lib/sessionManager.ts - Enhanced session management with domain support

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  type?: 'text' | 'code' | 'chart' | 'suggestion' | 'execution' | 'error';
  metadata?: {
    code?: string;
    chartType?: string;
    analysisType?: string;
    datasetReferences?: string[];
    domain?: string;
    executionResult?: any;
  };
}

export interface DatasetContext {
  filename: string;
  shape: { rows: number; columns: number };
  columns: string[];
  numerical_columns: string[];
  categorical_columns: string[];
  missing_values: Record<string, number>;
  sample_data?: any[];
  basic_stats?: Record<string, any>;
  outliers?: Record<string, number>;
  duplicates_count?: number;
  column_dtypes?: Record<string, string>;
  domain?: string;
}

export interface AnalysisState {
  currentFocus: string;
  suggestedNextSteps: string[];
  completedAnalyses: string[];
  pendingActions: string[];
  dataQualityScore?: number;
  domain?: string;
}

export interface ChatSession {
  sessionId: string;
  datasetContext: DatasetContext;
  messages: ChatMessage[];
  analysisState: AnalysisState;
  createdAt: Date;
  lastActive: Date;
  metadata: {
    totalInteractions: number;
    analysisDepth: number;
    codeGenerationCount: number;
    visualizationRequests: number;
    codeExecutions: number;
    domain: string;
  };
}

export class SessionManager {
  private static instance: SessionManager;
  private sessions: Map<string, ChatSession> = new Map();
  private readonly MAX_SESSIONS = 100;
  private readonly SESSION_TIMEOUT = 2 * 60 * 60 * 1000; // 2 hours

  private constructor() {
    // Clean up expired sessions periodically
    setInterval(() => this.cleanupExpiredSessions(), 30 * 60 * 1000); // Every 30 minutes
  }

  static getInstance(): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager();
    }
    return SessionManager.instance;
  }

  // Detect domain from dataset context
  private detectDomain(context: DatasetContext): string {
    const columnNames = context.columns.join(' ').toLowerCase();
    
    if (columnNames.includes('price') || columnNames.includes('sales') || 
        columnNames.includes('revenue') || columnNames.includes('profit')) {
      return 'financial';
    } else if (columnNames.includes('patient') || columnNames.includes('medical') || 
               columnNames.includes('health') || columnNames.includes('diagnosis')) {
      return 'healthcare';
    } else if (columnNames.includes('customer') || columnNames.includes('order') || 
               columnNames.includes('product') || columnNames.includes('purchase')) {
      return 'ecommerce';
    } else if (columnNames.includes('student') || columnNames.includes('grade') || 
               columnNames.includes('course') || columnNames.includes('education')) {
      return 'education';
    }
    
    return 'general';
  }

  // Create a new chat session with dataset context
  createSession(sessionId: string, datasetContext: DatasetContext): ChatSession {
    if (this.sessions.size >= this.MAX_SESSIONS) {
      this.cleanupOldestSessions(10); // Make room for new sessions
    }

    // Detect domain
    const domain = this.detectDomain(datasetContext);

    const newSession: ChatSession = {
      sessionId,
      datasetContext: {
        ...datasetContext,
        domain
      },
      messages: [],
      analysisState: {
        currentFocus: 'initial_analysis',
        suggestedNextSteps: this.getDomainSpecificSuggestions(domain),
        completedAnalyses: [],
        pendingActions: [],
        domain
      },
      createdAt: new Date(),
      lastActive: new Date(),
      metadata: {
        totalInteractions: 0,
        analysisDepth: 0,
        codeGenerationCount: 0,
        visualizationRequests: 0,
        codeExecutions: 0,
        domain
      }
    };

    this.sessions.set(sessionId, newSession);
    return newSession;
  }

  // Get domain-specific suggestions
  private getDomainSpecificSuggestions(domain: string): string[] {
    const suggestions: Record<string, string[]> = {
      financial: [
        'Analyze sales trends over time',
        'Calculate financial ratios and metrics',
        'Identify seasonal patterns',
        'Perform cohort analysis',
        'Forecast future performance'
      ],
      healthcare: [
        'Analyze patient demographics',
        'Calculate prevalence rates',
        'Identify risk factors',
        'Perform survival analysis',
        'Check data quality for clinical use'
      ],
      ecommerce: [
        'Analyze customer behavior',
        'Calculate conversion rates',
        'Identify popular products',
        'Perform RFM analysis',
        'Optimize marketing campaigns'
      ],
      education: [
        'Analyze student performance',
        'Identify learning patterns',
        'Calculate success rates',
        'Perform demographic analysis',
        'Optimize curriculum design'
      ],
      general: [
        'Perform missing value analysis',
        'Check correlation between features',
        'Explore categorical distributions',
        'Identify potential outliers',
        'Suggest appropriate ML models'
      ]
    };

    return suggestions[domain] || suggestions.general;
  }

  // Get session by ID
  getSession(sessionId: string): ChatSession | undefined {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActive = new Date(); // Update last active time
    }
    return session;
  }

  // Add a message to the session
  addMessage(sessionId: string, message: ChatMessage): void {
    const session = this.getSession(sessionId);
    if (session) {
      session.messages.push(message);
      session.lastActive = new Date();
      session.metadata.totalInteractions++;

      // Update metadata based on message type
      if (message.type === 'code') {
        session.metadata.codeGenerationCount++;
      } else if (message.type === 'chart') {
        session.metadata.visualizationRequests++;
      } else if (message.type === 'execution') {
        session.metadata.codeExecutions++;
      }

      // Keep only last 50 messages to prevent memory issues
      if (session.messages.length > 50) {
        session.messages = session.messages.slice(-50);
      }

      // Update analysis state based on message content
      this.updateAnalysisState(session, message);
    }
  }

  // Update analysis state based on conversation
  private updateAnalysisState(session: ChatSession, message: ChatMessage): void {
    const content = message.content.toLowerCase();
    const domain = session.datasetContext.domain || 'general';
    
    // Track completed analyses
    if (message.role === 'assistant') {
      const analysesToTrack = [
        { keyword: 'missing', analysis: 'missing_values' },
        { keyword: 'outlier', analysis: 'outlier_detection' },
        { keyword: 'correlation', analysis: 'correlation_analysis' },
        { keyword: 'model', analysis: 'ml_suggestions' },
        { keyword: 'visualiz', analysis: 'visualization' },
        { keyword: 'clean', analysis: 'data_cleaning' }
      ];

      for (const { keyword, analysis } of analysesToTrack) {
        if (content.includes(keyword) && !session.analysisState.completedAnalyses.includes(analysis)) {
          session.analysisState.completedAnalyses.push(analysis);
        }
      }
    }

    // Update current focus
    if (message.role === 'user') {
      session.analysisState.currentFocus = this.detectFocus(message.content, domain);
    }

    // Update suggested next steps based on progress
    this.updateSuggestedSteps(session);
  }

  // Detect the current focus of the conversation with domain context
  private detectFocus(message: string, domain: string): string {
    const content = message.toLowerCase();
    
    const focusMap: Record<string, Record<string, string>> = {
      financial: {
        'clean': 'financial_data_cleaning',
        'model': 'financial_modeling',
        'trend': 'financial_trends',
        'forecast': 'financial_forecasting',
        'risk': 'risk_analysis'
      },
      healthcare: {
        'clean': 'healthcare_data_cleaning', 
        'model': 'healthcare_prediction',
        'patient': 'patient_analysis',
        'treatment': 'treatment_analysis',
        'risk': 'risk_factors'
      },
      ecommerce: {
        'clean': 'ecommerce_data_cleaning',
        'model': 'ecommerce_prediction', 
        'customer': 'customer_analysis',
        'sales': 'sales_analysis',
        'conversion': 'conversion_optimization'
      }
    };

    // Check domain-specific focuses first
    const domainFocuses = focusMap[domain] || {};
    for (const [keyword, focus] of Object.entries(domainFocuses)) {
      if (content.includes(keyword)) {
        return focus;
      }
    }

    // General focuses
    if (content.includes('clean') || content.includes('missing') || content.includes('null')) {
      return 'data_cleaning';
    } else if (content.includes('model') || content.includes('train') || content.includes('predict')) {
      return 'machine_learning';
    } else if (content.includes('visualiz') || content.includes('plot') || content.includes('chart')) {
      return 'visualization';
    } else if (content.includes('pattern') || content.includes('trend') || content.includes('insight')) {
      return 'pattern_analysis';
    } else if (content.includes('python') || content.includes('code') || content.includes('script')) {
      return 'code_generation';
    }
    
    return 'general_analysis';
  }

  // Update suggested next steps based on completed analyses and domain
  private updateSuggestedSteps(session: ChatSession): void {
    const completed = session.analysisState.completedAnalyses;
    const domain = session.datasetContext.domain || 'general';
    
    let suggestions: string[] = [];

    // Domain-specific suggestions
    const domainSuggestions: Record<string, string[]> = {
      financial: [
        'Calculate ROI and profitability metrics',
        'Analyze customer lifetime value',
        'Perform market basket analysis',
        'Optimize pricing strategy',
        'Detect fraudulent transactions'
      ],
      healthcare: [
        'Analyze treatment effectiveness',
        'Calculate readmission rates',
        'Identify comorbidities',
        'Optimize resource allocation',
        'Ensure HIPAA compliance'
      ],
      ecommerce: [
        'Analyze shopping cart abandonment',
        'Calculate customer acquisition cost',
        'Optimize product recommendations',
        'Perform A/B testing analysis',
        'Improve customer retention'
      ],
      general: [
        'Explore additional data patterns',
        'Consider feature engineering',
        'Validate data quality metrics',
        'Create interactive dashboards',
        'Document findings and insights'
      ]
    };

    suggestions = [...(domainSuggestions[domain] || domainSuggestions.general)];

    // Context-specific suggestions based on completed analyses
    if (!completed.includes('missing_values')) {
      suggestions.push('Analyze and handle missing values');
    }
    
    if (!completed.includes('outlier_detection')) {
      suggestions.push('Check for outliers and anomalies');
    }
    
    if (!completed.includes('correlation_analysis')) {
      suggestions.push('Examine correlations between variables');
    }
    
    if (!completed.includes('ml_suggestions')) {
      suggestions.push('Get machine learning model recommendations');
    }

    // Advanced suggestions based on progress
    if (completed.length >= 2) {
      suggestions.push(
        'Build complete data preprocessing pipeline',
        'Create interactive dashboard visualizations',
        'Develop predictive modeling approach'
      );
    }

    session.analysisState.suggestedNextSteps = suggestions.slice(0, 6); // Top 6 suggestions
  }

  // Get conversation context for LLM prompts
  getConversationContext(sessionId: string, maxMessages: number = 5): {
    recentMessages: ChatMessage[];
    analysisProgress: string;
    suggestedQuestions: string[];
    domain: string;
  } {
    const session = this.getSession(sessionId);
    if (!session) {
      return {
        recentMessages: [],
        analysisProgress: 'New session',
        suggestedQuestions: [],
        domain: 'general'
      };
    }

    const recentMessages = session.messages.slice(-maxMessages);
    
    const analysisProgress = `Completed analyses: ${session.analysisState.completedAnalyses.join(', ') || 'None'}. Current focus: ${session.analysisState.currentFocus}. Domain: ${session.datasetContext.domain}`;
    
    return {
      recentMessages,
      analysisProgress,
      suggestedQuestions: session.analysisState.suggestedNextSteps,
      domain: session.datasetContext.domain || 'general'
    };
  }

  // Get dataset summary for context
  getDatasetSummary(sessionId: string): string {
    const session = this.getSession(sessionId);
    if (!session) return 'No dataset information available';

    const ctx = session.datasetContext;
    return `
Dataset: ${ctx.filename}
Domain: ${ctx.domain}
Shape: ${ctx.shape.rows} rows × ${ctx.shape.columns} columns
Numerical Features: ${ctx.numerical_columns.length}
Categorical Features: ${ctx.categorical_columns.length}
Missing Values: ${Object.values(ctx.missing_values).reduce((sum, count) => sum + count, 0)} total
Data Quality Score: ${this.calculateDataQualityScore(ctx)}
    `.trim();
  }

  // Calculate data quality score
  private calculateDataQualityScore(context: DatasetContext): number {
    let score = 100;
    
    // Deduct points for missing values
    const totalMissing = Object.values(context.missing_values).reduce((sum, count) => sum + count, 0);
    const totalCells = context.shape.rows * context.shape.columns;
    const missingPercentage = (totalMissing / totalCells) * 100;
    score -= Math.min(missingPercentage * 0.5, 30); // Up to 30 points deduction
    
    // Deduct points for lack of diversity in categorical data
    if (context.categorical_columns.length > 0) {
      // Simple heuristic - more columns is better
      score += Math.min(context.categorical_columns.length * 2, 10);
    }
    
    // Bonus for numerical data
    if (context.numerical_columns.length > 0) {
      score += Math.min(context.numerical_columns.length * 2, 10);
    }
    
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  // Clean up expired sessions
  private cleanupExpiredSessions(): void {
    const now = Date.now();
    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.lastActive.getTime() > this.SESSION_TIMEOUT) {
        this.sessions.delete(sessionId);
      }
    }
  }

  // Clean up oldest sessions to free up memory
  private cleanupOldestSessions(count: number): void {
    const sessionsArray = Array.from(this.sessions.entries());
    sessionsArray.sort((a, b) => a[1].lastActive.getTime() - b[1].lastActive.getTime());
    
    for (let i = 0; i < Math.min(count, sessionsArray.length); i++) {
      this.sessions.delete(sessionsArray[i][0]);
    }
  }

  // Get all active sessions (for debugging/admin)
  getAllSessions(): ChatSession[] {
    return Array.from(this.sessions.values());
  }

  // Get session statistics
  getSessionStats(): {
    totalSessions: number;
    activeSessions: number;
    totalInteractions: number;
    avgSessionDuration: number;
    domainBreakdown: Record<string, number>;
  } {
    const now = Date.now();
    const activeSessions = Array.from(this.sessions.values()).filter(
      session => now - session.lastActive.getTime() < 30 * 60 * 1000 // 30 minutes
    );

    const totalInteractions = Array.from(this.sessions.values()).reduce(
      (sum, session) => sum + session.metadata.totalInteractions, 0
    );

    const avgDuration = activeSessions.length > 0
      ? activeSessions.reduce((sum, session) => sum + (now - session.createdAt.getTime()), 0) / activeSessions.length
      : 0;

    // Domain breakdown
    const domainBreakdown: Record<string, number> = {};
    this.sessions.forEach(session => {
      const domain = session.datasetContext.domain || 'unknown';
      domainBreakdown[domain] = (domainBreakdown[domain] || 0) + 1;
    });

    return {
      totalSessions: this.sessions.size,
      activeSessions: activeSessions.length,
      totalInteractions,
      avgSessionDuration: avgDuration,
      domainBreakdown
    };
  }

  // Clear a specific session
  clearSession(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  // Clear all sessions
  clearAllSessions(): void {
    this.sessions.clear();
  }

  // Export session data (for persistence)
  exportSession(sessionId: string): string {
    const session = this.getSession(sessionId);
    return session ? JSON.stringify(session, null, 2) : '';
  }

  // Import session data (for persistence)
  importSession(sessionData: string): ChatSession | null {
    try {
      const session = JSON.parse(sessionData) as ChatSession;
      session.lastActive = new Date();
      this.sessions.set(session.sessionId, session);
      return session;
    } catch (error) {
      console.error('Failed to import session:', error);
      return null;
    }
  }
}

// Global singleton instance
export const sessionManager = SessionManager.getInstance();
export default sessionManager;