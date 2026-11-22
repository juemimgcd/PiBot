import { z } from "zod";
import type { MessageSchema } from "./entities.ts";

type Message = z.infer<typeof MessageSchema>;

/** Older builds saved output truncation as done; interpret its receipt without rewriting history. */
export function messageFailureCode(
  message: Pick<Message, "role" | "status" | "errorCode" | "usage">,
) {
  if (message.status === "error" || message.role === "error")
    return message.errorCode ?? "internal";
  const usage = message.usage;
  if (
    message.role === "assistant" &&
    message.status === "done" &&
    usage &&
    typeof usage === "object" &&
    !Array.isArray(usage) &&
    usage.stopReason === "length"
  )
    return "output_limit";
  return undefined;
}

const providerFailure = z.strictObject({
  status: z.number().int().min(100).max(599).optional(),
  detail: z.string().max(300).optional(),
});

export function messageProviderFailure(message: Pick<Message, "usage">) {
  const usage = message.usage;
  if (!usage || typeof usage !== "object" || Array.isArray(usage)) return;
  const parsed = providerFailure.safeParse(usage.providerFailure);
  return parsed.success ? parsed.data : undefined;
}
