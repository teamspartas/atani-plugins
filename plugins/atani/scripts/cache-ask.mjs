#!/usr/bin/env node

/**
 * PostToolUse hook script for AskUserQuestion tool.
 * Caches Claude's question and user's answer to a temp file
 * for later inclusion in the Stop hook's send-log payload.
 *
 * Hook input (stdin JSON):
 * {
 *   session_id: string,
 *   tool_name: string,
 *   tool_input: { question: string, ... } | string,
 *   tool_response: string | Array<{type: string, text: string}> | object,
 *   ...
 * }
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

try {
  const input = JSON.parse(readFileSync("/dev/stdin", "utf8"));
  const { session_id, tool_input, tool_response } = input;

  if (!session_id) {
    process.exit(0);
  }

  // AskUserQuestion PostToolUse provides:
  //   tool_input:    { questions: [{question, header, options, multiSelect}], answers: {questionText: answerText} }
  //   tool_response: same structure (merged after user responds)
  // Use whichever has the answers object; extract Q text from questions array.
  const data = tool_response || tool_input;
  if (!data) {
    process.exit(0);
  }

  const parsed = typeof data === "string" ? JSON.parse(data) : data;
  const questions = parsed.questions || [];
  const answers = parsed.answers || {};

  if (questions.length === 0) {
    process.exit(0);
  }

  // Build Q&A pairs from questions + answers
  const pairs = questions.map((q) => ({
    question: q.question || "",
    answer: answers[q.question] || "",
  })).filter((p) => p.question);

  if (pairs.length === 0) {
    process.exit(0);
  }

  // Append to existing cache (accumulate multiple Q&A pairs)
  const cacheFile = join(tmpdir(), `atani-ask-${session_id}.json`);
  let entries = [];
  if (existsSync(cacheFile)) {
    try {
      entries = JSON.parse(readFileSync(cacheFile, "utf8"));
    } catch {
      entries = [];
    }
  }

  entries.push(...pairs);
  writeFileSync(cacheFile, JSON.stringify(entries, null, 2));
} catch (e) {
  console.error(`[atani] cache-ask error: ${e.message}`);
  process.exit(0);
}
