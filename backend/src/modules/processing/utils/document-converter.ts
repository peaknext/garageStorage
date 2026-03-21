import { Logger } from '@nestjs/common';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as sharp from 'sharp';

const execFileAsync = promisify(execFile);
const logger = new Logger('DocumentConverter');

// MIME type to file extension mapping (LibreOffice needs correct extension)
const MIME_TO_EXTENSION: Record<string, string> = {
  'application/pdf': '.pdf',
  'text/plain': '.txt',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.ms-powerpoint': '.ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
};

/** All MIME types supported for document thumbnail generation */
export const DOCUMENT_MIME_TYPES = Object.keys(MIME_TO_EXTENSION);

/** MIME types that require LibreOffice for conversion */
export const OFFICE_MIME_TYPES = [
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];

let libreOfficeAvailable: boolean | null = null;

/**
 * Check if LibreOffice is installed at the given path.
 * Result is cached for the process lifetime.
 */
export async function checkLibreOfficeInstalled(libreOfficePath: string): Promise<boolean> {
  if (libreOfficeAvailable !== null) return libreOfficeAvailable;
  try {
    await fs.promises.access(libreOfficePath, fs.constants.X_OK);
    libreOfficeAvailable = true;
    logger.log(`LibreOffice found at: ${libreOfficePath}`);
  } catch {
    libreOfficeAvailable = false;
    logger.warn(`LibreOffice not found at: ${libreOfficePath}. Office document thumbnails will be disabled.`);
  }
  return libreOfficeAvailable;
}

/**
 * Convert a PDF buffer to a PNG image buffer (renders first page).
 * Uses pdfjs-dist with @napi-rs/canvas for server-side rendering.
 */
export async function convertPdfToImage(
  pdfBuffer: Buffer,
  options: { width: number; height: number },
): Promise<Buffer> {
  // Dynamic imports to avoid issues if dependencies are missing
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const { createCanvas } = await import('@napi-rs/canvas');

  const data = new Uint8Array(pdfBuffer);
  const doc = await pdfjsLib.getDocument({ data, disableFontFace: true }).promise;
  const page = await doc.getPage(1);

  // Calculate viewport to fit within target dimensions
  const unscaledViewport = page.getViewport({ scale: 1 });
  const scale = Math.min(
    (options.width * 2) / unscaledViewport.width,   // 2x for quality
    (options.height * 2) / unscaledViewport.height,
  );
  const viewport = page.getViewport({ scale });

  const canvas = createCanvas(viewport.width, viewport.height);
  const context = canvas.getContext('2d');

  // White background
  context.fillStyle = '#FFFFFF';
  context.fillRect(0, 0, viewport.width, viewport.height);

  await page.render({
    canvasContext: context as any,
    viewport,
  }).promise;

  await doc.destroy();
  return Buffer.from(canvas.toBuffer('image/png'));
}

/**
 * Render a text file as an image (first ~50 lines).
 */
export async function convertTextToImage(
  textBuffer: Buffer,
  options: { width: number; height: number },
): Promise<Buffer> {
  const { createCanvas } = await import('@napi-rs/canvas');

  const text = textBuffer.toString('utf-8');
  const lines = text.split('\n').slice(0, 50);

  const canvasWidth = options.width * 2;  // 2x for quality
  const canvasHeight = options.height * 2;
  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext('2d');

  // White background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Text rendering
  const fontSize = 14;
  const lineHeight = fontSize * 1.5;
  const padding = 20;
  const maxWidth = canvasWidth - padding * 2;

  ctx.fillStyle = '#333333';
  ctx.font = `${fontSize}px monospace`;

  let y = padding + fontSize;
  for (const line of lines) {
    if (y > canvasHeight - padding) {
      // Draw truncation indicator
      ctx.fillStyle = '#999999';
      ctx.font = `italic ${fontSize}px sans-serif`;
      ctx.fillText('...', padding, y);
      break;
    }
    // Truncate long lines
    const maxChars = Math.floor(maxWidth / (fontSize * 0.6));
    const displayLine = line.length > maxChars ? line.substring(0, maxChars) + '...' : line;
    ctx.fillText(displayLine, padding, y);
    y += lineHeight;
  }

  return Buffer.from(canvas.toBuffer('image/png'));
}

/**
 * Convert an Office document (doc/docx/xls/xlsx/ppt/pptx) to a PDF buffer
 * using LibreOffice headless mode.
 */
export async function convertOfficeToPdf(
  fileBuffer: Buffer,
  mimeType: string,
  libreOfficePath: string,
  tempDir?: string,
): Promise<Buffer> {
  const workDir = tempDir || path.join(os.tmpdir(), 'skh-storage-processing');
  await fs.promises.mkdir(workDir, { recursive: true });

  const ext = MIME_TO_EXTENSION[mimeType] || '.tmp';
  const tempId = `doc-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  const inputPath = path.join(workDir, `${tempId}${ext}`);
  const expectedPdfPath = path.join(workDir, `${tempId}.pdf`);

  try {
    await fs.promises.writeFile(inputPath, fileBuffer);

    await execFileAsync(libreOfficePath, [
      '--headless',
      '--convert-to', 'pdf',
      '--outdir', workDir,
      inputPath,
    ], { timeout: 30000 });

    const pdfBuffer = await fs.promises.readFile(expectedPdfPath);
    return pdfBuffer;
  } finally {
    // Cleanup temp files
    for (const f of [inputPath, expectedPdfPath]) {
      try { await fs.promises.unlink(f); } catch { /* ignore */ }
    }
  }
}

/**
 * Get the file extension for a MIME type.
 */
export function getExtensionForMime(mimeType: string): string {
  return MIME_TO_EXTENSION[mimeType] || '';
}
