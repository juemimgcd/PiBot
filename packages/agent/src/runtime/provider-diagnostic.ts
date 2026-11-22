import { readProviderError } from "../core/provider-response-error.ts";

/** Only the local chat failure hint receives the redacted first line. */
export function providerDetail(error: unknown, redact: (text: string) => string) {
  const raw = error instanceof Error ? error.message : error;
  if (typeof raw !== "string") return;
  const { message } = readProviderError(raw);
  if (!message) return;
  const line = redact(message)
    .split(/[\r\n\p{Zl}\p{Zp}]/u, 1)[0]
    ?.trim();
  if (!line) return;
  return line.length <= 300 ? line : `${line.slice(0, 299).replace(/[\uD800-\uDBFF]$/u, "")}…`;
}
