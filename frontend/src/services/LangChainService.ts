// services/LangChainService.ts - COMPLETE UPDATED & FIXED VERSION

export type LLMAnalyzeResponse =
  | { analysis: string; success: true }
  | { error: string; success: false };

// Enhanced request interface
export interface LLMAnalyzeRequest {
  session_id: string;
  query: string;
  data_context?: any;
  chat_history?: any[];
  response_format?: 'structured' | 'text';
}

// Structured response interface
export interface StructuredResponse {
  explanation: string;
  code?: string;
  nextSteps?: string[];
  chartType?: string;
  domainInsights?: string;
  proactiveQuestion?: string;
  success: boolean;
  error?: string;
  data?: any;
  domain?: string;
  rows?: number;
  result?: any;
}

class LangChainService {
  private apiUrl =
    process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") ||
    "http://127.0.0.1:8000";

  /** ✅ Upload CSV/XLSX for EDA */
  async uploadFile(file: File) {
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch(`${this.apiUrl}/api/upload`, {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      throw new Error(`Upload failed: ${res.status} ${res.statusText}`);
    }
    return res.json();
  }

  /** ✅ Basic LLM analysis (updated to use correct JSON format) */
  async llmAnalyze(
    session_id: string,
    query: string
  ): Promise<LLMAnalyzeResponse> {
    try {
      const url = `${this.apiUrl}/api/llm-analyze-enhanced`;

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          session_id: session_id,
          query: query,
          response_format: 'text'
        }),
      });

      if (!res.ok) {
        return {
          error: `Backend error: ${res.status} ${res.statusText}`,
          success: false,
        };
      }

      const data = await res.json();
      return data;
    } catch (error) {
      return {
        error: `Network error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        success: false,
      };
    }
  }

  /** ✅ Enhanced LLM analysis with structured response */
  async enhancedLlmAnalyze(
    request: LLMAnalyzeRequest
  ): Promise<StructuredResponse> {
    try {
      const url = `${this.apiUrl}/api/llm-analyze-enhanced`;

      console.log("📡 Sending LLM request:", { 
        url: url,
        body: JSON.stringify(request, null, 2)
      });

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(request),
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error("Backend error response:", errorText);
        throw new Error(`Backend error: ${res.status} ${res.statusText}`);
      }

      const data = await res.json();
      
      // 🎯 ADDED: Detailed debug logging
      console.log("🔍 FULL BACKEND RESPONSE:", JSON.stringify(data, null, 2));
      console.log("🔍 Response success:", data.success);
      console.log("🔍 Response error:", data.error);
      console.log("🔍 Response explanation:", data.explanation);

      if (data.success) {
        return {
          explanation: data.explanation || data.analysis || "",
          code: data.code,
          nextSteps: data.nextSteps || data.next_steps || [],
          chartType: data.chartType || data.chart_type,
          domainInsights: data.domainInsights || data.domain_insights,
          proactiveQuestion: data.proactiveQuestion || data.proactive_question,
          success: true,
          data: data.data_context,
          domain: data.domain || data.data_context?.domain,
        };
      }

      // ✅ PROPER ERROR HANDLING:
      if (data.error) {
        throw new Error(data.error);
      }

      // ✅ Handle case where backend returns success: false but no error message
      if (data.explanation && data.explanation.includes("failed")) {
        return {
          explanation: data.explanation,
          success: false,
          error: data.explanation
        };
      }

      // ✅ Handle any other error format
      if (data.message) {
        throw new Error(data.message);
      }

      throw new Error("Unknown error from backend. Check backend logs.");

    } catch (error) {
      console.error("Enhanced LLM analysis error:", error);
      return {
        explanation: `Analysis failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /** ✅ Execute generated code and get results */
  async executeCode(
    session_id: string,
    code: string
  ): Promise<{ success: boolean; result?: any; type?: string; error?: string; rows?: number }> {
    try {
      const url = `${this.apiUrl}/api/execute-code?session_id=${encodeURIComponent(
        session_id
      )}&code=${encodeURIComponent(code)}`;

      const res = await fetch(url, {
        method: "POST",
        headers: {
          Accept: "application/json",
        },
      });

      if (!res.ok) {
        throw new Error(`Backend error: ${res.status} ${res.statusText}`);
      }

      return await res.json();
    } catch (error) {
      console.error("Code execution failed:", error);
      return {
        success: false,
        error: `Execution failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      };
    }
  }

  /** ✅ Get session health status */
  async getHealth(): Promise<{ status: string; sessions: number }> {
    try {
      const res = await fetch(`${this.apiUrl}/api/health`);

      if (!res.ok) {
        throw new Error(`Health check failed: ${res.status}`);
      }

      return await res.json();
    } catch (error) {
      console.error("Health check failed:", error);
      return { status: "unhealthy", sessions: 0 };
    }
  }

  /** ✅ Clean up expired sessions */
  async cleanupSessions(): Promise<{
    success: boolean;
    cleaned: number;
    remaining: number;
  }> {
    try {
      const res = await fetch(`${this.apiUrl}/api/cleanup-sessions`, {
        method: "POST",
      });

      if (!res.ok) {
        throw new Error(`Cleanup failed: ${res.status}`);
      }

      return await res.json();
    } catch (error) {
      console.error("Session cleanup failed:", error);
      return { success: false, cleaned: 0, remaining: 0 };
    }
  }

  /** ✅ Enhanced direct Gemini call with better prompting */
  async enhancedDirectGeminiAnalyze(
    prompt: string,
    apiKey: string,
    options?: {
      temperature?: number;
      maxTokens?: number;
      responseFormat?: "structured" | "text";
    }
  ): Promise<StructuredResponse> {
    try {
      const response = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: prompt,
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: options?.temperature || 0.2,
              maxOutputTokens: options?.maxTokens || 2000,
              responseMimeType:
                options?.responseFormat === "structured"
                  ? "application/json"
                  : "text/plain",
            },
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          `Gemini API error: ${response.status} - ${
            errorData.error?.message || response.statusText
          }`
        );
      }

      const data = await response.json();
      const analysis = data.candidates[0].content.parts[0].text;

      // Try to parse as JSON if structured response requested
      if (options?.responseFormat === "structured") {
        try {
          const parsed = JSON.parse(analysis);
          return {
            explanation: parsed.explanation || parsed.content || analysis,
            code: parsed.code,
            nextSteps: parsed.nextSteps,
            chartType: parsed.chartType,
            success: true,
          };
        } catch (parseError) {
          // Fallback to text parsing
          return this.parseStructuredResponse(analysis);
        }
      }

      return this.parseStructuredResponse(analysis);
    } catch (error) {
      console.error("Enhanced Gemini error:", error);
      return {
        explanation: `Gemini error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /** ✅ Parse structured response from text */
  private parseStructuredResponse(response: string): StructuredResponse {
    try {
      const explanationMatch = response.match(
        /EXPLANATION:\s*([\s\S]*?)(?=CODE:|NEXT_STEPS:|CHART_TYPE:|DOMAIN_INSIGHTS:|$)/i
      );
      const codeMatch = response.match(/CODE:\s*```python\n([\s\S]*?)\n```/);
      const nextStepsMatch = response.match(
        /NEXT_STEPS:\s*(.*?)(?=CHART_TYPE:|DOMAIN_INSIGHTS:|$)/i
      );
      const chartTypeMatch = response.match(/CHART_TYPE:\s*(\w+)/i);
      const domainInsightsMatch = response.match(
        /DOMAIN_INSIGHTS:\s*(.*?)$/i
      );

      return {
        explanation: explanationMatch ? explanationMatch[1].trim() : response,
        code: codeMatch ? codeMatch[1].trim() : undefined,
        nextSteps: nextStepsMatch
          ? nextStepsMatch[1]
              .split("\n")
              .filter((step: string) => step.trim())
              .map((step: string) =>
                step.replace(/^[-•*]\s*/, "").trim()
              )
          : [],
        chartType: chartTypeMatch ? chartTypeMatch[1] : undefined,
        domainInsights: domainInsightsMatch
          ? domainInsightsMatch[1].trim()
          : undefined,
        success: true,
      };
    } catch (error) {
      return {
        explanation: response,
        success: true,
      };
    }
  }

  /** ✅ Fallback to basic analysis if enhanced fails */
  async analyzeWithFallback(
    request: LLMAnalyzeRequest,
    geminiApiKey: string
  ): Promise<StructuredResponse> {
    try {
      // First try: Enhanced backend analysis
      try {
        const result = await this.enhancedLlmAnalyze(request);
        if (result.success) return result;
      } catch (error) {
        console.warn("Enhanced backend failed, trying direct Gemini");
      }

      // Second try: Enhanced direct Gemini
      try {
        const enhancedPrompt = this.createEnhancedPrompt(
          request.query,
          request.data_context,
          request.chat_history || []
        );

        const result = await this.enhancedDirectGeminiAnalyze(
          enhancedPrompt,
          geminiApiKey,
          { responseFormat: "structured" }
        );

        if (result.success) return result;
      } catch (error) {
        console.warn("Enhanced Gemini failed, trying basic analysis");
      }

      // Final fallback: Basic analysis
      const basicResult = await this.llmAnalyze(
        request.session_id,
        request.query
      );
      if (basicResult.success && "analysis" in basicResult) {
        return {
          explanation: basicResult.analysis,
          success: true,
        };
      }

      throw new Error("All analysis methods failed");
    } catch (error) {
      return {
        explanation: `Analysis unavailable: ${
          error instanceof Error ? error.message : "Please try again"
        }`,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /** ✅ Create enhanced prompt for direct API calls */
  private createEnhancedPrompt(
    query: string,
    dataContext: any,
    chatHistory: any[] = []
  ): string {
    const safeContext = dataContext || {};
    const missingValues = safeContext.missing_values || {};

    const missingValuesStr =
      Object.entries(missingValues)
        .filter(([_, count]) => typeof count === "number" && count > 0)
        .map(([col, count]) => `${col}: ${count}`)
        .join(", ") || "None";

    const chatHistoryStr =
      chatHistory
        .slice(-3)
        .map((msg: any) => `${msg.role?.toUpperCase()}: ${msg.content}`)
        .join("\n") || "No previous messages";

    // Detect domain
    const columnNames = (safeContext.columns || []).join(" ").toLowerCase();
    let domain = "General";
    if (
      columnNames.includes("price") ||
      columnNames.includes("sales") ||
      columnNames.includes("revenue")
    ) {
      domain = "Financial";
    } else if (
      columnNames.includes("patient") ||
      columnNames.includes("medical") ||
      columnNames.includes("health")
    ) {
      domain = "Healthcare";
    }

    return `**You are an expert Data Scientist AI** analyzing this ${domain} dataset:

## DATASET CONTEXT
- DOMAIN: ${domain}
- FILENAME: ${safeContext.filename || "Unknown"}
- SHAPE: ${safeContext.shape?.rows || 0} rows × ${
      safeContext.shape?.columns || 0
    } columns
- COLUMNS: ${safeContext.columns?.join(", ") || "None"}
- NUMERICAL: ${safeContext.numerical_columns?.join(", ") || "None"}
- CATEGORICAL: ${safeContext.categorical_columns?.join(", ") || "None"}
- MISSING VALUES: ${missingValuesStr}

## CHAT HISTORY:
${chatHistoryStr}

## USER QUESTION:
${query}

## RESPONSE REQUIREMENTS:
1. Provide SPECIFIC advice for THIS ${domain} dataset
2. Generate WORKING Python/pandas code when appropriate
3. Reference actual column names from the data
4. Suggest concrete next steps
5. Use this exact format:

EXPLANATION: [Your comprehensive analysis explanation with ${domain} context]

CODE: \`\`\`python
[Your Python code here - ONLY if appropriate]
\`\`\`

NEXT_STEPS: [2-3 specific suggested actions for ${domain}]

CHART_TYPE: [Suggested chart type if visualization is needed]

DOMAIN_INSIGHTS: [${domain}-specific insights and recommendations]

## RESPONSE:`;
  }
}

// Export singleton instance
export const langChainService = new LangChainService();
export default langChainService;