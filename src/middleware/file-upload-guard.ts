import { Request, Response, NextFunction } from "express";
// file-type is ESM-only — must use dynamic import
async function getFileType(buffer: Buffer) {
  const { fileTypeFromBuffer } = await import("file-type");
  return fileTypeFromBuffer(buffer);
}
import crypto from "crypto";
import path from "path";

// ─── Allowed file types ──────────────────────────────────────────────────────
// Extension → allowed MIME types (magic-byte verified)

const ALLOWED_FILE_TYPES: Record<string, { mimes: string[]; maxSizeMB: number }> = {
  pdf:  { mimes: ["application/pdf"], maxSizeMB: 25 },
  png:  { mimes: ["image/png"], maxSizeMB: 10 },
  jpg:  { mimes: ["image/jpeg"], maxSizeMB: 10 },
  jpeg: { mimes: ["image/jpeg"], maxSizeMB: 10 },
  webp: { mimes: ["image/webp"], maxSizeMB: 10 },
  gif:  { mimes: ["image/gif"], maxSizeMB: 5 },
  csv:  { mimes: ["text/csv", "text/plain", "application/csv", "application/vnd.ms-excel"], maxSizeMB: 10 },
  xml:  { mimes: ["application/xml", "text/xml"], maxSizeMB: 10 },
};

const ALLOWED_EXTENSIONS = new Set(Object.keys(ALLOWED_FILE_TYPES));

// Text-based formats that file-type cannot detect via magic bytes
const TEXT_BASED_EXTENSIONS = new Set(["csv", "xml"]);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getExtension(filename: string): string {
  return path.extname(filename).replace(/^\./, "").toLowerCase();
}

function sanitizeFilename(original: string): string {
  // Replace everything except alphanumeric, dots, hyphens, underscores
  return original.replace(/[^a-zA-Z0-9.\-_]/g, "_").slice(0, 200);
}

/**
 * Generate a safe storage key: UUID + original extension.
 * No user input in the path — prevents path traversal.
 */
export function generateSafeStorageKey(originalName: string, prefix?: string): string {
  const ext = getExtension(originalName);
  const uuid = crypto.randomUUID();
  const base = prefix ? `${prefix}/${uuid}` : uuid;
  return ext ? `${base}.${ext}` : base;
}

// ─── Validation functions (reusable outside middleware) ──────────────────────

export interface FileValidationResult {
  valid: boolean;
  error?: string;
  detectedMime?: string;
  extension: string;
  sanitizedName: string;
  safeKey: string;
}

export async function validateFileBuffer(
  buffer: Buffer,
  originalName: string,
  opts?: { keyPrefix?: string; allowedExtensions?: Set<string> }
): Promise<FileValidationResult> {
  const ext = getExtension(originalName);
  const sanitizedName = sanitizeFilename(originalName);
  const safeKey = generateSafeStorageKey(originalName, opts?.keyPrefix);
  const allowedExts = opts?.allowedExtensions ?? ALLOWED_EXTENSIONS;

  // 1. Extension whitelist
  if (!ext || !allowedExts.has(ext)) {
    return {
      valid: false,
      error: `Dateityp ".${ext || "?"}" nicht erlaubt. Erlaubt: ${[...allowedExts].join(", ")}`,
      extension: ext,
      sanitizedName,
      safeKey,
    };
  }

  // 2. Size check
  const typeConfig = ALLOWED_FILE_TYPES[ext];
  if (typeConfig) {
    const maxBytes = typeConfig.maxSizeMB * 1024 * 1024;
    if (buffer.length > maxBytes) {
      return {
        valid: false,
        error: `Datei zu groß (${(buffer.length / 1024 / 1024).toFixed(1)} MB). Maximum für .${ext}: ${typeConfig.maxSizeMB} MB`,
        extension: ext,
        sanitizedName,
        safeKey,
      };
    }
  }

  // 3. Magic byte validation (skip for text-based formats)
  if (!TEXT_BASED_EXTENSIONS.has(ext)) {
    const detected = await getFileType(buffer);

    if (!detected) {
      return {
        valid: false,
        error: `Dateiinhalt konnte nicht verifiziert werden. Die Datei ist möglicherweise beschädigt oder hat ein falsches Format.`,
        extension: ext,
        sanitizedName,
        safeKey,
      };
    }

    // Check that detected MIME matches what the extension claims
    if (typeConfig && !typeConfig.mimes.includes(detected.mime)) {
      return {
        valid: false,
        error: `Dateiinhalt stimmt nicht mit der Endung überein. Erwartet: ${typeConfig.mimes.join("/")} — Erkannt: ${detected.mime}`,
        detectedMime: detected.mime,
        extension: ext,
        sanitizedName,
        safeKey,
      };
    }

    return {
      valid: true,
      detectedMime: detected.mime,
      extension: ext,
      sanitizedName,
      safeKey,
    };
  }

  // Text-based: basic sanity check (must be mostly printable)
  const sample = buffer.subarray(0, Math.min(4096, buffer.length));
  const nullBytes = sample.filter((b) => b === 0).length;
  if (nullBytes > sample.length * 0.1) {
    return {
      valid: false,
      error: `Die Datei enthält unerwartete Binärdaten für das Format .${ext}`,
      extension: ext,
      sanitizedName,
      safeKey,
    };
  }

  return {
    valid: true,
    extension: ext,
    sanitizedName,
    safeKey,
  };
}

// ─── Express Middleware ──────────────────────────────────────────────────────

interface FileUploadGuardOptions {
  /** Override allowed extensions (default: all from ALLOWED_FILE_TYPES) */
  allowedExtensions?: string[];
  /** Prefix for safe storage keys */
  keyPrefix?: string;
}

/**
 * Express middleware that validates uploaded files after multer has parsed them.
 * Place AFTER multer middleware in the chain.
 *
 * Usage:
 *   router.post("/upload", upload.single("file"), fileUploadGuard(), controller.handle)
 *   router.post("/csv",    upload.single("file"), fileUploadGuard({ allowedExtensions: ["csv"] }), controller.handle)
 */
export function fileUploadGuard(opts?: FileUploadGuardOptions) {
  const allowedExts = opts?.allowedExtensions
    ? new Set(opts.allowedExtensions.map((e) => e.toLowerCase()))
    : ALLOWED_EXTENSIONS;

  return async (req: Request, res: Response, next: NextFunction) => {
    const multerFile = (req as any).file as
      | { buffer: Buffer; originalname: string; mimetype: string; size: number }
      | undefined;

    if (!multerFile) {
      // No file uploaded — let the route decide if that's OK
      return next();
    }

    try {
      const result = await validateFileBuffer(multerFile.buffer, multerFile.originalname, {
        keyPrefix: opts?.keyPrefix,
        allowedExtensions: allowedExts,
      });

      if (!result.valid) {
        return res.status(400).json({
          success: false,
          message: result.error,
          data: null,
        });
      }

      // Override MIME type with detected one (don't trust client)
      if (result.detectedMime) {
        multerFile.mimetype = result.detectedMime;
      }

      // Attach safe metadata to request for downstream use
      (req as any).__fileGuard = {
        sanitizedName: result.sanitizedName,
        safeKey: result.safeKey,
        detectedMime: result.detectedMime ?? multerFile.mimetype,
        extension: result.extension,
      };

      return next();
    } catch (err) {
      return res.status(400).json({
        success: false,
        message: "Datei konnte nicht validiert werden.",
        data: null,
      });
    }
  };
}

/**
 * Validate a file buffer from base64/JSON upload (not multer).
 * Call this in controllers that use getFileDataFromRequest().
 */
export async function validateUploadedFileData(
  fileBuffer: Buffer,
  fileName: string,
  opts?: { allowedExtensions?: string[]; keyPrefix?: string }
): Promise<FileValidationResult> {
  const allowedExts = opts?.allowedExtensions
    ? new Set(opts.allowedExtensions.map((e) => e.toLowerCase()))
    : ALLOWED_EXTENSIONS;

  return validateFileBuffer(fileBuffer, fileName, {
    keyPrefix: opts?.keyPrefix,
    allowedExtensions: allowedExts,
  });
}
