import { timingSafeEqual } from "node:crypto";
import type { RowDataPacket } from "mysql2";

import { queryReadOnly, withWriteTransaction } from "./db";
import { createPreviewNonce, parseCsvImport, payloadHash, previewBinding, requireImportIdempotencySecret, validateImport, writeImport, type ImportError, type ImportValidation } from "./import-service";
import type { NormalizedImport } from "./import-schema";

const maxImportBytes = Number(process.env.EXAMS_IMPORT_MAX_BYTES ?? 1_048_576);
const acceptedFileTypes = new Set(["application/json", "text/csv", "application/csv"]);

export interface ImportPreview extends ImportValidation { idempotencyKey?: string }

function databaseError(error: unknown): ImportPreview {
  return { valid: false, errors: [{ path: "database", message: error instanceof Error ? error.message : "Could not validate import" }] };
}

async function ensureTaxonomy(normalizedImport: NormalizedImport): Promise<ImportError[]> {
  const errors: ImportError[] = [];
  const categories = await queryReadOnly<Array<RowDataPacket & { id: string }>>("SELECT id FROM categories WHERE name = ? LIMIT 1", [normalizedImport.category]);
  if (!categories[0]) errors.push({ path: "category", message: "category does not exist" });
  for (const [index, tag] of normalizedImport.tags.entries()) {
    const tags = await queryReadOnly<Array<RowDataPacket & { id: string }>>("SELECT id FROM tags WHERE name = ? LIMIT 1", [tag]);
    if (!tags[0]) errors.push({ path: `tags[${index}]`, message: "tag does not exist" });
  }
  return errors;
}

function assertManagementWritesEnabled() {
  if (process.env.EXAMS_MANAGEMENT_WRITES_ENABLED !== "true") throw new Error("Exam management writes are disabled");
  requireImportIdempotencySecret();
}

function previewTtlMilliseconds(): number {
  const seconds = Number(process.env.EXAMS_IMPORT_PREVIEW_TTL_SECONDS ?? 900);
  if (!Number.isInteger(seconds) || seconds < 60 || seconds > 3_600) throw new Error("EXAMS_IMPORT_PREVIEW_TTL_SECONDS must be between 60 and 3600");
  return seconds * 1000;
}

export async function previewImport(input: unknown, discordId: string): Promise<ImportPreview> {
  assertManagementWritesEnabled();
  const validation = validateImport(input);
  if (!validation.valid || !validation.normalizedImport) return validation;
  try {
    const errors = await ensureTaxonomy(validation.normalizedImport);
    if (errors.length > 0) return { valid: false, errors };
    const idempotencyKey = createPreviewNonce();
    const digest = payloadHash(validation.normalizedImport);
    await withWriteTransaction((connection) => connection.execute(
      `INSERT INTO exam_import_previews (nonce, payload_hash, imported_by_discord_id, binding_hash, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
      [idempotencyKey, digest, discordId, previewBinding(idempotencyKey, digest, discordId), new Date(Date.now() + previewTtlMilliseconds())],
    ));
    return { ...validation, idempotencyKey };
  } catch (error) {
    return databaseError(error);
  }
}

export async function previewUploadedImport(file: File, discordId: string): Promise<ImportPreview> {
  if (!acceptedFileTypes.has(file.type)) return { valid: false, errors: [{ path: "file", message: "unsupported MIME type; upload JSON or CSV" }] };
  if (!Number.isFinite(maxImportBytes) || file.size > maxImportBytes) return { valid: false, errors: [{ path: "file", message: `file exceeds ${maxImportBytes} byte limit` }] };
  const text = await file.text();
  if (file.type === "text/csv" || file.type === "application/csv") {
    const csv = parseCsvImport(text);
    return csv.valid && csv.normalizedImport ? previewImport(csv.normalizedImport, discordId) : csv;
  }
  try { return previewImport(JSON.parse(text), discordId); }
  catch { return { valid: false, errors: [{ path: "file", message: "invalid JSON" }] }; }
}

function safeKeyEqual(left: string, right: string) {
  const a = Buffer.from(left); const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function commitPreviewedImport(input: unknown, idempotencyKey: string, discordId: string,
  impersonation?: { realActorAccountId: string; impersonatedAccountId: string; impersonatedDiscordId: string }) {
  assertManagementWritesEnabled();
  const validation = validateImport(input);
  if (!validation.valid || !validation.normalizedImport) return validation;
  const errors = await ensureTaxonomy(validation.normalizedImport);
  if (errors.length > 0) return { valid: false, errors };
  const categoryRows = await queryReadOnly<Array<RowDataPacket & { id: string }>>("SELECT id FROM categories WHERE name = ? LIMIT 1", [validation.normalizedImport.category]);
  const tagIds: string[] = [];
  for (const tag of validation.normalizedImport.tags) {
    const tagRows = await queryReadOnly<Array<RowDataPacket & { id: string }>>("SELECT id FROM tags WHERE name = ? LIMIT 1", [tag]);
    // Taxonomy was just checked above; retaining this guard prevents an ID-less write if it changed concurrently.
    if (!tagRows[0]) return { valid: false, errors: [{ path: "tags", message: "tag no longer exists" }] };
    tagIds.push(tagRows[0].id);
  }
  return withWriteTransaction(async (connection) => {
    type PreviewRow = { payload_hash: string; imported_by_discord_id: string; binding_hash: string; expires_at: Date | string; consumed_at: Date | string | null };
    const [rows] = await connection.execute(
      "SELECT payload_hash, imported_by_discord_id, binding_hash, expires_at, consumed_at FROM exam_import_previews WHERE nonce = ? FOR UPDATE",
      [idempotencyKey],
    ) as unknown as [PreviewRow[]];
    const preview = rows[0];
    const digest = payloadHash(validation.normalizedImport!);
    if (!preview || preview.imported_by_discord_id !== discordId || preview.payload_hash !== digest ||
      !safeKeyEqual(preview.binding_hash, previewBinding(idempotencyKey, digest, discordId)) || preview.consumed_at ||
      new Date(preview.expires_at).getTime() <= Date.now()) {
      return { valid: false as const, errors: [{ path: "idempotencyKey", message: "preview is invalid, expired, or already used" }] };
    }
    await connection.execute("UPDATE exam_import_previews SET consumed_at = CURRENT_TIMESTAMP WHERE nonce = ? AND consumed_at IS NULL", [idempotencyKey]);
    const imported = await writeImport(connection, {
      normalizedImport: validation.normalizedImport!, categoryId: categoryRows[0].id, tagIds, importedByDiscordId: discordId, idempotencyKey, impersonation,
    });
    return { valid: true as const, errors: [] as ImportError[], result: imported };
  });
}
