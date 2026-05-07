import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { session_id, query, chat_history } = body;

    if (!session_id || !query) {
      return NextResponse.json(
        { error: "Missing session_id or query" },
        { status: 400 }
      );
    }

    const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    
    const url = new URL(`${API_URL}/api/llm-analyze-enhanced`);
    url.searchParams.append("session_id", session_id);
    url.searchParams.append("query", query);

    const res = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ chat_history }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error("Backend LLM error:", res.status, errorText);
      throw new Error(`LLM backend error: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Chat route error:", error);
    return NextResponse.json(
      { error: error.message || "LLM analysis failed" },
      { status: 500 }
    );
  }
}

// 🆕 NEW: Code execution endpoint
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { session_id, code } = body;

    if (!session_id || !code) {
      return NextResponse.json(
        { error: "Missing session_id or code" },
        { status: 400 }
      );
    }

    const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    
    const url = new URL(`${API_URL}/api/execute-code`);
    url.searchParams.append("session_id", session_id);
    url.searchParams.append("code", code);

    const res = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error("Code execution error:", res.status, errorText);
      throw new Error(`Code execution failed: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Code execution route error:", error);
    return NextResponse.json(
      { error: error.message || "Code execution failed" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed" },
    { status: 405 }
  );
}