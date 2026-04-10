#!/usr/bin/env node

/**
 * PostToolUse hook script for session_init tool.
 * Extracts enrolledId from tool_response and caches to temp file.
 *
 * Hook input (stdin JSON):
 * {
 *   session_id: string,
 *   tool_name: string,
 *   tool_response: string | Array<{type: string, text: string}>,
 *   ...
 * }
 */

import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

try {
  const input = JSON.parse(readFileSync("/dev/stdin", "utf8"));
  const { session_id, tool_response } = input;

  if (!session_id || !tool_response) {
    console.error(
      `[atani] Missing fields. Received keys: ${Object.keys(input).join(", ")}`,
    );
    process.exit(0);
  }

  // Extract ATANI_IDENTITY JSON from tool response
  // Format: <!-- ATANI_IDENTITY:{"enrolledId":"...","name":"...","email":"..."} -->
  // tool_response can be a string, or an array of {type, text} objects
  let response;
  if (typeof tool_response === "string") {
    response = tool_response;
  } else if (Array.isArray(tool_response)) {
    response = tool_response.map((item) => item.text || "").join("");
  } else {
    response = JSON.stringify(tool_response);
  }

  const match = response.match(/ATANI_IDENTITY:(\{.*?\})\s*-->/);
  if (!match) {
    console.error("[atani] ATANI_IDENTITY marker not found in tool_response");
    process.exit(0);
  }

  const identity = JSON.parse(match[1]);
  const cacheFile = join(tmpdir(), `atani-session-${session_id}.json`);
  writeFileSync(cacheFile, JSON.stringify(identity, null, 2));
  console.error(
    `[atani] Identity cached: ${identity.name} (${identity.enrolledId})`,
  );
} catch (e) {
  console.error(`[atani] cache-identity error: ${e.message}`);
  // Don't fail the hook — just log the error
  process.exit(0);
}
