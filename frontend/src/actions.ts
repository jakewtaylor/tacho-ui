import type { ActionFunctionArgs } from "react-router-dom";

import {
  ImportDDDFromBytes,
  ImportDDDFromPath,
  WipeDatabase,
} from "../wailsjs/go/main/App";
import type { db } from "../wailsjs/go/models";

export type ImportActionResult =
  | { ok: true; result: db.ImportResult }
  | { ok: false; message: string };

export type WipeActionResult =
  | { ok: true; stats: db.WipeStats }
  | { ok: false; message: string };

/**
 * Resource-route action backing the .ddd importer. Receives a multipart FormData
 * payload with a single `file` entry, base64-encodes the bytes (Wails can't
 * carry raw binary efficiently over its JSON-RPC channel), and forwards to
 * the Go-side ImportDDDFromBytes binding.
 *
 * Errors that should re-render the page as a problem (404, 500, etc.) throw a
 * Response. Errors that should surface inline (wrong file, parse failure, …)
 * are returned as { ok: false } so the caller can toast them.
 */
export async function importAction({
  request,
}: ActionFunctionArgs): Promise<ImportActionResult> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (e: unknown) {
    return {
      ok: false,
      message: `Bad form data: ${String((e as Error)?.message ?? e)}`,
    };
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, message: "No file provided" };
  }
  if (!file.name.toLowerCase().endsWith(".ddd")) {
    return { ok: false, message: `Not a .ddd file: ${file.name}` };
  }

  try {
    const buffer = await file.arrayBuffer();
    const base64 = uint8ArrayToBase64(new Uint8Array(buffer));
    const result = await ImportDDDFromBytes(file.name, base64);
    return { ok: true, result };
  } catch (e: unknown) {
    return { ok: false, message: String((e as Error)?.message ?? e) };
  }
}

/**
 * Resource-route action backing the OS-driven file-association flow. The
 * AppLayout receives a path from `OnFileOpen` (or the pending-files drain),
 * prompts the user, and submits a single `path` form field here on confirm.
 * The Go side reads the file directly — no base64 round-trip needed.
 */
export async function importFromPathAction({
  request,
}: ActionFunctionArgs): Promise<ImportActionResult> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (e: unknown) {
    return {
      ok: false,
      message: `Bad form data: ${String((e as Error)?.message ?? e)}`,
    };
  }
  const path = formData.get("path");
  if (typeof path !== "string" || !path) {
    return { ok: false, message: "No path provided" };
  }
  try {
    const result = await ImportDDDFromPath(path);
    return { ok: true, result };
  } catch (e: unknown) {
    return { ok: false, message: String((e as Error)?.message ?? e) };
  }
}

/** Resource-route action backing the "Wipe database" button. */
export async function wipeAction(): Promise<WipeActionResult> {
  try {
    const stats = await WipeDatabase();
    return { ok: true, stats };
  } catch (e: unknown) {
    return { ok: false, message: String((e as Error)?.message ?? e) };
  }
}

// Chunked base64 encoder — passing the whole Uint8Array through
// String.fromCharCode(...) overflows the JS argument stack on MB-scale files.
function uint8ArrayToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(i, i + chunkSize) as unknown as number[],
    );
  }
  return btoa(binary);
}
