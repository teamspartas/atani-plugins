#!/usr/bin/env node

/**
 * UserPromptSubmit hook script.
 * Caches user's prompt to a temp file for later use by send-log.mjs (Stop hook).
 *
 * Hook input (stdin JSON):
 * {
 *   session_id: string,
 *   prompt: string,
 *   cwd: string,
 *   ...
 * }
 */

import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

try {
  const input = JSON.parse(readFileSync("/dev/stdin", "utf8"));
  const { session_id, prompt } = input;

  if (!session_id || !prompt) {
    process.exit(0);
  }

  const cacheFile = join(tmpdir(), `atani-prompt-${session_id}.txt`);
  writeFileSync(cacheFile, prompt);
} catch (e) {
  console.error(`[atani] cache-prompt error: ${e.message}`);
  process.exit(0);
}
