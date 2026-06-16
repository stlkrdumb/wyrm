/**
 * JSON repair utilities for LLM responses.
 * Handles common LLM mistakes: comments, trailing commas, unquoted keys,
 * unbalanced delimiters, and control characters.
 */

/** Attempt to repair common LLM JSON mistakes before parsing.
 *  String-aware \u2014 preserves // inside string values. */
export function repairJSON(raw: string): string {
  let cleaned = raw;

  // Strip // and /* */ comments only when outside string literals
  cleaned = stripCommentsOutsideStrings(cleaned);

  // Remove trailing commas before } or ]
  cleaned = cleaned.replace(/,(\s*[}\]])/g, "$1");
  // Replace bare Python/JS literals
  cleaned = cleaned.replace(/\b(None|undefined)\b/g, "null");
  cleaned = cleaned.replace(/\bTrue\b/g, "true");
  cleaned = cleaned.replace(/\bFalse\b/g, "false");
  // Fix trailing decimal dot (e.g. 1. \u2192 1.0)
  cleaned = cleaned.replace(/\.(?=\s*[,\}\]])/g, ".0");
  // Strip unescaped control characters from JSON
  cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  // Wrap unquoted keys (word before colon, not already quoted)
  cleaned = cleaned.replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3');
  // Insert missing commas between properties at newlines
  cleaned = cleaned.replace(/}\s*\n(\s*)"/g, '},\n$1"');
  cleaned = cleaned.replace(/]\s*\n(\s*)"/g, '],\n$1"');

  // Close unbalanced braces/brackets with proper nesting (LIFO)
  cleaned = closeUnbalancedDelimiters(cleaned);

  return cleaned;
}

/** Strip single-line and multi-line comments only when NOT inside a string literal.
 *  Tracks string state and escaped quotes. */
export function stripCommentsOutsideStrings(input: string): string {
  let out = "";
  let i = 0;
  let inString = false;
  let stringChar = "";

  while (i < input.length) {
    const ch = input[i];
    const next = input[i + 1];

    if (inString) {
      out += ch;
      if (ch === "\\" && i + 1 < input.length) {
        out += next;
        i += 2;
        continue;
      }
      if (ch === stringChar) inString = false;
      i++;
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = true;
      stringChar = ch;
      out += ch;
      i++;
      continue;
    }

    if (ch === "/" && next === "/") {
      while (i < input.length && input[i] !== "\n") i++;
      continue;
    }

    if (ch === "/" && next === "*") {
      i += 2;
      while (i < input.length && !(input[i] === "*" && input[i + 1] === "/")) i++;
      i += 2;
      continue;
    }

    out += ch;
    i++;
  }

  return out;
}

/** Close unbalanced braces/brackets using a stack for proper nesting (LIFO). */
export function closeUnbalancedDelimiters(input: string): string {
  const stack: string[] = [];
  let inString = false;
  let stringChar = "";

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (inString) {
      if (ch === "\\" && i + 1 < input.length) { i++; continue; }
      if (ch === stringChar) inString = false;
      continue;
    }

    if (ch === '"' || ch === "'") { inString = true; stringChar = ch; continue; }
    if (ch === "{" || ch === "[") stack.push(ch);
    else if (ch === "}" || ch === "]") stack.pop();
  }

  // Build closing string in LIFO order so nesting is preserved
  let closing = "";
  while (stack.length > 0) {
    const opener = stack.pop()!;
    closing += opener === "{" ? "}" : "]";
  }
  return input + closing;
}

/** Parse and validate a percent field from the LLM. Returns undefined if missing/invalid. */
export function parsePercentField(raw: unknown, min: number, max: number): number | undefined {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return undefined;
  const clamped = Math.max(min, Math.min(max, raw));
  return Number(clamped.toFixed(2));
}

/** Strip hallucinated position references from the LLM's reason text. */
export function sanitizeReason(reason: string): string {
  if (!reason || typeof reason !== "string") return reason;
  const patterns: RegExp[] = [
    /manage existing position[^.,]*/gi,
    /current position is held[^.,]*/gi,
    /current position[^.,]*/gi,
    /our position[^.,]*/gi,
    /we hold (a |an )?position[^.,]*/gi,
    /we are holding[^.,]*/gi,
    /maintaining (a |an |our )?position[^.,]*/gi,
    /holding (this |the )?position[^.,]*/gi,
  ];
  let out = reason;
  for (const p of patterns) out = out.replace(p, "");
  return out.replace(/\s{2,}/g, " ").trim();
}

/** Extract all top-level JSON objects from a string.
 *  Useful when the LLM returns multiple JSON objects concatenated. */
export function extractJSONObjects(input: string): any[] {
  const objects: any[] = [];
  let braceCount = 0;
  let startIdx = -1;
  let inString = false;
  let stringChar = "";

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (inString) {
      if (ch === "\\" && i + 1 < input.length) {
        i++;
        continue;
      }
      if (ch === stringChar) {
        inString = false;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = true;
      stringChar = ch;
      continue;
    }

    if (ch === "{") {
      if (braceCount === 0) {
        startIdx = i;
      }
      braceCount++;
    } else if (ch === "}") {
      braceCount--;
      if (braceCount === 0 && startIdx !== -1) {
        const candidate = input.slice(startIdx, i + 1);
        try {
          const parsed = JSON.parse(repairJSON(candidate));
          objects.push(parsed);
        } catch {
          try {
            const repaired = repairJSON(candidate);
            objects.push(JSON.parse(repaired));
          } catch {
            // ignore invalid blocks
          }
        }
        startIdx = -1;
      }
    }
  }

  return objects;
}
