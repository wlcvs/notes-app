import { NextResponse } from "next/server";
import type { ZodError } from "zod";

/** 400 with a flattened list of validation issues. */
export function invalid(error: ZodError) {
  return NextResponse.json(
    { error: "invalid_payload", issues: error.issues },
    { status: 400 },
  );
}

/** 404 for a missing resource. */
export function notFound(resource = "resource") {
  return NextResponse.json(
    { error: "not_found", resource },
    { status: 404 },
  );
}

/** 400 for a body that isn't valid JSON. */
export function malformedJson() {
  return NextResponse.json(
    { error: "malformed_json" },
    { status: 400 },
  );
}

/** Parse a request body as JSON, or null if it can't be parsed. */
export async function readJson(req: Request): Promise<unknown | null> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}
