import { z } from "zod";

const bodyError = z.object({
  message: z.string().optional(),
  // Validation gateways may return errors per field. Only the explanation is public input
  // to the redactor; the same object can also contain the rejected field value.
  detail: z
    .union([z.string(), z.array(z.object({ msg: z.string() }))])
    .optional()
    .catch(undefined),
  code: z.unknown().optional(),
});
const errorBody = z.union([z.object({ error: bodyError }), bodyError]);

/** pi flattens non-2xx responses before the session sees them. Responses may include
 * the same HTTP status twice, once from pi and once from the OpenAI SDK. */
export function readProviderError(text: string): { status?: number; message?: string } {
  const trimmed = text.trim();
  const provider = /^[^\n({]{1,160}\berror\s*\(([45]\d\d)\)\s*:\s*/i.exec(trimmed);
  const rest = trimmed.slice(provider?.[0].length ?? 0);
  const http = /^(?:HTTP(?:\/\d(?:\.\d)?)?\s+([1-5]\d\d)|([45]\d\d))\b[\s:]*/i.exec(rest);
  const httpCode = http?.[1] ?? http?.[2];
  const code = provider?.[1] ?? httpCode;
  const status = code === undefined ? undefined : Number(code);
  const body = http && code === httpCode ? rest.slice(http[0].length) : rest;
  if (!body.startsWith("{")) return { status, message: body };

  // OpenRouter can append raw metadata on a new line after a complete JSON body.
  const firstLine = body.split("\n", 1)[0]?.trimEnd() ?? "";
  const json = firstLine.endsWith("}") ? firstLine : body;
  if (json.length > 16_384) return { status };
  try {
    const parsed = errorBody.safeParse(JSON.parse(json));
    if (!parsed.success) return { status };
    const error = "error" in parsed.data ? parsed.data.error : parsed.data;
    const code = error.code;
    return {
      status:
        status ??
        (typeof code === "number" && Number.isInteger(code) && code >= 400 && code <= 599
          ? code
          : undefined),
      message:
        error.message ?? (typeof error.detail === "string" ? error.detail : error.detail?.[0]?.msg),
    };
  } catch {
    // A truncated JSON body has no reliably separable fields.
    return { status };
  }
}
