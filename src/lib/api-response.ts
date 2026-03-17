import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function apiOk<T>(data: T, init?: { status?: number }) {
  return NextResponse.json(data, {
    status: init?.status ?? 200,
  });
}

export function apiError(message: string, status = 500, details?: unknown) {
  return NextResponse.json(
    {
      error: message,
      details,
    },
    {
      status,
    },
  );
}

export function fromError(error: unknown) {
  if (error instanceof ZodError) {
    return apiError("Validation failed", 400, error.issues);
  }

  const message = error instanceof Error ? error.message : "Unexpected server error";
  return apiError(message, 500);
}
