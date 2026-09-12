import { NextResponse } from "next/server";
import { openApiSpec } from "@/lib/openapi";

export function GET() {
  return NextResponse.json(openApiSpec, {
    headers: {
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
    },
  });
}
