import type { AgentRuntime } from "@pibot/agent";

/** Model content must not escape while the keyring is still seeding the shared redactor. */
export function gateAgentContent(
  runtime: AgentRuntime,
  ready: (signal?: AbortSignal) => Promise<void>,
  {
    redact,
    redactProviderDetail,
  }: { redact(text: string): string; redactProviderDetail(text: string): string },
): AgentRuntime {
  const gate =
    <Input extends { signal?: AbortSignal }, Output>(
      action: (input: Input) => Promise<Output>,
      prepare: (input: Input) => Input = (input) => input,
    ) =>
    async (input: Input): Promise<Output> => {
      await ready(input.signal);
      input.signal?.throwIfAborted();
      return action(prepare(input));
    };
  return {
    ...runtime,
    openSession: gate(runtime.openSession, (input) => ({
      ...input,
      redactProviderDetail,
      systemPrompt:
        typeof input.systemPrompt === "string" ? redact(input.systemPrompt) : input.systemPrompt,
    })),
    generatePersona: gate(runtime.generatePersona, (input) => ({
      ...input,
      description: redact(input.description),
    })),
    ...(runtime.compactHistory && { compactHistory: gate(runtime.compactHistory) }),
    ...(runtime.estimateContext && { estimateContext: gate(runtime.estimateContext) }),
    ...(runtime.generateImage && {
      generateImage: gate(runtime.generateImage, (input) => ({
        ...input,
        prompt: redact(input.prompt),
      })),
    }),
    ...(runtime.draftCommitMessage && {
      draftCommitMessage: gate(runtime.draftCommitMessage, (input) => ({
        ...input,
        summary: redact(input.summary),
      })),
    }),
    ...(runtime.transformMessage && {
      transformMessage: gate(runtime.transformMessage, (input) => ({
        ...input,
        text: redact(input.text),
      })),
    }),
    ...(runtime.extractPage && {
      extractPage: gate(runtime.extractPage, (input) => ({
        ...input,
        question: redact(input.question),
        page: {
          url: redact(input.page.url),
          title: redact(input.page.title),
          text: redact(input.page.text),
        },
      })),
    }),
    ...(runtime.draftSkill && {
      draftSkill: gate(runtime.draftSkill, (input) => ({ ...input, steps: redact(input.steps) })),
    }),
    ...(runtime.draftMemories && {
      draftMemories: gate(runtime.draftMemories, (input) => ({
        ...input,
        text: redact(input.text),
      })),
    }),
  };
}
