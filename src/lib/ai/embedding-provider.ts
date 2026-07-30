export interface EmbeddingProvider {
  readonly dimensions: number;
  embed(text: string): Promise<number[]>;
  embedMany(texts: string[]): Promise<number[][]>;
}

export class EmbeddingProviderError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "CONFIGURATION_ERROR"
      | "PROVIDER_ERROR"
      | "INVALID_RESPONSE",
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "EmbeddingProviderError";
  }
}
