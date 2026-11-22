import type { createTranslator } from "@pibot/i18n";
import { type Message, messageProviderFailure } from "@pibot/protocol";

export function providerFailureText(
  message: Pick<Message, "usage">,
  t: ReturnType<typeof createTranslator>,
) {
  const failure = messageProviderFailure(message);
  if (!failure) return;
  const { status, detail } = failure;
  const response = [status && `HTTP ${status}`, detail].filter(Boolean).join(" · ");
  if (response)
    return t(
      status && status >= 200 && status < 300
        ? "chat.providerStreamFailure"
        : "chat.providerFailure",
      { response },
    );
}
