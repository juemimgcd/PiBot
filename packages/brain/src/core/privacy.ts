import {
  createRedactor,
  type NamedRedactor,
  type Redactor,
  withNamedRedaction,
} from "@pibot/secrets";

export type BrainRedactor = NamedRedactor;

export function createBrainRedactor() {
  const shared = withNamedRedaction(createRedactor());
  // Chat redaction deliberately ignores short anonymous values (e.g. a one-letter
  // local model key). Provider diagnostics can quote those credentials verbatim.
  const shortSecrets = new Map<string, RegExp>();
  return {
    ...shared,
    add(value: string) {
      shared.add(value);
      if (value.length < 8 && !shortSecrets.has(value)) {
        const literal = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        shortSecrets.set(
          value,
          new RegExp(`(?<![\\p{L}\\p{N}_])${literal}(?![\\p{L}\\p{N}_])`, "gu"),
        );
      }
    },
    redactProviderDetail(text: string) {
      // Match a standalone credential. A one-letter local key can otherwise hide
      // unrelated explanations from every provider that happens to use that letter.
      let result = shared.redact(text);
      for (const token of shortSecrets.values()) result = result.replace(token, "[REDACTED]");
      return result;
    },
  };
}

export function redactValue(value: unknown, redactor: Redactor): unknown {
  if (typeof value === "string") return redactor.redact(value);
  if (Array.isArray(value)) return value.map((item) => redactValue(item, redactor));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, redactValue(item, redactor)]),
    );
  return value;
}
