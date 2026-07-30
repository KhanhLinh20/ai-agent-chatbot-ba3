import { z } from "zod";
import { MARTY_SYSTEM_PROMPT } from "@/features/chat/system-prompt";
import type { ProductSearchResult } from "@/features/catalog/schemas";
import type { ChatHistoryItem } from "@/features/chat/schemas";

const responseSchema = z.object({
  text: z.string().min(1).max(1_500),
  usedProductIds: z.array(z.string()).max(3),
  isGrounded: z.boolean(),
  groundingIssues: z.array(z.string()).max(6),
});

export type ChatDraftInput = {
  userMessage: string;
  draft: string;
  products: ProductSearchResult[];
  history: ChatHistoryItem[];
  salesContext?: {
    intent: string;
    stage: string;
    customerProfile: Record<string, unknown>;
    shouldHandoff: boolean;
    handoffReason: string | null;
  };
};

export interface ChatProvider {
  rewrite(input: ChatDraftInput): Promise<string>;
}

class OpenAIChatProvider implements ChatProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async rewrite(input: ChatDraftInput) {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.2,
        messages: [
          { role: "system", content: MARTY_SYSTEM_PROMPT },
          ...input.history.slice(-8).map((item) => ({
            role: item.role,
            content: item.content,
          })),
          {
            role: "user",
            content: JSON.stringify({
              request: input.userMessage,
              salesContext: input.salesContext ?? null,
              verifiedProducts: input.products.map((product) => ({
                id: product.id,
                name: product.name,
                brand: product.brand,
                category: product.category,
                price: product.price,
                inStock: product.inStock,
                description: product.shortDescription.slice(0, 700),
                reason: product.reason,
                descriptionVerified:
                  product.specifications.descriptionVerified === true,
                descriptionSource:
                  product.specifications.descriptionSourceUrl ?? null,
              })),
              safeDraft: input.draft,
              instruction:
                "Tạo câu trả lời cuối cùng theo system prompt và salesContext. Giữ nguyên quyết định an toàn trong safeDraft. Đọc lịch sử để hiểu từ tham chiếu. Nếu safeDraft hỏi làm rõ thì chỉ hỏi một câu, không gợi ý sản phẩm. Không thêm sản phẩm hoặc dữ kiện ngoài verifiedProducts. Trước khi trả JSON, tự kiểm tra câu trả lời có bịa giá, tồn kho, thành phần, công dụng, khuyến mãi/chính sách, lặp câu hỏi, gây áp lực hoặc tiết lộ nội bộ hay không. Nếu có, sửa text trước khi đặt isGrounded=true. usedProductIds chỉ chứa ID được nhắc và phải thuộc verifiedProducts.",
            }),
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "marty_reply",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                text: { type: "string" },
                usedProductIds: {
                  type: "array",
                  items: { type: "string" },
                  maxItems: 3,
                },
                isGrounded: { type: "boolean" },
                groundingIssues: {
                  type: "array",
                  items: { type: "string" },
                  maxItems: 6,
                },
              },
              required: [
                "text",
                "usedProductIds",
                "isGrounded",
                "groundingIssues",
              ],
            },
          },
        },
      }),
      signal: AbortSignal.timeout(12_000),
    });

    if (!response.ok) {
      throw new Error(`OpenAI chat request failed (${response.status}).`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const parsed = responseSchema.parse(
      JSON.parse(payload.choices?.[0]?.message?.content ?? "{}"),
    );
    const allowedIds = new Set(input.products.map((product) => product.id));
    if (parsed.usedProductIds.some((id) => !allowedIds.has(id))) {
      throw new Error("AI reply referenced a product outside retrieved context.");
    }
    if (!parsed.isGrounded) {
      throw new Error(
        `AI reply did not pass grounding check: ${parsed.groundingIssues.join(", ")}`,
      );
    }
    return parsed.text;
  }
}

export function createChatProvider(): ChatProvider | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  return new OpenAIChatProvider(
    apiKey,
    process.env.OPENAI_CHAT_MODEL?.trim() || "gpt-4.1-mini",
  );
}
