import { GoogleGenAI } from "@google/genai";
import { afterEach, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllGlobals());

it.each([
  'data: {"error":{"code":400,"message":"Unexpected message role."}}',
  'event: error\ndata: {"message":"Unexpected message role."}',
])("surfaces a Google gateway error inside an HTTP 200 stream: %s", async (event) => {
  vi.stubGlobal(
    "fetch",
    async () => new Response(`${event}\n\n`, { headers: { "content-type": "text/event-stream" } }),
  );
  const sdk = new GoogleGenAI({ apiKey: "test-key" });
  const stream = await sdk.models.generateContentStream({ model: "gemini-test", contents: "hi" });
  await expect(stream.next()).rejects.toMatchObject({
    status: 200,
    message: "HTTP 200: Unexpected message role.",
  });
});
