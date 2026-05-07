# backend/data_sources.py
import pandas as pd
import sqlite3
import requests
from typing import Dict, Any, Optional

# --- SQL Helper ---
def fetch_sql_data(query: str, db_path: str):
    """Fetch data from SQL database and return as DataFrame."""
    try:
        conn = sqlite3.connect(db_path)
        df = pd.read_sql_query(query, conn)
        conn.close()
        return df
    except Exception as e:
        raise Exception(f"SQL Error: {str(e)}")

# --- API Helper ---
def fetch_api_data(url: str, params: Optional[Dict[str, Any]] = None, headers: Optional[Dict[str, str]] = None):
    """Fetch data from external API and return as DataFrame."""
    try:
        response = requests.get(url, params=params or {}, headers=headers or {})
        response.raise_for_status()
        data = response.json()
        
        # Handle different API response formats
        if isinstance(data, list):
            # Direct array of objects: [{"col1": "val1"}, {"col2": "val2"}]
            return pd.DataFrame(data)
        elif isinstance(data, dict):
            if 'data' in data and isinstance(data['data'], list):
                # Wrapped data: {"data": [{...}, {...}]}
                return pd.DataFrame(data['data'])
            elif 'results' in data and isinstance(data['results'], list):
                # Results key: {"results": [{...}, {...}]}
                return pd.DataFrame(data['results'])
            elif 'items' in data and isinstance(data['items'], list):
                # Items key: {"items": [{...}, {...}]}
                return pd.DataFrame(data['items'])
            else:
                # Single object or other structure - try to flatten
                return pd.json_normalize(data)
        else:
            raise Exception("Unsupported API response format")
    except Exception as e:
        raise Exception(f"API Error: {str(e)}")