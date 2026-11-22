import type { TranscriptContext } from "@earendil-works/pi-ai";
import { readProviderError } from "../core/provider-response-error.ts";

const words = new Intl.Segmenter(undefined, { granularity: "word" });
// Grammatical words alone do not identify a request. A diagnostic made entirely
// of these words or punctuation carries no actionable explanation.
const grammar = new Set(
  "a an and are as at be by cannot did do does for from has in is it must never no not of on or that the this to up was were with without".split(
    " ",
  ),
);

function excerpt(text: string) {
  return text.length <= 300 ? text : `${text.slice(0, 299).replace(/[\uD800-\uDBFF]$/u, "")}…`;
}

/** Keep a bounded explanation, withholding quoted inputs and masking shared words. */
export function providerDetail(
  error: unknown,
  messages: TranscriptContext["messages"],
  redact: (text: string) => string,
): string | undefined {
  const raw = error instanceof Error ? error.message : error;
  if (typeof raw !== "string") return;
  const { message } = readProviderError(raw);
  if (!message) return;
  const reason = redact(message)
    .split(/[\r\n\p{Zl}\p{Zp}]/u, 1)[0]
    ?.trim();
  if (
    !reason ||
    /[{}]|<[!?/a-z]|\bdata:[^\s,]*;base64,|\b(?:authorization|cookie|bearer|basic\s+\S{8}|(?:api[_ -]?key|password|token|credential|secret|request body|prompt|content|headers)(?:\s+(?:provided|value))?\s*[:=])/i.test(
      reason,
    )
  )
    return;

  // Public protocol literals can also occur in an attachment or system prompt.
  // Retain the complete explanation, never a gateway's appended input or metadata.
  const publicReason =
    /^(?:(?:the )?(?:developer|system|assistant|tool|user) role is not supported|no backend is available for this model)(?:[.!](?=\s|$)|$)/i.exec(
      reason,
    );
  if (publicReason) return publicReason[0];
  // These controls have small numeric bounds; comparing "2" against every
  // message would hide the actionable limit in "Temperature must be <= 2."
  if (
    /^(?:temperature|top_p) must be [<>]=?\s*(?:[01](?:\.\d{1,2})?|2(?:\.0{1,2})?)[.!]?$/i.test(
      reason,
    )
  )
    return reason;

  let safe = excerpt(
    reason
      .replace(/https?:\/\/\S+|\beyJ[\w-]+\.[\w-]+\.[\w-]*/gi, "[REDACTED]")
      .replace(/[\p{Cc}\p{Cf}]/gu, " ")
      .trim(),
  );

  // A gateway may quote just a slice of a rejected image, without a data URI.
  // Compare bounded runs against the original encoding, including its punctuation.
  // Keep image bytes out of Unicode normalization and word segmentation.
  const images = messages.flatMap((entry) =>
    typeof entry.content === "string"
      ? []
      : entry.content.flatMap((part) => (part.type === "image" ? [part.data] : [])),
  );
  if (images.length) {
    safe = safe.replace(/[A-Za-z0-9+/]+={0,2}/g, (run) =>
      images.some((data) => data.includes(run)) ? "[REDACTED]" : run,
    );
  }

  // Match short, quoted values (also symbols or names on a line in a file) as a
  // unit. A punctuation-only turn must not match the period in every explanation.
  const normalize = (value: string) => value.normalize("NFKC").toLowerCase();
  const quoted = [
    safe,
    ...Array.from(safe.matchAll(/["“`']([^"”`']+)["”`']|:\s*(.+)$/gu), (m) =>
      (m[1] ?? m[2] ?? "").trim(),
    ),
  ]
    .filter(Boolean)
    .map(normalize);
  const parts = Array.from(words.segment(safe));
  const remaining = new Set(
    parts
      .filter((part) => part.isWordLike || /\p{Extended_Pictographic}/u.test(part.segment))
      .map((part) => normalize(part.segment))
      .filter((word) => !grammar.has(word)),
  );
  if (!remaining.size) return;
  const shared = new Set<string>();
  function quotesInput(value: unknown): boolean {
    if (typeof value === "string") {
      const source = normalize(value);
      if (quoted.some((fragment) => source.includes(fragment))) return true;
      for (const word of remaining) {
        if (source.includes(word)) {
          shared.add(word);
          remaining.delete(word);
        }
      }
      return false;
    }
    if (!value || typeof value !== "object") return false;
    return Object.entries(value).some(([key, item]) => quotesInput(key) || quotesInput(item));
  }
  const quotedInput = messages.some((entry) => {
    if (entry.role === "system" && quotesInput(entry.sections)) return true;
    if (typeof entry.content === "string") return quotesInput(entry.content);
    return entry.content.some((part) => {
      if (part.type === "text") return quotesInput(part.text);
      if (part.type === "toolCall") return quotesInput(part.arguments);
      return part.type === "thinking" && quotesInput(part.thinking);
    });
  });
  if (!quotedInput && !shared.size) return excerpt(safe);

  if (quotedInput || !remaining.size) return;
  // Common words in Pi Bot's own instructions should not erase the rest of an
  // otherwise useful gateway error. Only retain words absent from request data
  // and grammatical glue; never reconstruct a quoted request value.
  return excerpt(
    parts
      .map((part) => (shared.has(normalize(part.segment)) ? "[REDACTED]" : part.segment))
      .join("")
      .replace(/\[REDACTED\](?:\s*\[REDACTED\])+/g, "[REDACTED]"),
  );
}
