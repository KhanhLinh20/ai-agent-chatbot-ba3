import { z } from "zod";

import {
  EmbeddingProviderError,
  type EmbeddingProvider,
} from "@/lib/ai/embedding-provider";

const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;

const embeddingResponseSchema = z.object({
  data: z
    .array(
      z.object({
        embedding: z.array(z.number()).length(EMBEDDING_DIMENSIONS),
        index: z.number().int().nonnegative(),
      }),
    )
    .min(1),
});

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions = EMBEDDING_DIMENSIONS;

  constructor(
    private readonly apiKey: string,
    private readonly model = DEFAULT_EMBEDDING_MODEL,
  ) {
    if (!apiKey.trim()) {
      throw new EmbeddingProviderError(
        "OPENAI_API_KEY chưa được cấu hình.",
        "CONFIGURATION_ERROR",
      );
    }
  }

  async embed(text: string): Promise<number[]> {
    const [embedding] = await this.embedMany([text]);
    return embedding;
  }

  async embedMany(texts: string[]): Promise<number[][]> {
    const input = texts.map((text) => text.trim()).filter(Boolean);
    if (!input.length) {
      throw new EmbeddingProviderError(
        "Nội dung tạo embedding không được để trống.",
        "INVALID_RESPONSE",
      );
    }

    let response: Response;
    try {
      response = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          input,
          encoding_format: "float",
        }),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      throw new EmbeddingProviderError(
        "Không thể kết nối dịch vụ embedding.",
        "PROVIDER_ERROR",
        { cause: error },
      );
    }

    if (!response.ok) {
      throw new EmbeddingProviderError(
        `Dịch vụ embedding trả về HTTP ${response.status}.`,
        "PROVIDER_ERROR",
      );
    }

    const parsed = embeddingResponseSchema.safeParse(await response.json());
    if (!parsed.success || parsed.data.data.length !== input.length) {
      throw new EmbeddingProviderError(
        "Dữ liệu embedding trả về không hợp lệ.",
        "INVALID_RESPONSE",
      );
    }

    return parsed.data.data
      .sort((left, right) => left.index - right.index)
      .map((item) => item.embedding);
  }
}

export function createEmbeddingProvider(): EmbeddingProvider | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  return apiKey
    ? new OpenAIEmbeddingProvider(
        apiKey,
        process.env.OPENAI_EMBEDDING_MODEL?.trim() ||
          DEFAULT_EMBEDDING_MODEL,
      )
    : null;
}
