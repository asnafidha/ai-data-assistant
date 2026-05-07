// lib/prompts.ts - Enhanced prompt templates with domain-specific intelligence

export interface PromptContext {
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
  domain?: string;
}

export interface ChatHistory {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  metadata?: {
    analysisType?: string;
    domain?: string;
  };
}

export const PROMPT_TEMPLATES = {
  // General data analysis prompt with domain awareness
  dataAnalysis: (context: PromptContext, query: string, history: ChatHistory[] = []): string => {
    const domain = context?.domain || 'general';
    const filename = context?.filename || 'Unknown';
    const rows = context?.shape?.rows || 0;
    const columns = context?.shape?.columns || 0;
    const numericalCols = context?.numerical_columns?.join(', ') || 'None';
    const categoricalCols = context?.categorical_columns?.join(', ') || 'None';
    
    const missingValues = context?.missing_values ? Object.entries(context.missing_values)
      .filter(([_, count]) => count > 0)
      .map(([col, count]) => `${col}: ${count}`)
      .join(', ') || 'None' : 'None';

    const outliersCount = context?.outliers ? Object.values(context.outliers).reduce((sum, count) => sum + count, 0) : 0;
    const duplicatesCount = context?.duplicates_count || 0;

    return `**You are an expert Data Scientist AI** specializing in ${domain} data analysis.

## DATASET CONTEXT
- DOMAIN: ${domain}
- FILENAME: ${filename}
- SHAPE: ${rows} rows × ${columns} columns
- COLUMNS: ${context?.columns?.join(', ') || 'None'}
- NUMERICAL: ${numericalCols}
- CATEGORICAL: ${categoricalCols}
- MISSING VALUES: ${missingValues}
- OUTLIERS: ${outliersCount} detected
- DUPLICATES: ${duplicatesCount} found

## SAMPLE DATA (first 2 rows):
${context?.sample_data ? JSON.stringify(context.sample_data.slice(0, 2), null, 2) : 'Not available'}

## CHAT HISTORY:
${history.slice(-3).map(msg => 
  `${msg.role.toUpperCase()}: ${msg.content}${msg.metadata?.analysisType ? ` [${msg.metadata.analysisType}]` : ''}`
).join('\n') || 'No previous messages'}

## USER QUESTION:
${query}

## DOMAIN-SPECIFIC GUIDANCE:
${DomainGuidance.getDomainGuidance(domain)}

## RESPONSE REQUIREMENTS:
1. Provide SPECIFIC advice for this ${domain} dataset
2. Generate WORKING Python/pandas code when appropriate
3. Reference actual column names from the data
4. Suggest concrete next steps for ${domain} analysis
5. Use this exact format:

EXPLANATION: [Your comprehensive analysis explanation with ${domain} context]

CODE: \`\`\`python
[Your Python code here - ONLY if appropriate]
\`\`\`

NEXT_STEPS: [2-3 specific suggested actions for ${domain}]

CHART_TYPE: [Suggested chart type if visualization is mentioned]

DOMAIN_INSIGHTS: [${domain}-specific insights and recommendations]

## RESPONSE:`;
  },

  // Machine learning specific prompt with domain context
  machineLearning: (context: PromptContext, query: string): string => {
    const domain = context?.domain || 'general';
    const filename = context?.filename || 'Unknown';
    const rows = context?.shape?.rows || 0;
    const columns = context?.shape?.columns || 0;
    const numericalCols = context?.numerical_columns?.join(', ') || 'None';
    const categoricalCols = context?.categorical_columns?.join(', ') || 'None';
    
    const missingValuesTotal = context?.missing_values ? Object.values(context.missing_values).reduce((sum, count) => sum + count, 0) : 0;

    return `**You are an ML Engineer AI** specializing in ${domain} machine learning:

## DATASET FOR ML:
- DOMAIN: ${domain}
- Filename: ${filename}
- Shape: ${rows} rows × ${columns} columns
- Numerical features: ${numericalCols}
- Categorical features: ${categoricalCols}
- Missing values: ${missingValuesTotal} total

## USER QUESTION:
${query}

## DOMAIN-SPECIFIC ML GUIDANCE:
${DomainGuidance.getMLDomainGuidance(domain)}

## ML-SPECIFIC RESPONSE REQUIREMENTS:
1. Recommend SPECIFIC ML models for ${domain} data
2. Provide complete preprocessing code for ${domain} context
3. Include model training and evaluation code
4. Suggest hyperparameter tuning approaches for ${domain}
5. Format response as:

EXPLANATION: [ML model recommendations and rationale for ${domain}]

PREPROCESSING_CODE: \`\`\`python
[Data cleaning and feature engineering code for ${domain}]
\`\`\`

MODEL_CODE: \`\`\`python
[Model training and evaluation code for ${domain}]
\`\`\`

NEXT_STEPS: [Model deployment and improvement suggestions for ${domain}]

## RESPONSE:`;
  },

  // Visualization specific prompt with domain context
  visualization: (context: PromptContext, query: string): string => {
    const domain = context?.domain || 'general';
    const filename = context?.filename || 'Unknown';
    const numericalCols = context?.numerical_columns?.join(', ') || 'None';
    const categoricalCols = context?.categorical_columns?.join(', ') || 'None';

    return `**You are a Data Visualization Expert** creating plots for ${domain} data:

## DATASET FOR VISUALIZATION:
- DOMAIN: ${domain}
- Filename: ${filename}
- Numerical columns: ${numericalCols}
- Categorical columns: ${categoricalCols}

## USER REQUEST:
${query}

## DOMAIN-SPECIFIC VISUALIZATION GUIDANCE:
${DomainGuidance.getVisualizationDomainGuidance(domain)}

## VISUALIZATION REQUIREMENTS:
1. Recommend the MOST appropriate chart types for ${domain}
2. Provide COMPLETE plotting code (matplotlib/seaborn/plotly)
3. Include styling and customization for ${domain} context
4. Explain what insights to look for in ${domain}
5. Format response as:

EXPLANATION: [Chart recommendations and insights for ${domain}]

CODE: \`\`\`python
[Complete plotting code with imports for ${domain}]
\`\`\`

CUSTOMIZATION: [Styling and customization tips for ${domain}]

INSIGHTS: [What to look for in the visualization for ${domain}]

## RESPONSE:`;
  },

  // Data cleaning specific prompt with domain context
  dataCleaning: (context: PromptContext, query: string): string => {
    const domain = context?.domain || 'general';
    const filename = context?.filename || 'Unknown';
    
    const missingValues = context?.missing_values ? Object.entries(context.missing_values)
      .filter(([_, count]) => count > 0)
      .map(([col, count]) => `${col}: ${count}`)
      .join(', ') || 'None' : 'None';

    return `**You are a Data Quality Specialist** cleaning ${domain} data:

## DATASET TO CLEAN:
- DOMAIN: ${domain}
- Filename: ${filename}
- Missing values: ${missingValues}
- Columns: ${context?.columns?.join(', ') || 'None'}

## USER REQUEST:
${query}

## DOMAIN-SPECIFIC CLEANING GUIDANCE:
${DomainGuidance.getCleaningDomainGuidance(domain)}

## CLEANING REQUIREMENTS:
1. Provide SPECIFIC cleaning strategies for ${domain} data
2. Generate COMPLETE pandas cleaning code for ${domain} context
3. Handle missing values appropriately for ${domain}
4. Include data validation checks for ${domain}
5. Format response as:

EXPLANATION: [Cleaning strategy and rationale for ${domain}]

CODE: \`\`\`python
[Complete data cleaning code for ${domain}]
\`\`\`

VALIDATION: [Data quality checks to perform for ${domain}]

NEXT_STEPS: [Further cleaning suggestions for ${domain}]

## RESPONSE:`;
  }
};

// Helper function to detect prompt type
export const detectPromptType = (query: string): keyof typeof PROMPT_TEMPLATES => {
  const q = query.toLowerCase();
  
  if (q.includes('model') || q.includes('train') || q.includes('predict') || q.includes('ml') || 
      q.includes('machine learning') || q.includes('algorithm')) {
    return 'machineLearning';
  }
  
  if (q.includes('visualiz') || q.includes('plot') || q.includes('chart') || q.includes('graph') ||
      q.includes('see ') || q.includes('show ')) {
    return 'visualization';
  }
  
  if (q.includes('clean') || q.includes('missing') || q.includes('null') || q.includes('na') ||
      q.includes('preprocess') || q.includes('prepare data')) {
    return 'dataCleaning';
  }
  
  return 'dataAnalysis';
};

// Domain-specific guidance functions
export const DomainGuidance = {
  getDomainGuidance: (domain: string): string => {
    const guidance: Record<string, string> = {
      financial: `FINANCIAL ANALYSIS FOCUS:
- Analyze trends, seasonality, and cycles
- Calculate financial ratios and metrics
- Identify anomalies and outliers in monetary data
- Consider time series analysis for forecasting
- Focus on risk assessment and profitability`,
      
      healthcare: `HEALTHCARE ANALYSIS FOCUS:
- Maintain data privacy and HIPAA compliance
- Analyze patient demographics and outcomes
- Identify risk factors and correlations
- Consider statistical significance in medical data
- Focus on clinical relevance and patient safety`,
      
      ecommerce: `E-COMMERCE ANALYSIS FOCUS:
- Analyze customer behavior and conversion funnels
- Calculate customer lifetime value and retention
- Identify popular products and categories
- Optimize pricing and marketing strategies
- Focus on user experience and revenue optimization`,
      
      general: `GENERAL ANALYSIS FOCUS:
- Perform comprehensive exploratory data analysis
- Identify patterns and relationships in data
- Ensure data quality and consistency
- Provide actionable insights and recommendations
- Focus on clear communication of findings`
    };
    
    return guidance[domain] || guidance.general;
  },

  getMLDomainGuidance: (domain: string): string => {
    const guidance: Record<string, string> = {
      financial: `FINANCIAL ML GUIDANCE:
- Recommended models: Time series models (ARIMA, Prophet), Regression models, Anomaly detection
- Focus on: Forecasting accuracy, Risk prediction, Fraud detection
- Important: Backtesting, Risk management, Regulatory compliance`,
      
      healthcare: `HEALTHCARE ML GUIDANCE:
- Recommended models: Classification models, Survival analysis, Clustering
- Focus on: Patient outcomes, Treatment effectiveness, Risk stratification
- Important: Ethical considerations, Model interpretability, Clinical validation`,
      
      ecommerce: `E-COMMERCE ML GUIDANCE:
- Recommended models: Recommendation systems, Classification, Regression
- Focus on: Personalization, Conversion optimization, Customer segmentation
- Important: A/B testing, Scalability, Real-time performance`,
      
      general: `GENERAL ML GUIDANCE:
- Recommended models: Based on data structure and problem type
- Focus on: Model accuracy, Generalization, Interpretability
- Important: Cross-validation, Feature importance, Model evaluation`
    };
    
    return guidance[domain] || guidance.general;
  },

  getVisualizationDomainGuidance: (domain: string): string => {
    const guidance: Record<string, string> = {
      financial: `FINANCIAL VISUALIZATION:
- Recommended: Time series plots, Candlestick charts, Heatmaps for correlations
- Colors: Use green/red for positive/negative, professional color schemes
- Focus: Trends, Volatility, Comparative analysis
- Tools: Plotly for interactive charts, Matplotlib for static reports`,
      
      healthcare: `HEALTHCARE VISUALIZATION:
- Recommended: Survival curves, Box plots, Heatmaps for correlations
- Colors: Use clinical color schemes (blues, greens), avoid red for negative
- Focus: Distributions, Outliers, Statistical significance
- Tools: Seaborn for statistical plots, Plotly for interactive exploration`,
      
      ecommerce: `E-COMMERCE VISUALIZATION:
- Recommended: Funnel charts, Bar charts, Scatter plots with segmentation
- Colors: Use brand colors, vibrant but professional schemes
- Focus: Conversion rates, Customer behavior, Product performance
- Tools: Plotly for interactive dashboards, Seaborn for analysis`,
      
      general: `GENERAL VISUALIZATION:
- Recommended: Histograms, Scatter plots, Correlation heatmaps
- Colors: Use colorblind-friendly palettes, consistent styling
- Focus: Data distributions, Relationships, Patterns
- Tools: Matplotlib/Seaborn for static, Plotly for interactive`
    };
    
    return guidance[domain] || guidance.general;
  },

  getCleaningDomainGuidance: (domain: string): string => {
    const guidance: Record<string, string> = {
      financial: `FINANCIAL DATA CLEANING:
- Missing values: Use forward fill for time series, median for cross-sectional
- Outliers: Be cautious - may represent important events (crashes, spikes)
- Validation: Check for negative values where inappropriate, currency consistency
- Important: Maintain audit trail of changes, document assumptions`,
      
      healthcare: `HEALTHCARE DATA CLEANING:
- Missing values: Consult domain experts, may have clinical significance
- Outliers: Could be measurement errors or rare medical conditions
- Validation: Check ranges for vital signs, medication doses
- Important: Maintain patient privacy, document data provenance`,
      
      ecommerce: `E-COMMERCE DATA CLEANING:
- Missing values: Impute with mode for categorical, median for numerical
- Outliers: May represent fraud or data entry errors
- Validation: Check for negative prices, unrealistic quantities
- Important: Maintain data integrity for business decisions`,
      
      general: `GENERAL DATA CLEANING:
- Missing values: Impute based on data type and distribution
- Outliers: Detect using IQR or Z-score, investigate before removing
- Validation: Check data types, ranges, and consistency
- Important: Document cleaning steps, maintain data quality`
    };
    
    return guidance[domain] || guidance.general;
  }
};

// Helper to create appropriate prompt
export const createPrompt = (context: PromptContext, query: string, history: ChatHistory[] = []): string => {
  const promptType = detectPromptType(query);
  return PROMPT_TEMPLATES[promptType](context, query, history);
};

// Helper to parse structured response
export const parseStructuredResponse = (response: string): {
  explanation: string;
  code: string | null;
  nextSteps: string[];
  chartType: string | null;
  domainInsights: string | null;
} => {
  try {
    const explanationMatch = response.match(/EXPLANATION:\s*([\s\S]*?)(?=CODE:|NEXT_STEPS:|CHART_TYPE:|DOMAIN_INSIGHTS:|$)/i);
    const codeMatch = response.match(/CODE:\s*```python\n([\s\S]*?)\n```/i);
    const nextStepsMatch = response.match(/NEXT_STEPS:\s*([\s\S]*?)(?=CHART_TYPE:|DOMAIN_INSIGHTS:|$)/i);
    const chartTypeMatch = response.match(/CHART_TYPE:\s*(\w+)/i);
    const domainInsightsMatch = response.match(/DOMAIN_INSIGHTS:\s*([\s\S]*?)$/i);

    return {
      explanation: explanationMatch ? explanationMatch[1].trim() : response,
      code: codeMatch ? codeMatch[1].trim() : null,
      nextSteps: nextStepsMatch ? 
        nextStepsMatch[1].split('\n')
          .filter(step => step.trim())
          .map(step => step.replace(/^[-•*]\s*/, '').trim()) : 
        [],
      chartType: chartTypeMatch ? chartTypeMatch[1] : null,
      domainInsights: domainInsightsMatch ? domainInsightsMatch[1].trim() : null
    };
  } catch (error) {
    console.error('Failed to parse structured response:', error);
    return {
      explanation: response,
      code: null,
      nextSteps: [],
      chartType: null,
      domainInsights: null
    };
  }
};

// Add domain guidance to the templates
PROMPT_TEMPLATES.dataAnalysis = (context: PromptContext, query: string, history: ChatHistory[] = []) => {
  const domain = context?.domain || 'general';
  const basePrompt = PROMPT_TEMPLATES.dataAnalysis(context, query, history);
  return basePrompt.replace('## DOMAIN-SPECIFIC GUIDANCE:', `## DOMAIN-SPECIFIC GUIDANCE:\n${DomainGuidance.getDomainGuidance(domain)}`);
};

PROMPT_TEMPLATES.machineLearning = (context: PromptContext, query: string) => {
  const domain = context?.domain || 'general';
  const basePrompt = PROMPT_TEMPLATES.machineLearning(context, query);
  return basePrompt.replace('## DOMAIN-SPECIFIC ML GUIDANCE:', `## DOMAIN-SPECIFIC ML GUIDANCE:\n${DomainGuidance.getMLDomainGuidance(domain)}`);
};

PROMPT_TEMPLATES.visualization = (context: PromptContext, query: string) => {
  const domain = context?.domain || 'general';
  const basePrompt = PROMPT_TEMPLATES.visualization(context, query);
  return basePrompt.replace('## DOMAIN-SPECIFIC VISUALIZATION GUIDANCE:', `## DOMAIN-SPECIFIC VISUALIZATION GUIDANCE:\n${DomainGuidance.getVisualizationDomainGuidance(domain)}`);
};

PROMPT_TEMPLATES.dataCleaning = (context: PromptContext, query: string) => {
  const domain = context?.domain || 'general';
  const basePrompt = PROMPT_TEMPLATES.dataCleaning(context, query);
  return basePrompt.replace('## DOMAIN-SPECIFIC CLEANING GUIDANCE:', `## DOMAIN-SPECIFIC CLEANING GUIDANCE:\n${DomainGuidance.getCleaningDomainGuidance(domain)}`);
};