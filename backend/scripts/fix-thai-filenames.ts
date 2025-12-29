/**
 * Script to fix corrupted Thai/Unicode filenames in the database.
 *
 * Problem: Multer parses filenames as Latin-1, causing UTF-8 filenames
 * to be double-encoded (UTF-8 bytes interpreted as Latin-1, then stored as UTF-8).
 *
 * Solution: This script reverses the double-encoding by:
 * 1. Converting the stored string back to Latin-1 bytes
 * 2. Interpreting those bytes as UTF-8
 *
 * Usage: npx ts-node scripts/fix-thai-filenames.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Check if a string appears to be double-encoded UTF-8.
 * Double-encoded Thai looks like: à¸\u009E (UTF-8 bytes treated as Latin-1)
 */
function isDoubleEncoded(str: string): boolean {
  // Pattern: Latin-1 characters that are typically part of double-encoded UTF-8
  // Thai UTF-8 bytes start with 0xE0, which becomes 'à' in Latin-1
  // Chinese/Japanese start with 0xE4-0xE9, etc.
  return /[\u00C0-\u00FF][\u0080-\u00BF]/.test(str);
}

/**
 * Fix double-encoded UTF-8 string.
 */
function fixEncoding(str: string): string {
  try {
    // Convert the incorrectly decoded string back to bytes (as Latin-1)
    const bytes = Buffer.from(str, 'latin1');
    // Decode those bytes as UTF-8
    const decoded = bytes.toString('utf8');
    return decoded;
  } catch {
    return str;
  }
}

async function main() {
  console.log('Scanning for files with corrupted filenames...\n');

  // Get all files
  const files = await prisma.file.findMany({
    select: {
      id: true,
      originalName: true,
    },
  });

  let fixedCount = 0;
  let skippedCount = 0;
  const fixes: { id: string; oldName: string; newName: string }[] = [];

  for (const file of files) {
    if (isDoubleEncoded(file.originalName)) {
      const fixedName = fixEncoding(file.originalName);

      // Verify the fix looks reasonable (not more garbled)
      if (fixedName !== file.originalName && !isDoubleEncoded(fixedName)) {
        fixes.push({
          id: file.id,
          oldName: file.originalName,
          newName: fixedName,
        });
        fixedCount++;
      } else {
        skippedCount++;
      }
    }
  }

  if (fixes.length === 0) {
    console.log('No corrupted filenames found. All files look OK!');
    return;
  }

  console.log(`Found ${fixes.length} files with corrupted filenames:\n`);

  // Show preview of fixes
  for (const fix of fixes.slice(0, 10)) {
    console.log(`  ID: ${fix.id}`);
    console.log(`  Old: ${fix.oldName}`);
    console.log(`  New: ${fix.newName}`);
    console.log('');
  }

  if (fixes.length > 10) {
    console.log(`  ... and ${fixes.length - 10} more\n`);
  }

  // Check if --apply flag is passed
  const shouldApply = process.argv.includes('--apply');

  if (!shouldApply) {
    console.log('To apply these fixes, run:');
    console.log('  npx ts-node scripts/fix-thai-filenames.ts --apply\n');
    return;
  }

  console.log('Applying fixes...\n');

  // Apply fixes in batches
  const batchSize = 100;
  for (let i = 0; i < fixes.length; i += batchSize) {
    const batch = fixes.slice(i, i + batchSize);

    await prisma.$transaction(
      batch.map((fix) =>
        prisma.file.update({
          where: { id: fix.id },
          data: { originalName: fix.newName },
        })
      )
    );

    console.log(`  Fixed ${Math.min(i + batchSize, fixes.length)} / ${fixes.length} files`);
  }

  console.log(`\nDone! Fixed ${fixes.length} filenames.`);
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
