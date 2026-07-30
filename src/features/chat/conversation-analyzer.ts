import { z } from "zod";
import type { ChatRequest } from "@/features/chat/schemas";
import {
  buildConsultationProfile,
  missingConsultationField,
  type ConsultationProfile,
} from "@/features/chat/consultation-profile";

export const salesIntentSchema = z.enum([
  "greeting",
  "product_discovery",
  "product_information",
  "product_comparison",
  "recommendation",
  "price_question",
  "stock_question",
  "shipping_question",
  "policy_question",
  "objection",
  "purchase_intent",
  "order_support",
  "complaint",
  "human_support",
  "unrelated",
]);

export const purchaseStageSchema = z.enum([
  "discover",
  "consider",
  "compare",
  "objection",
  "purchase",
  "after_sales",
]);

const analysisSchema = z.object({
  salesIntent: salesIntentSchema,
  stage: purchaseStageSchema,
  category: z
    .enum(["banh-keo", "ca-phe", "gia-vi", "do-uong"])
    .nullable(),
  budgetMin: z.number().nonnegative().nullable(),
  budgetMax: z.number().positive().nullable(),
  useCase: z.string().trim().min(1).max(160).nullable(),
  preference: z.string().trim().min(1).max(160).nullable(),
  recipient: z.string().trim().min(1).max(120).nullable(),
  preferredFeatures: z.array(z.string().trim().min(1).max(120)).max(8),
  unwantedFeatures: z.array(z.string().trim().min(1).max(120)).max(8),
  variantPreferences: z.array(z.string().trim().min(1).max(120)).max(8),
  requiredTime: z.string().trim().min(1).max(120).nullable(),
  mentionedProducts: z.array(z.string().trim().min(1).max(180)).max(5),
  purchaseReadiness: z.enum(["low", "medium", "high"]),
  missingInformation: z.array(z.string().trim().min(1).max(80)).max(8),
  shouldHandoff: z.boolean(),
  handoffReason: z.string().trim().min(1).max(240).nullable(),
  isNewNeed: z.boolean(),
  retrievalQuery: z.string().trim().min(2).max(500),
  confidence: z.number().min(0).max(1),
});

type InternalIntent =
  | "discover"
  | "recommend"
  | "compare"
  | "product_detail"
  | "faq"
  | "lead"
  | "checkout";

export type ConversationAnalysis = z.infer<typeof analysisSchema> & {
  intent: InternalIntent;
  profile: ConsultationProfile;
};

const ANALYZER_PROMPT = `
Bạn là bộ phân tích trạng thái hội thoại cho chatbot tư vấn bán hàng FMCG tiếng Việt.

Mục tiêu:
- Đọc TOÀN BỘ lịch sử và tin nhắn mới nhất; không hỏi lại hay làm mất thông tin khách đã cung cấp.
- Phân loại đúng salesIntent và giai đoạn mua hàng.
- Chỉ trích xuất dữ kiện khách trực tiếp cung cấp hoặc xác nhận; không suy đoán.
- Khi khách nói “loại nào cũng được”, “không quan trọng”, “tùy bạn”, “không biết” hoặc tương đương, đặt preference="khong uu tien", không để null.
- Chỉ đặt isNewNeed=true khi khách nói rõ muốn đổi sang nhu cầu hoặc nhóm hàng khác.
- Chỉ đặt shouldHandoff=true khi khách muốn người thật, khiếu nại/tranh chấp, hỗ trợ đơn đã đặt, thương lượng giá, giao gấp/tồn kho cần xác nhận, mua số lượng lớn, hoặc thông tin cần thiết không có trong hệ thống.
- retrievalQuery phải là truy vấn tìm sản phẩm độc lập, giữ loại hàng, thương hiệu/quy cách, mục đích, người dùng, ngân sách, tính năng ưu tiên/loại trừ và phiên bản đã nêu. Không thêm tiêu chí mới.
- Cụm “dưới/tối đa/khoảng X” chỉ đặt budgetMax=X và budgetMin=null. Chỉ đặt budgetMin khi khách nói rõ “từ/trên/tối thiểu/ít nhất X”.
- missingInformation chỉ chứa dữ kiện thực sự cần cho quyết định hiện tại. Nếu khách đang hỏi chi tiết một sản phẩm cụ thể, không ép họ trả lời đủ bộ câu hỏi tư vấn.

Giai đoạn:
- discover: nhu cầu còn mơ hồ.
- consider: đã có tiêu chí hoặc đang xem sản phẩm.
- compare: đang so sánh.
- objection: băn khoăn về giá, chất lượng, chính sách hoặc mức độ phù hợp.
- purchase: đã có ý định mua.
- after_sales: hỗ trợ sau khi mua.

Trả về đúng JSON theo schema.
`.trim();

function mapSalesIntent(
  salesIntent: z.infer<typeof salesIntentSchema>,
): InternalIntent {
  if (salesIntent === "product_comparison") return "compare";
  if (
    salesIntent === "product_information" ||
    salesIntent === "price_question" ||
    salesIntent === "stock_question"
  ) {
    return "product_detail";
  }
  if (
    salesIntent === "shipping_question" ||
    salesIntent === "policy_question"
  ) {
    return "faq";
  }
  if (
    salesIntent === "human_support" ||
    salesIntent === "complaint" ||
    salesIntent === "order_support"
  ) {
    return "lead";
  }
  if (salesIntent === "purchase_intent") return "checkout";
  if (salesIntent === "greeting" || salesIntent === "product_discovery") {
    return "discover";
  }
  return "recommend";
}

function normalizeMessage(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/đ/g, "d");
}

function enforceHighSignalIntent(
  parsed: z.infer<typeof analysisSchema>,
  message: string,
): z.infer<typeof analysisSchema> {
  const value = normalizeMessage(message);
  if (/khieu nai|that vong|khong hai long|giao sai|hang loi/.test(value)) {
    return {
      ...parsed,
      salesIntent: "complaint",
      stage: "after_sales",
      shouldHandoff: true,
      handoffReason: "Khách hàng đang khiếu nại hoặc báo lỗi.",
      purchaseReadiness: "high",
    };
  }
  if (/gap nhan vien|noi chuyen voi nhan vien|gap nguoi that/.test(value)) {
    return {
      ...parsed,
      salesIntent: "human_support",
      shouldHandoff: true,
      handoffReason: "Khách hàng yêu cầu gặp nhân viên.",
    };
  }
  if (/don hang cua toi|ma don|don da dat|don cua minh/.test(value)) {
    return {
      ...parsed,
      salesIntent: "order_support",
      stage: "after_sales",
      shouldHandoff: true,
      handoffReason: "Khách hàng cần hỗ trợ đơn đã đặt.",
    };
  }
  if (
    /mac qua|dat qua|gia cao|vuot ngan sach|khong dang gia|re hon khong/.test(
      value,
    )
  ) {
    return {
      ...parsed,
      salesIntent: "objection",
      stage: "objection",
    };
  }
  if (
    /chot (?:loai|san pham|don)|dat hang|toi muon lay|cho (?:toi|minh) \d+|mua (?:loai|cai|san pham) (?:nay|do)/.test(
      value,
    )
  ) {
    return {
      ...parsed,
      salesIntent: "purchase_intent",
      stage: "purchase",
      purchaseReadiness: "high",
    };
  }
  return parsed;
}

function fallbackAnalysis(request: ChatRequest): ConversationAnalysis {
  const profile = buildConsultationProfile(request);
  const recentUserTurns = request.history
    .filter((item) => item.role === "user")
    .slice(-3)
    .map((item) => item.content);
  const normalized = normalizeMessage(request.message);

  const salesIntent: z.infer<typeof salesIntentSchema> =
    /khieu nai|that vong|khong hai long/.test(normalized)
      ? "complaint"
      : /nhan vien|nguoi that|gap nguoi/.test(normalized)
        ? "human_support"
        : /don hang cua toi|ma don|don da dat/.test(normalized)
          ? "order_support"
          : /bao hanh|hoan tien|chinh sach/.test(normalized)
            ? "policy_question"
            : /giao hang|van chuyen|ship/.test(normalized)
              ? "shipping_question"
              : /con hang|het hang|ton kho/.test(normalized)
                ? "stock_question"
                : /gia bao nhieu|bao nhieu tien|khuyen mai|discount|giam gia/.test(normalized)
                  ? "price_question"
                  : /mua|lay|chot|dat hang/.test(normalized)
                    ? "purchase_intent"
                    : /mac|dat qua|gia cao/.test(normalized)
                      ? "objection"
                      : /so sanh|khac nhau|nen chon/.test(normalized)
                        ? "product_comparison"
                        : /chi tiet|thanh phan|huong vi|loai do|loai nay/.test(
                              normalized,
                            )
                          ? "product_information"
                          : "recommendation";

  const missing = missingConsultationField(profile);
  const shouldHandoff = [
    "complaint",
    "human_support",
    "order_support",
  ].includes(salesIntent);
  const stage =
    salesIntent === "purchase_intent"
      ? "purchase"
      : salesIntent === "product_comparison"
        ? "compare"
        : salesIntent === "objection"
          ? "objection"
          : missing
            ? "discover"
            : "consider";

  return {
    salesIntent,
    stage,
    category: profile.category ?? null,
    budgetMin: profile.budgetMin ?? null,
    budgetMax: profile.budgetMax ?? null,
    useCase: profile.useCase ?? null,
    preference: profile.preference ?? null,
    recipient: profile.recipient ?? null,
    preferredFeatures: profile.preferredFeatures ?? [],
    unwantedFeatures: profile.unwantedFeatures ?? [],
    variantPreferences: profile.variantPreferences ?? [],
    requiredTime: profile.requiredTime ?? null,
    mentionedProducts: [],
    purchaseReadiness:
      salesIntent === "purchase_intent" ? "high" : missing ? "low" : "medium",
    missingInformation: missing ? [missing] : [],
    shouldHandoff,
    handoffReason: shouldHandoff
      ? "Yêu cầu cần nhân viên tiếp nhận trực tiếp."
      : null,
    isNewNeed:
      /nhu cau khac|san pham khac|tu van lai|bat dau lai|doi nhu cau/.test(
        normalized,
      ),
    retrievalQuery: [...recentUserTurns, request.message].join(" ").slice(-500),
    confidence: 0.55,
    intent: mapSalesIntent(salesIntent),
    profile,
  };
}

function mergeWithVerifiedProfile(
  parsed: z.infer<typeof analysisSchema>,
  request: ChatRequest,
): ConversationAnalysis {
  const guarded = enforceHighSignalIntent(parsed, request.message);
  const deterministic = buildConsultationProfile(request);
  const useModelSlots = guarded.confidence >= 0.65;
  const userBudgetEvidence = normalizeMessage(
    [
      ...request.history
        .filter((item) => item.role === "user")
        .map((item) => item.content),
      request.message,
    ].join(" "),
  );
  const hasExplicitBudgetMinimum =
    /(?:tu|tren|toi thieu|it nhat)\s*\d/.test(userBudgetEvidence);
  const profile: ConsultationProfile = {
    category:
      deterministic.category ??
      (useModelSlots ? (guarded.category ?? undefined) : undefined),
    budgetMin:
      deterministic.budgetMin ??
      (useModelSlots && hasExplicitBudgetMinimum
        ? (guarded.budgetMin ?? undefined)
        : undefined),
    budgetMax:
      deterministic.budgetMax ??
      (useModelSlots ? (guarded.budgetMax ?? undefined) : undefined),
    useCase:
      deterministic.useCase ??
      (useModelSlots ? (guarded.useCase ?? undefined) : undefined),
    preference:
      deterministic.preference ??
      (useModelSlots ? (guarded.preference ?? undefined) : undefined),
    recipient:
      deterministic.recipient ??
      (useModelSlots ? (guarded.recipient ?? undefined) : undefined),
    preferredFeatures:
      deterministic.preferredFeatures ??
      (useModelSlots && guarded.preferredFeatures.length
        ? guarded.preferredFeatures
        : undefined),
    unwantedFeatures:
      deterministic.unwantedFeatures ??
      (useModelSlots && guarded.unwantedFeatures.length
        ? guarded.unwantedFeatures
        : undefined),
    variantPreferences:
      deterministic.variantPreferences ??
      (useModelSlots && guarded.variantPreferences.length
        ? guarded.variantPreferences
        : undefined),
    requiredTime:
      deterministic.requiredTime ??
      (useModelSlots ? (guarded.requiredTime ?? undefined) : undefined),
  };

  return {
    ...guarded,
    intent: mapSalesIntent(guarded.salesIntent),
    profile,
  };
}

export async function analyzeConversation(
  request: ChatRequest,
): Promise<ConversationAnalysis> {
  const fallback = fallbackAnalysis(request);
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return fallback;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_CHAT_MODEL?.trim() || "gpt-4.1-mini",
        temperature: 0,
        messages: [
          { role: "system", content: ANALYZER_PROMPT },
          {
            role: "user",
            content: JSON.stringify({
              history: request.history.slice(-10).map((item) => ({
                role: item.role,
                content: item.content,
                consultationProfile: item.consultationProfile,
              })),
              currentMessage: request.message,
              deterministicSlots: fallback.profile,
            }),
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "sales_conversation_analysis",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                salesIntent: {
                  type: "string",
                  enum: salesIntentSchema.options,
                },
                stage: {
                  type: "string",
                  enum: purchaseStageSchema.options,
                },
                category: {
                  anyOf: [
                    {
                      type: "string",
                      enum: ["banh-keo", "ca-phe", "gia-vi", "do-uong"],
                    },
                    { type: "null" },
                  ],
                },
                budgetMin: {
                  anyOf: [{ type: "number" }, { type: "null" }],
                },
                budgetMax: {
                  anyOf: [{ type: "number" }, { type: "null" }],
                },
                useCase: {
                  anyOf: [{ type: "string" }, { type: "null" }],
                },
                preference: {
                  anyOf: [{ type: "string" }, { type: "null" }],
                },
                recipient: {
                  anyOf: [{ type: "string" }, { type: "null" }],
                },
                preferredFeatures: {
                  type: "array",
                  items: { type: "string" },
                  maxItems: 8,
                },
                unwantedFeatures: {
                  type: "array",
                  items: { type: "string" },
                  maxItems: 8,
                },
                variantPreferences: {
                  type: "array",
                  items: { type: "string" },
                  maxItems: 8,
                },
                requiredTime: {
                  anyOf: [{ type: "string" }, { type: "null" }],
                },
                mentionedProducts: {
                  type: "array",
                  items: { type: "string" },
                  maxItems: 5,
                },
                purchaseReadiness: {
                  type: "string",
                  enum: ["low", "medium", "high"],
                },
                missingInformation: {
                  type: "array",
                  items: { type: "string" },
                  maxItems: 8,
                },
                shouldHandoff: { type: "boolean" },
                handoffReason: {
                  anyOf: [{ type: "string" }, { type: "null" }],
                },
                isNewNeed: { type: "boolean" },
                retrievalQuery: { type: "string" },
                confidence: { type: "number", minimum: 0, maximum: 1 },
              },
              required: [
                "salesIntent",
                "stage",
                "category",
                "budgetMin",
                "budgetMax",
                "useCase",
                "preference",
                "recipient",
                "preferredFeatures",
                "unwantedFeatures",
                "variantPreferences",
                "requiredTime",
                "mentionedProducts",
                "purchaseReadiness",
                "missingInformation",
                "shouldHandoff",
                "handoffReason",
                "isNewNeed",
                "retrievalQuery",
                "confidence",
              ],
            },
          },
        },
      }),
      signal: AbortSignal.timeout(12_000),
    });

    if (!response.ok) return fallback;
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const parsed = analysisSchema.parse(
      JSON.parse(payload.choices?.[0]?.message?.content ?? "{}"),
    );
    return mergeWithVerifiedProfile(parsed, request);
  } catch (error) {
    console.warn(
      "Conversation analysis unavailable; using deterministic extraction.",
      error instanceof Error ? error.message : "Unknown error",
    );
    return fallback;
  }
}
