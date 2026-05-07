# main.py — Part 1/2
from fastapi import FastAPI, File, UploadFile, Query, HTTPException, Body, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import pandas as pd
import numpy as np
import io
import base64
import seaborn as sns
import matplotlib.pyplot as plt
import missingno as msno
import uuid
import logging
import json
import google.generativeai as genai
from typing import Optional, Dict, Any, List
from sklearn.ensemble import IsolationForest
from sklearn.linear_model import LinearRegression
from scipy import stats
import asyncio
from dotenv import load_dotenv
import re
import traceback
import time
import os
import ast
from pydantic import BaseModel
from typing import Optional, Dict, Any
import tempfile
import os
import sqlite3


from data_sources import fetch_sql_data, fetch_api_data
from collections import defaultdict

from pydantic import BaseModel
from typing import Optional, List, Any

class LLMAnalyzeRequest(BaseModel):
    session_id: str
    query: str
    data_context: Optional[Any] = None
    chat_history: Optional[List] = None
    response_format: Optional[str] = 'structured'


 

class APIRequest(BaseModel):
    url: str
    params: Optional[Dict[str, Any]] = {}
    headers: Optional[Dict[str, str]] = {}
   

# LangChain imports (optional)
try:
    from langchain_community.chat_models import ChatOpenAI, ChatAnthropic
    from langchain_ollama import ChatOllama
    from langchain.schema import HumanMessage, SystemMessage
    _LANGCHAIN_AVAILABLE = True
except Exception:
    _LANGCHAIN_AVAILABLE = False

load_dotenv()

plt.style.use('dark_background')
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("eda")

# ------------------------------
# In-memory stores and settings
# ------------------------------
DATASETS: Dict[str, pd.DataFrame] = {}      # original cleaned store by session
CLEANED_DATA: Dict[str, pd.DataFrame] = {}  # deep-cleaned outputs by cleaned_session_id
SESSION_EXPIRY = int(os.getenv("SESSION_EXPIRY_SECONDS", 60 * 60))  # default 1 hour
MAX_DISPLAY_COLS = int(os.getenv("MAX_DISPLAY_COLS", 50))
MAX_SAMPLE_ROWS = int(os.getenv("MAX_SAMPLE_ROWS", 50000))

# ------------------------------
# RestrictedEnvironment (sandbox)
# ------------------------------
class RestrictedEnvironment:
    """
    Restricted execution environment for running user/LLM-generated code.
    Provides a limited set of modules, attributes, and builtins.
    """

    def __init__(self):
        # Allowed top-level module names for imports found in user code
        self.safe_modules = {'math', 'random', 'datetime', 'collections', 'itertools', 'functools', 'operator', 're', 'json', 'numbers', 'statistics', 'pandas', 'numpy'}
        # Allowed builtins accessible in the sandbox
        self.safe_builtins = {
            'abs', 'all', 'any', 'bin', 'bool', 'callable', 'chr', 'complex',
            'dict', 'dir', 'enumerate', 'filter', 'float', 'format', 'hash',
            'hex', 'int', 'isinstance', 'issubclass', 'iter', 'len', 'list',
            'map', 'max', 'min', 'next', 'oct', 'ord', 'pow', 'print',
            'range', 'repr', 'reversed', 'round', 'set', 'slice', 'sorted',
            'str', 'sum', 'tuple', 'type', 'zip'
        }
        # Block obvious dangerous patterns
        self.blocked_patterns = [
            r'__.*__', r'os\.', r'sys\.', r'subprocess\.', r'importlib\.', r'open\(', r'eval\(', r'exec\(', r'compile\(', r'pickle\.', r'input\('
        ]

        # Allowed attributes for wrapped limited modules (pd, np, plt, sns)
        self.allowed_attributes = {
            'pd': ['DataFrame', 'Series', 'read_csv', 'read_excel', 'concat', 'merge', 'to_datetime', 'to_numeric', 'get_dummies', 'pivot_table', 'drop', 'dropna', 'fillna', 'astype', 'describe', 'value_counts', 'groupby', 'melt'],
            'np': ['array', 'arange', 'linspace', 'zeros', 'ones', 'mean', 'median', 'std', 'min', 'max', 'sum', 'unique', 'where', 'isnan', 'nan'],
            'plt': ['figure', 'plot', 'scatter', 'hist', 'savefig', 'close', 'title', 'xlabel', 'ylabel', 'legend'],
            'sns': ['heatmap', 'histplot', 'boxplot', 'violinplot', 'pairplot', 'kdeplot', 'countplot']
        }

    def is_code_safe(self, code: str) -> bool:
        code_lower = code.lower()
        # Block patterns
        for pat in self.blocked_patterns:
            if re.search(pat, code_lower):
                logger.warning(f"Blocked pattern {pat} found in code.")
                return False

        # Basic import check
        try:
            tree = ast.parse(code)
        except Exception:
            logger.warning("AST parse failed for code; refusing to execute.")
            return False

        for node in ast.walk(tree):
            # Imports
            if isinstance(node, ast.Import):
                for alias in node.names:
                    mod = alias.name.split('.')[0]
                    if mod not in self.safe_modules:
                        logger.warning(f"Import of module '{mod}' not allowed.")
                        return False
            if isinstance(node, ast.ImportFrom):
                mod = (node.module or "").split('.')[0]
                if mod not in self.safe_modules:
                    logger.warning(f"Import-from of module '{mod}' not allowed.")
                    return False
            # Attribute access / names can be inspected further if needed

        # If reached here, code passed basic checks
        return True

    def _create_limited_module(self, module, allowed_list):
        """
        Returns an object that exposes only attributes listed in allowed_list.
        Accessing other attributes raises AttributeError.
        """
        class LimitedModule:
            def __init__(self, module, allowed):
                self._module = module
                self._allowed = set(allowed)

            def __getattr__(self, name):
                if name in self._allowed:
                    return getattr(self._module, name)
                raise AttributeError(f"Access to '{name}' is not permitted in restricted environment.")

        return LimitedModule(module, allowed_list)

    def create_safe_environment(self, df: pd.DataFrame) -> dict:
        """
        Create the execution environment to pass to exec().
        We expose a restricted subset of pandas, numpy, matplotlib, seaborn, and a reference to df.
        """
        safe_pd = self._create_limited_module(pd, self.allowed_attributes['pd'])
        safe_np = self._create_limited_module(np, self.allowed_attributes['np'])
        safe_plt = self._create_limited_module(plt, self.allowed_attributes['plt'])
        safe_sns = self._create_limited_module(sns, self.allowed_attributes['sns'])

        safe_env = {
            'pd': safe_pd,
            'np': safe_np,
            'plt': safe_plt,
            'sns': safe_sns,
            'df': df.copy(),  # give a copy so changes are explicit
        }

        # attach safe builtins
        for name in self.safe_builtins:
            if name in __builtins__:
                safe_env[name] = __builtins__[name]

        # provide a limited print that writes to a buffer if caller needs output
        return safe_env

# Initialize global sandbox instance
security = RestrictedEnvironment()

# ------------------------------
# LangChain Services
# ------------------------------
class LangChainService:
    """Original LLM wrapper maintaining compatibility with your baseline."""
    def __init__(self):
        self.provider = os.getenv("LLM_PROVIDER", "gemini")

    async def analyze_data(self, query: str, data_context: Dict[str, Any]) -> str:
        try:
            prompt = self._create_analysis_prompt(query, data_context)
            return await self._get_llm_response(prompt)
        except Exception as e:
            logger.exception("LangChain analyze_data error")
            raise

    def _create_analysis_prompt(self, query: str, data_context: Dict[str, Any]) -> str:
        return f"""You are an expert data scientist and analyst. Your task is to help users understand and analyze their dataset.

# Dataset Context:
- Filename: {data_context.get('filename', 'Unknown')}
- Shape: {data_context.get('shape', {}).get('rows', 0)} rows, {data_context.get('shape', {}).get('columns', 0)} columns
- Numerical columns: {', '.join(data_context.get('numerical_columns', []) or []) or 'None'}
- Categorical columns: {', '.join(data_context.get('categorical_columns', []) or []) or 'None'}
- Missing values: {json.dumps(data_context.get('missing_values', {}), indent=2)}
- Basic statistics: Available for {len(data_context.get('basic_stats', {}))} columns
- Auto insights: {len(data_context.get('auto_insights', []))} insights generated
- Outliers detected: {sum(data_context.get('outliers_iqr', {}).values()) if data_context.get('outliers_iqr') else 0} using IQR method

# User Question:
{query}

# Your Response Guidelines:
1. Provide comprehensive but concise analysis
2. Offer specific, actionable recommendations
3. Explain technical concepts in accessible language
4. Suggest next steps for analysis
5. If dataset has issues, recommend solutions
6. Keep response under 500 words
7. Use markdown formatting for readability

# Response:"""

    async def _get_llm_response(self, prompt: str) -> str:
        provider = self.provider.lower()
        if provider == "openai":
            return await self._get_openai_response(prompt)
        elif provider == "anthropic":
            return await self._get_anthropic_response(prompt)
        else:
            return await self._get_ollama_response(prompt)

    async def _get_openai_response(self, prompt: str) -> str:
        if not _LANGCHAIN_AVAILABLE:
            raise Exception("LangChain OpenAI integration is not available")
        if not os.getenv("OPENAI_API_KEY"):
            raise Exception("OPENAI_API_KEY not set")
        model = ChatOpenAI(model_name=os.getenv("OPENAI_MODEL", "gpt-4"), temperature=0.2, max_tokens=1000, openai_api_key=os.getenv("OPENAI_API_KEY"))
        messages = [SystemMessage(content="You are a helpful data analysis assistant."), HumanMessage(content=prompt)]
        resp = await model.ainvoke(messages)
        return resp.content

    async def _get_anthropic_response(self, prompt: str) -> str:
        if not _LANGCHAIN_AVAILABLE:
            raise Exception("LangChain Anthropic integration is not available")
        if not os.getenv("ANTHROPIC_API_KEY"):
            raise Exception("ANTHROPIC_API_KEY not set")
        model = ChatAnthropic(model_name=os.getenv("ANTHROPIC_MODEL", "claude-instant-1.2"), temperature=0.2, max_tokens_to_sample=1000, anthropic_api_key=os.getenv("ANTHROPIC_API_KEY"))
        messages = [SystemMessage(content="You are a helpful data analysis assistant."), HumanMessage(content=prompt)]
        resp = await model.ainvoke(messages)
        return resp.content

    async def _get_ollama_response(self, prompt: str) -> str:
        if not _LANGCHAIN_AVAILABLE:
            # fallback: try google gemini (if configured)
            if os.getenv("GOOGLE_API_KEY"):
                # use google generative ai in a synchronous-ish wrapper
                genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))
                model = genai.GenerativeModel('gemini-1.5-flash')
                # run in thread to avoid blocking
                resp = await asyncio.to_thread(model.generate_content, prompt)
                return getattr(resp, "text", str(resp))
            raise Exception("No LLM integrations available")
        base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
        model = ChatOllama(base_url=base_url, model=os.getenv("OLLAMA_MODEL", "llama2"), temperature=0.2)
        messages = [SystemMessage(content="You are a helpful data analysis assistant."), HumanMessage(content=prompt)]
        resp = await model.ainvoke(messages)
        return resp.content

# Structured enhanced service
class EnhancedLangChainService:
    """
    Wraps LLM calls and attempts to parse structured responses of the form:
    EXPLANATION: ...
    CODE: ```python
    ...
    ```
    NEXT_STEPS:
    CHART_TYPE:
    DOMAIN_INSIGHTS:
    """
    def __init__(self):
        self.provider = os.getenv("LLM_PROVIDER", "gemini")

    async def enhanced_analyze_data(self, prompt: str, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        try:
            response = await self._get_llm_response(prompt)
            return self._parse_structured_response(response, context or {})
        except Exception as e:
            logger.exception("EnhancedLangChainService error")
            return {"explanation": f"LLM call failed: {str(e)}", "success": False}

    def _parse_structured_response(self, response: str, context: Dict[str, Any]) -> Dict[str, Any]:
        try:
            explanation_match = re.search(r'EXPLANATION:\s*(.*?)(?=CODE:|NEXT_STEPS:|CHART_TYPE:|DOMAIN_INSIGHTS:|$)', response, re.DOTALL | re.IGNORECASE)
            code_match = re.search(r'CODE:\s*```python\n(.*?)\n```', response, re.DOTALL | re.IGNORECASE)
            next_steps_match = re.search(r'NEXT_STEPS:\s*(.*?)(?=CHART_TYPE:|DOMAIN_INSIGHTS:|$)', response, re.DOTALL | re.IGNORECASE)
            chart_type_match = re.search(r'CHART_TYPE:\s*(\w+)', response, re.IGNORECASE)
            domain_insights_match = re.search(r'DOMAIN_INSIGHTS:\s*(.*?)$', response, re.DOTALL | re.IGNORECASE)

            result = {
                "explanation": explanation_match.group(1).strip() if explanation_match else response.strip(),
                "code": code_match.group(1).strip() if code_match else None,
                "nextSteps": [s.strip() for s in (next_steps_match.group(1).splitlines()) if s.strip()] if next_steps_match else [],
                "chartType": chart_type_match.group(1) if chart_type_match else None,
                "domainInsights": domain_insights_match.group(1).strip() if domain_insights_match else None,
                "success": True
            }

            # Add proactive question if many missing values
            missing_vals = context.get("missing_values", {})
            if isinstance(missing_vals, dict):
                total_missing = sum(int(v) for v in missing_vals.values())
                if total_missing > 0:
                    result["proactiveQuestion"] = f"Found {total_missing} missing values. Would you like automatic handling or a preview?"

            return result
        except Exception as e:
            logger.exception("parse_structured_response failed")
            return {"explanation": response, "success": True}

    async def _get_llm_response(self, prompt: str) -> str:
        provider = os.getenv("LLM_PROVIDER", "gemini").lower()
        if provider == "openai":
            svc = LangChainService()
            return await svc._get_openai_response(prompt)
        elif provider == "anthropic":
            svc = LangChainService()
            return await svc._get_anthropic_response(prompt)
        else:
            svc = LangChainService()
            return await svc._get_ollama_response(prompt)

# init services
langchain_service = LangChainService()
enhanced_langchain_service = EnhancedLangChainService()

# ------------------------------
# Utility functions (detailed)
# ------------------------------
def create_missingness_plots(df: pd.DataFrame) -> Dict[str, str]:
    plots = {}
    try:
        # matrix
        plt.figure(figsize=(12, 6))
        msno.matrix(df)
        buf = io.BytesIO()
        plt.savefig(buf, format="png", bbox_inches="tight", transparent=True)
        buf.seek(0)
        plots["matrix"] = f"data:image/png;base64,{base64.b64encode(buf.read()).decode()}"
        plt.close()
        # bar
        plt.figure(figsize=(12, 6))
        msno.bar(df)
        buf = io.BytesIO()
        plt.savefig(buf, format="png", bbox_inches="tight", transparent=True)
        buf.seek(0)
        plots["bar"] = f"data:image/png;base64,{base64.b64encode(buf.read()).decode()}"
        plt.close()
    except Exception:
        logger.exception("missingness plot error")
    return plots

def create_correlation_heatmap(df: pd.DataFrame) -> Optional[str]:
    try:
        numerical_df = df.select_dtypes(include=[np.number])
        if numerical_df.shape[1] <= 1:
            return None
        plt.figure(figsize=(10, 8))
        corr = numerical_df.corr(numeric_only=True)
        sns.heatmap(corr, annot=True, cmap="vlag", center=0, annot_kws={"color": "white", "weight": "bold"})
        buf = io.BytesIO()
        plt.savefig(buf, format="png", bbox_inches="tight", transparent=True)
        buf.seek(0)
        data = base64.b64encode(buf.read()).decode()
        plt.close()
        return f"data:image/png;base64,{data}"
    except Exception:
        logger.exception("correlation plot error")
        return None

def create_distribution_plots(df: pd.DataFrame, numerical_cols: List[str], max_plots: int = 4, sample_rows: int = MAX_SAMPLE_ROWS) -> Dict[str, str]:
    plots = {}
    working_df = df
    if len(df) > sample_rows:
        working_df = df.sample(sample_rows, random_state=42)
    for col in numerical_cols[:max_plots]:
        try:
            plt.figure(figsize=(8, 6))
            sns.histplot(working_df[col].dropna(), kde=True)
            buf = io.BytesIO()
            plt.savefig(buf, format="png", bbox_inches="tight", transparent=True)
            buf.seek(0)
            data = base64.b64encode(buf.read()).decode()
            plt.close()
            plots[col] = f"data:image/png;base64,{data}"
        except Exception:
            plt.close()
    return plots

def smart_clean(df: pd.DataFrame, max_display_cols: int = MAX_DISPLAY_COLS):
    df_clean = df.copy()
    df_clean = df_clean.dropna(axis=1, how="all")
    df_clean = df_clean.loc[:, ~df_clean.columns.astype(str).str.contains("^Unnamed")]
    # strip object columns
    obj_cols = df_clean.select_dtypes(include=["object"]).columns
    for c in obj_cols:
        df_clean[c] = df_clean[c].astype("object").map(lambda x: x.strip() if isinstance(x, str) else x)
    # normalize tokens
    missing_tokens = {"na", "n/a", "none", "null", "nan", "missing", "unknown", ""}
    for c in obj_cols:
        df_clean[c] = df_clean[c].map(lambda x: np.nan if isinstance(x, str) and x.strip().lower() in missing_tokens else x)
    # Force numeric conversion for columns that look like numbers
    for c in df_clean.select_dtypes(include=["object"]).columns:
        try:
            converted = pd.to_numeric(df_clean[c], errors="coerce")
            # Only convert if majority of non-null values are numeric
            non_null = df_clean[c].notna().sum()
            if non_null > 0 and converted.notna().sum() / non_null > 0.8:
                df_clean[c] = converted
        except Exception:
            pass
    # Parse date columns
    for c in df_clean.select_dtypes(include=["object"]).columns:
        if any(word in c.lower() for word in ["date", "time", "dt", "day"]):
            try:
                df_clean[c] = pd.to_datetime(df_clean[c], errors="coerce")
            except Exception:
                pass
    try:
        df_clean = df_clean.convert_dtypes()
    except Exception:
        pass
    df_display = df_clean.iloc[:, :max_display_cols]
    return df_clean, df_display

def missing_counts(df: pd.DataFrame) -> Dict[str, int]:
    return {col: int(df[col].isna().sum()) for col in df.columns}

def detect_outliers_iqr(df: pd.DataFrame, cols: Optional[List[str]] = None, k: float = 1.5) -> Dict[str, int]:
    numerical = df.select_dtypes(include=[np.number])
    if cols:
        numerical = numerical[cols]
    outlier_info = {}
    for c in numerical.columns:
        q1 = numerical[c].quantile(0.25)
        q3 = numerical[c].quantile(0.75)
        iqr = q3 - q1
        lower = q1 - k * iqr
        upper = q3 + k * iqr
        mask = (numerical[c] < lower) | (numerical[c] > upper)
        outlier_info[c] = int(mask.sum())
    return outlier_info

def detect_outliers_isolation(df: pd.DataFrame, cols: Optional[List[str]] = None, contamination: float = 0.05) -> Dict[str, Any]:
    out = {}
    numeric = df.select_dtypes(include=[np.number])
    if cols:
        numeric = numeric[cols]
    try:
        if numeric.shape[1] > 0 and len(numeric) > 0:
            iso = IsolationForest(contamination=contamination, random_state=42)
            preds = iso.fit_predict(numeric.fillna(numeric.mean()))
            idxs = np.where(preds == -1)[0]
            out["count"] = int(len(idxs))
            out["sample"] = df.iloc[idxs[:10]].replace({np.nan: None}).to_dict(orient="records")
    except Exception as e:
        out["error"] = str(e)
    return out

def detect_outliers_zscore(df: pd.DataFrame, threshold: float = 3.0) -> Dict[str, int]:
    outlier_info = {}
    numerical = df.select_dtypes(include=[np.number])
    for col in numerical.columns:
        try:
            vals = numerical[col].dropna()
            if vals.empty:
                outlier_info[col] = 0
                continue
            z = np.abs(stats.zscore(vals))
            outlier_info[col] = int((z > threshold).sum())
        except Exception:
            outlier_info[col] = 0
    return outlier_info

def generate_auto_insights(df: pd.DataFrame, filename: str) -> List[str]:
    insights = []
    try:
        total_missing = int(df.isnull().sum().sum())
        numerical_cols = df.select_dtypes(include=[np.number]).columns.tolist()
        categorical_cols = df.select_dtypes(exclude=[np.number]).columns.tolist()

        insights.append(f"📁 File: {filename}")
        insights.append(f"🧮 Shape: {df.shape[0]} rows × {df.shape[1]} columns")
        insights.append(f"⚠️ {total_missing} Missing Value{'s' if total_missing != 1 else ''} Found")

        # Domain hints
        column_names = " ".join(df.columns.astype(str)).lower()
        if any(word in column_names for word in ["price", "sales", "revenue", "profit"]):
            insights.append("💰 Financial dataset detected - consider time series and volatility analysis")
        if any(word in column_names for word in ["patient", "medical", "health", "disease"]):
            insights.append("🏥 Healthcare dataset detected - check sensitive fields and PHI")

        # correlation highlights
        if len(numerical_cols) >= 2:
            sample = df[numerical_cols].dropna()
            if len(sample) > 5000:
                sample = sample.sample(5000, random_state=42)
            corr = sample.corr(numeric_only=True).abs().unstack().sort_values(ascending=False)
            corr = corr[corr < 1.0].dropna().head(5)
            for ((a, b), val) in corr.items():
                insights.append(f"🔗 Strong correlation: {a} ↔ {b} (|r|={val:.2f})")

        # top categories
        for col in categorical_cols[:12]:
            series = df[col].dropna()
            if not series.empty:
                top = series.mode().iloc[0]
                cnt = int(series.value_counts().get(top, 0))
                insights.append(f"🔹 Most frequent in {col}: {top} ({cnt})")

        # numerical summaries
        for col in numerical_cols[:12]:
            s = pd.to_numeric(df[col], errors="coerce").dropna()
            if not s.empty:
                insights.append(f"📊 {col} → Min: {s.min()}, Max: {s.max()}, Mean: {s.mean():.2f}")

        # outlier detection summary
        outliers_iqr = detect_outliers_iqr(df)
        total_outliers = sum(outliers_iqr.values()) if outliers_iqr else 0
        if total_outliers > 0:
            insights.append(f"⚠️ {total_outliers} potential outliers detected using IQR method")

        duplicate_count = int(df.duplicated().sum())
        if duplicate_count > 0:
            insights.append(f"🔍 {duplicate_count} duplicate rows found")

    except Exception as e:
        logger.exception("auto insights error")
        insights.append(f"⚠️ Auto-insights generation failed: {e}")
    return insights

def cleanup_expired_sessions() -> int:
    """Remove expired sessions from DATASETS. Returns number removed."""
    now = time.time()
    expired = []
    for sid, payload in list(DATASETS.items()):
        ts = payload.get("timestamp", 0) if isinstance(payload, dict) else 0
        if ts and (now - ts) > SESSION_EXPIRY:
            expired.append(sid)
    for sid in expired:
        try:
            del DATASETS[sid]
            logger.info(f"Removed expired session {sid}")
        except KeyError:
            pass
    return len(expired)

# main.py — Part 2/2
# FastAPI app and middleware
app = FastAPI(title="EDA & LLM Backend")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ALLOW_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000,*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Utility: store sessions as dict with 'dataframe' and 'timestamp' to allow expiry
def _store_session(df: pd.DataFrame, filename: str) -> str:
    sid = str(uuid.uuid4())
    DATASETS[sid] = {
        "dataframe": df,
        "timestamp": time.time(),
        "filename": filename
    }
    return sid

def _get_session_df(session_id: str) -> pd.DataFrame:
    payload = DATASETS.get(session_id)
    if not payload or not isinstance(payload, dict):
        raise KeyError("Invalid session_id")
    return payload["dataframe"]

@app.get("/")
def root():
    return {"message": "EDA backend running"}

# Upload endpoint — create session and return metadata + visuals
@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...), max_display_cols: int = Query(MAX_DISPLAY_COLS, ge=5, le=1000)):
    try:
        cleanup_expired_sessions()
        ext = (file.filename or "").split(".")[-1].lower()
        if ext == "csv":
            # read as object to avoid type coercion issues
            df = pd.read_csv(file.file, na_values=["", "NA", "NaN"], dtype=object)
        elif ext in ("xlsx", "xls"):
            df = pd.read_excel(file.file, engine="openpyxl", dtype=object)
        else:
            raise HTTPException(status_code=400, detail="Unsupported file format. Upload CSV or Excel.")

        df_full, df_display = smart_clean(df, max_display_cols=max_display_cols)
        session_id = _store_session(df_full, file.filename)

        numerical_cols = df_display.select_dtypes(include=[np.number]).columns.tolist()
        categorical_cols = df_display.select_dtypes(exclude=[np.number]).columns.tolist()

        correlation_chart = create_correlation_heatmap(df_display)
        distribution_plots = create_distribution_plots(df_display, numerical_cols)
        missingness_plots = create_missingness_plots(df_display)
        auto_insights = generate_auto_insights(df_display, file.filename)
        outliers_iqr = detect_outliers_iqr(df_full, cols=numerical_cols) if numerical_cols else {}
        outliers_iso = detect_outliers_isolation(df_full, cols=numerical_cols) if numerical_cols else {}
        outliers_zscore = detect_outliers_zscore(df_full) if numerical_cols else {}
        duplicates_preview = df_full[df_full.duplicated(keep=False)].head(10).replace({np.nan: None}).to_dict(orient="records")

        response = {
            "session_id": session_id,
            "filename": file.filename,
            "shape": {"rows": int(df_display.shape[0]), "columns": int(df_display.shape[1])},
            "columns": df_display.columns.astype(str).tolist(),
            "missing_values": missing_counts(df_display),
            "numerical_columns": numerical_cols,
            "basic_stats": df_display[numerical_cols].describe().T.to_dict() if len(numerical_cols) else {},
            "categorical_stats": {col: df_display[col].value_counts().to_dict() for col in categorical_cols} if len(categorical_cols) else {},
            "sample_data": df_display.head(5).replace({np.nan: None}).to_dict(orient="records"),
            "correlation_chart": correlation_chart,
            "distribution_plots": distribution_plots,
            "missingness_plots": missingness_plots,
            "auto_insights": auto_insights,
            "outliers_iqr": outliers_iqr,
            "outliers_iso": outliers_iso,
            "outliers_zscore": outliers_zscore,
            "duplicates": duplicates_preview,
            "message": f"Focused on {df_display.shape[1]} columns for display.",
            "full_data_preserved": True
        }
        return response
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("upload failed")
        raise HTTPException(status_code=500, detail=str(e))


 # --- SQL endpoint ---
# --- SQL endpoint (UPDATED for file upload) ---
@app.post("/api/connect-sql")
async def connect_sql(
    query: str = Form(...),
    file: UploadFile = File(...)
):
    # Create a temporary file to store the uploaded database
    import tempfile
    import os
    temp_dir = tempfile.mkdtemp()
    db_path = os.path.join(temp_dir, file.filename)
    
    try:
        # Save the uploaded database file
        with open(db_path, "wb") as f:
            content = await file.read()
            f.write(content)
        
        # Validate that it's a valid SQLite database
        try:
            conn = sqlite3.connect(db_path)
            conn.execute("SELECT name FROM sqlite_master WHERE type='table';")
            conn.close()
        except sqlite3.Error:
            raise HTTPException(status_code=400, detail="Uploaded file is not a valid SQLite database")
        
        # 1. Fetch data using the function from data_sources.py
        df = fetch_sql_data(query, db_path)
        
        # Check if query returned data
        if df.empty:
            raise HTTPException(status_code=400, detail="SQL query returned no data")
        
        # 2. Use your existing logic for cleaning and session storage
        df_full, df_display = smart_clean(df)
        session_id = _store_session(df_full, f"SQL: {file.filename}")
        
        # 3. Generate all your existing metadata and charts
        numerical_cols = df_display.select_dtypes(include=[np.number]).columns.tolist()
        categorical_cols = df_display.select_dtypes(exclude=[np.number]).columns.tolist()

        correlation_chart = create_correlation_heatmap(df_display)
        distribution_plots = create_distribution_plots(df_display, numerical_cols)
        missingness_plots = create_missingness_plots(df_display)
        auto_insights = generate_auto_insights(df_display, f"SQL: {file.filename}")
        outliers_iqr = detect_outliers_iqr(df_full, cols=numerical_cols) if numerical_cols else {}
        outliers_iso = detect_outliers_isolation(df_full, cols=numerical_cols) if numerical_cols else {}
        outliers_zscore = detect_outliers_zscore(df_full) if numerical_cols else {}
        duplicates_preview = df_full[df_full.duplicated(keep=False)].head(10).replace({np.nan: None}).to_dict(orient="records")

        # 4. Return the complete, structured response
        response = {
            "session_id": session_id,
            "filename": f"SQL: {file.filename}",
            "shape": {"rows": int(df_display.shape[0]), "columns": int(df_display.shape[1])},
            "columns": df_display.columns.astype(str).tolist(),
            "missing_values": missing_counts(df_display),
            "numerical_columns": numerical_cols,
            "basic_stats": df_display[numerical_cols].describe().T.to_dict() if len(numerical_cols) else {},
            "categorical_stats": {col: df_display[col].value_counts().to_dict() for col in categorical_cols} if len(categorical_cols) else {},
            "sample_data": df_display.head(5).replace({np.nan: None}).to_dict(orient="records"),
            "correlation_chart": correlation_chart,
            "distribution_plots": distribution_plots,
            "missingness_plots": missingness_plots,
            "auto_insights": auto_insights,
            "outliers_iqr": outliers_iqr,
            "outliers_iso": outliers_iso,
            "outliers_zscore": outliers_zscore,
            "duplicates": duplicates_preview,
            "message": f"Data successfully loaded from SQL query on {file.filename}.",
            "full_data_preserved": True
        }
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("SQL connection failed")
        raise HTTPException(status_code=500, detail=f"SQL connection failed: {str(e)}")
    finally:
        # Clean up: delete the temporary file and directory
        try:
            if os.path.exists(db_path):
                os.remove(db_path)
            os.rmdir(temp_dir)
        except:
            pass  # Don't worry if cleanup fails

# --- API endpoint ---
@app.post("/api/fetch-api")
async def fetch_api(req: APIRequest):
    try:
        cleanup_expired_sessions()
        # 1. Fetch data using the function from data_sources.py
        df = fetch_api_data(req.url, req.params, req.headers)

        # 2. Use your existing logic for cleaning and session storage
        df_full, df_display = smart_clean(df)
        session_id = _store_session(df_full, f"API Data from {req.url}")

        # 3. Generate all your existing metadata and charts
        numerical_cols = df_display.select_dtypes(include=[np.number]).columns.tolist()
        categorical_cols = df_display.select_dtypes(exclude=[np.number]).columns.tolist()

        correlation_chart = create_correlation_heatmap(df_display)
        distribution_plots = create_distribution_plots(df_display, numerical_cols)
        missingness_plots = create_missingness_plots(df_display)
        auto_insights = generate_auto_insights(df_display, f"API Data from {req.url}")
        outliers_iqr = detect_outliers_iqr(df_full, cols=numerical_cols) if numerical_cols else {}
        outliers_iso = detect_outliers_isolation(df_full, cols=numerical_cols) if numerical_cols else {}
        outliers_zscore = detect_outliers_zscore(df_full) if numerical_cols else {}
        duplicates_preview = df_full[df_full.duplicated(keep=False)].head(10).replace({np.nan: None}).to_dict(orient="records")

        # 4. Return the complete, structured response
        response = {
            "session_id": session_id,
            "filename": f"API Data from {req.url}",
            "shape": {"rows": int(df_display.shape[0]), "columns": int(df_display.shape[1])},
            "columns": df_display.columns.astype(str).tolist(),
            "missing_values": missing_counts(df_display),
            "numerical_columns": numerical_cols,
            "basic_stats": df_display[numerical_cols].describe().T.to_dict() if len(numerical_cols) else {},
            "categorical_stats": {col: df_display[col].value_counts().to_dict() for col in categorical_cols} if len(categorical_cols) else {},
            "sample_data": df_display.head(5).replace({np.nan: None}).to_dict(orient="records"),
            "correlation_chart": correlation_chart,
            "distribution_plots": distribution_plots,
            "missingness_plots": missingness_plots,
            "auto_insights": auto_insights,
            "outliers_iqr": outliers_iqr,
            "outliers_iso": outliers_iso,
            "outliers_zscore": outliers_zscore,
            "duplicates": duplicates_preview,
            "message": "Data successfully loaded from API.",
            "full_data_preserved": True
        }
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
       

# Add these endpoints to your FastAPI app
@app.get("/api/sample")
async def get_sample(sessionId: str = Query(..., alias="session_id"), page: int = 0, size: int = 50):
    if sessionId not in DATASETS:
        raise HTTPException(status_code=404, detail="Session not found")
    df = _get_session_df(sessionId)
    start_idx = page * size
    end_idx = start_idx + size
    sample_data = df.iloc[start_idx:end_idx].replace({np.nan: None}).to_dict(orient="records")
    return {"data": sample_data, "total": len(df)}

@app.get("/api/columns")
async def get_columns(sessionId: str = Query(..., alias="session_id")):
    if sessionId not in DATASETS:
        raise HTTPException(status_code=404, detail="Session not found")
    df = _get_session_df(sessionId)
    return {"dtypes": df.dtypes.astype(str).to_dict()}

@app.post("/api/clean-data")
async def clean_data(file: UploadFile = File(...)):
    try:
        ext = (file.filename or "").split(".")[-1].lower()
        if ext == "csv":
            df = pd.read_csv(file.file, na_values=["", "NA", "NaN"], dtype=object)
        elif ext in ("xlsx", "xls"):
            df = pd.read_excel(file.file, engine="openpyxl", dtype=object)
        else:
            raise HTTPException(status_code=400, detail="Unsupported file format. Upload CSV or Excel.")

        # Apply your cleaning
        df_full, df_display = smart_clean(df)

        return {
            "cleaned_data": df_display.head(100).replace({np.nan: None}).to_dict(orient="records"),
            "shape": {"rows": int(df_display.shape[0]), "columns": int(df_display.shape[1])},
            "columns": df_display.columns.astype(str).tolist()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Enhanced LLM analysis endpoint — uses enhanced_langchain_service
@app.post("/api/llm-analyze-enhanced")
async def enhanced_llm_analyze(request: LLMAnalyzeRequest):
    """
    Returns a structured analysis from the LLM using dataset context.
    """
    try:
        cleanup_expired_sessions()
        # ✅ Get values from JSON body (correct way)
        session_id = request.session_id
        query = request.query
        chat_history = request.chat_history
        data_context = request.data_context
        
        if session_id not in DATASETS:
            raise HTTPException(status_code=400, detail="Invalid session_id")
        df = _get_session_df(session_id)

        enhanced_context = {
            "filename": DATASETS[session_id].get("filename", session_id),
            "shape": {"rows": df.shape[0], "columns": df.shape[1]},
            "columns": df.columns.tolist(),
            "numerical_columns": df.select_dtypes(include=[np.number]).columns.tolist(),
            "categorical_columns": df.select_dtypes(exclude=[np.number]).columns.tolist(),
            "missing_values": {col: int(df[col].isna().sum()) for col in df.columns},
            "sample_data": df.head(3).replace({np.nan: None}).to_dict(orient="records"),
            "basic_stats": df.describe().to_dict() if len(df.select_dtypes(include=[np.number]).columns) > 0 else {}
        }

        # Merge with any additional context from request
        if data_context:
            enhanced_context.update(data_context)

        # Build a robust prompt
        missing_summary = ", ".join([f"{k}: {v}" for k, v in enhanced_context["missing_values"].items() if v > 0]) or "None"
        
        chat_history_str = ""
        if chat_history:
            chat_history_str = "\n".join([
                f"{msg.get('role', 'user').upper()}: {msg.get('content', '')}" 
                for msg in chat_history[-3:]
            ])
        
        prompt = f"""**You are an expert Data Scientist AI** analyzing this dataset:

DATASET:
- FILENAME: {enhanced_context['filename']}
- SHAPE: {enhanced_context['shape']['rows']} rows × {enhanced_context['shape']['columns']} columns
- COLUMNS: {', '.join(enhanced_context['columns'])}
- NUMERICAL: {', '.join(enhanced_context['numerical_columns'])}
- CATEGORICAL: {', '.join(enhanced_context['categorical_columns'])}
- MISSING VALUES: {missing_summary}

CHAT_HISTORY:
{chat_history_str or 'No history'}

USER QUESTION:
{query}

RESPONSE REQUIREMENTS:
1) Provide SPECIFIC advice for THIS dataset
2) Include example Python/pandas CODE when appropriate in a ```python``` block
3) Suggest 2-3 NEXT_STEPS
4) If recommending visualization, include CHART_TYPE
5) Use the structured format: EXPLANATION, CODE, NEXT_STEPS, CHART_TYPE, DOMAIN_INSIGHTS
"""

        # call enhanced LLM service
        result = await enhanced_langchain_service.enhanced_analyze_data(prompt, enhanced_context)
        result["data_context"] = enhanced_context
        result["query"] = query
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Enhanced LLM analysis failed")
        return {"error": str(e), "explanation": f"Analysis failed: {str(e)}", "success": False}

# Execute code endpoint — runs LLM-generated code in sandbox
@app.post("/api/execute-code")
async def execute_code(sessionId: str = Query(..., alias="session_id"), code: str = Query(...)):
    """
    Execute user/LLM code safely against the session dataframe.
    Returns plot image / text output / modified dataframe preview where applicable.
    """
    try:
        cleanup_expired_sessions()
        if sessionId not in DATASETS:
            return {"error": "Invalid session_id", "success": False}
        payload = DATASETS[sessionId]
        df = payload["dataframe"]

        # Security check
        if not security.is_code_safe(code):
            return {"error": "Code contains potentially dangerous operations", "success": False}

        safe_env = security.create_safe_environment(df)
        output_capture = io.StringIO()
        safe_env["print"] = lambda *args, **kwargs: print(*args, **kwargs, file=output_capture)

        try:
            # Execute in restricted globals (no builtins), locals as safe_env
            exec(code, {"__builtins__": {}}, safe_env)

            # If plot produced using plt: capture and return image
            try:
                if "plt" in safe_env and hasattr(safe_env["plt"], "savefig"):
                    # Try get current figure (depends on allowed plt methods)
                    buf = io.BytesIO()
                    # If user used plt.savefig in code, it will have created something on disk/figs;
                    # We attempt to call savefig safely on plt object in safe_env.
                    try:
                        safe_env["plt"].savefig(buf, format="png", bbox_inches="tight")
                        buf.seek(0)
                        img = base64.b64encode(buf.read()).decode()
                        safe_env["plt"].close()
                        return {"success": True, "result": f"data:image/png;base64,{img}", "type": "plot"}
                    except Exception:
                        # fallback: no plot produced
                        pass
            except Exception:
                pass

            # If the user modified df in safe_env, return a preview
            if "df" in safe_env and isinstance(safe_env["df"], pd.DataFrame):
                new_df = safe_env["df"]
                if not new_df.equals(df):
                    return {"success": True, "type": "dataframe", "result": new_df.head(10).replace({np.nan: None}).to_dict(orient="records"), "rows": len(new_df)}

            # Otherwise, return any print output
            output_value = output_capture.getvalue()
            if output_value:
                return {"success": True, "type": "text", "result": output_value}

            return {"success": True, "result": "Code executed successfully", "type": "success"}
        except Exception as e:
            tb = traceback.format_exc()
            logger.exception("Execution error")
            return {"success": False, "error": str(e), "traceback": tb}
    except Exception as e:
        logger.exception("Code execution failed")
        return {"success": False, "error": str(e)}

# Health & maintenance endpoints
@app.get("/api/health")
async def health_check():
    cleaned = cleanup_expired_sessions()
    return {
        "status": "healthy",
        "services": {
            "datasets_loaded": len(DATASETS),
            "cleaned_data_cache": len(CLEANED_DATA),
            "sessions_cleaned": cleaned,
            "timestamp": time.time()
        }
    }

@app.post("/api/cleanup-sessions")
async def cleanup_sessions():
    try:
        removed = cleanup_expired_sessions()
        return {"success": True, "sessions_cleaned": removed, "remaining_sessions": len(DATASETS)}
    except Exception as e:
        logger.exception("cleanup sessions failed")
        return {"success": False, "error": str(e)}

# Optional helper: get stored sample data
@app.get("/api/session/{session_id}/sample")
async def session_sample(session_id: str):
    try:
        if session_id not in DATASETS:
            raise HTTPException(status_code=404, detail="Session not found")
        df = _get_session_df(session_id)
        return {"sample": df.head(20).replace({np.nan: None}).to_dict(orient="records")}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("session sample failed")
        raise HTTPException(status_code=500, detail=str(e))

# Run server
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("PORT", 8000)), reload=True)