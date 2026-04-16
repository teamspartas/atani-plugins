#!/usr/bin/env node

/**
 * Stop hook script.
 * Reads cached identity + cached prompt + last_assistant_message,
 * then sends the turn log to Atani server.
 *
 * Hook input (stdin JSON):
 * {
 *   session_id: string,
 *   cwd: string,
 *   stop_hook_active: boolean,
 *   last_assistant_message: string,
 *   ...
 * }
 */

import { readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const MCP_URL = "https://atani-mcp.vercel.app";

try {
  const input = readFileSync("/dev/stdin", "utf8");
  const { session_id, stop_hook_active, last_assistant_message } =
    JSON.parse(input);

  // Prevent infinite loops — exit if this Stop was triggered by a previous Stop hook
  if (stop_hook_active) {
    process.exit(0);
  }

  if (!session_id) {
    console.error("[atani] No session_id in hook input");
    process.exit(0);
  }

  // 1. Read cached identity
  const identityCacheFile = join(tmpdir(), `atani-session-${session_id}.json`);
  if (!existsSync(identityCacheFile)) {
    process.exit(0);
  }

  const identity = JSON.parse(readFileSync(identityCacheFile, "utf8"));
  const { enrolledId, logApiKey } = identity;

  if (!logApiKey || !enrolledId) {
    console.error(
      "[atani] logApiKey or enrolledId missing in identity cache. Skipping.",
    );
    process.exit(0);
  }

  // 2. Read cached user prompt
  const promptCacheFile = join(tmpdir(), `atani-prompt-${session_id}.txt`);
  const prompt = existsSync(promptCacheFile)
    ? readFileSync(promptCacheFile, "utf8")
    : "";

  // 3. Read cached AskUserQuestion Q&A pairs
  const askCacheFile = join(tmpdir(), `atani-ask-${session_id}.json`);
  let askQA = "";
  if (existsSync(askCacheFile)) {
    try {
      const entries = JSON.parse(readFileSync(askCacheFile, "utf8"));
      if (Array.isArray(entries) && entries.length > 0) {
        askQA = "\n\n[Q&A]\n" + entries
          .map((e) => `Q: ${e.question}\nA: ${e.answer}`)
          .join("\n");
      }
    } catch {
      // ignore parse errors
    }
  }

  if (!prompt && !last_assistant_message && !askQA) {
    process.exit(0);
  }

  // 4. Send to server
  const response = (last_assistant_message || "") + askQA;
  const body = JSON.stringify({
    enrolledId,
    sessionId: session_id,
    prompt,
    response,
    sentAt: new Date().toISOString(),
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(`${MCP_URL}/api/logs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": logApiKey,
      },
      body,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      const result = await response.json();
      console.error(`[atani] Log sent successfully: ${result.logId || "ok"}`);
    } else {
      const errorText = await response.text();
      console.error(
        `[atani] Log send failed (${response.status}): ${errorText}`,
      );
    }
  } catch (fetchError) {
    clearTimeout(timeoutId);
    if (fetchError.name === "AbortError") {
      console.error("[atani] Log send timed out after 10s");
    } else {
      console.error(`[atani] Log send error: ${fetchError.message}`);
    }
  }
} catch (e) {
  console.error(`[atani] send-log error: ${e.message}`);
  process.exit(0);
}
