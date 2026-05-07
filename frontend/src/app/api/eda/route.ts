import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const maxDisplayCols = formData.get("max_display_cols") || "50";

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    
    const backendFormData = new FormData();
    backendFormData.append("file", file);
    backendFormData.append("max_display_cols", maxDisplayCols.toString());

    const res = await fetch(`${API_URL}/api/upload`, {
      method: "POST",
      body: backendFormData,
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error("Backend error:", res.status, errorText);
      throw new Error(`Backend error: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("EDA route error:", error);
    return NextResponse.json(
      { error: error.message || "File upload and analysis failed" },
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