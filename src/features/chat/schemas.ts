import { z } from "zod";
import { productSearchResultSchema } from "@/features/catalog/schemas";

export const consultationProfileSchema = z.object({
  category: z
    .enum(["banh-keo", "ca-phe", "gia-vi", "do-uong"])
    .optional(),
  budgetMax: z.number().positive().optional(),
  budgetMin: z.number().nonnegative().optional(),
  useCase: z.string().optional(),
  preference: z.string().optional(),
  recipient: z.string().optional(),
  preferredFeatures: z.array(z.string()).max(8).optional(),
  unwantedFeatures: z.array(z.string()).max(8).optional(),
  variantPreferences: z.array(z.string()).max(8).optional(),
  requiredTime: z.string().optional(),
});

export const customerCaptureSchema = z.object({
  status: z
    .enum([
      "idle",
      "collecting",
      "ready",
      "saved",
      "save_failed",
      "cancelled",
    ])
    .default("idle"),
  name: z.string().trim().min(2).max(120).nullable().default(null),
  phone: z.string().trim().min(9).max(20).nullable().default(null),
  address: z.string().trim().min(5).max(300).nullable().default(null),
  addressSkipped: z.boolean().default(false),
  interestedProductIds: z
    .array(z.string().min(1).max(120))
    .max(3)
    .default([]),
  quantity: z.number().int().min(1).max(999).default(1),
  savedLeadId: z.string().nullable().default(null),
  error: z.string().max(240).nullable().default(null),
});

export const consultationSessionStateSchema = z.object({
  version: z.literal(1).default(1),
  profile: consultationProfileSchema.default({}),
  stage: z
    .enum([
      "DISCOVERING",
      "QUALIFIED",
      "RECOMMENDING",
      "COMPARING",
      "CLOSING",
    ])
    .default("DISCOVERING"),
  activeProductIds: z.array(z.string().min(1).max(120)).max(3).default([]),
  selectedProductId: z.string().min(1).max(120).nullable().default(null),
  lastIntent: z
    .enum(["discover", "recommend", "compare", "faq", "lead"])
    .nullable()
    .default(null),
  lastSalesIntent: z.string().max(80).nullable().default(null),
  customerCapture: customerCaptureSchema.default({
    status: "idle",
    name: null,
    phone: null,
    address: null,
    addressSkipped: false,
    interestedProductIds: [],
    quantity: 1,
    savedLeadId: null,
    error: null,
  }),
  updatedAt: z.string().datetime().default(() => new Date().toISOString()),
});

export const chatHistoryItemSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(4_000),
  productIds: z.array(z.string().min(1).max(120)).max(3).optional(),
  consultationProfile: consultationProfileSchema.optional(),
});

export const chatRequestSchema = z.object({
  message: z.string().trim().min(2).max(1_000),
  sessionId: z.string().uuid().optional(),
  history: z.array(chatHistoryItemSchema).max(12).default([]),
  sessionState: consultationSessionStateSchema.optional(),
});

export const comparisonSchema = z.object({
  title: z.string(),
  productIds: z.array(z.string()).min(2).max(3),
  rows: z.array(
    z.object({
      label: z.string(),
      values: z.array(z.string()).min(2).max(3),
    }),
  ),
  verdict: z.string(),
});

export const chatResponseSchema = z.object({
  sessionId: z.string().uuid(),
  text: z.string(),
  intent: z.enum(["discover", "recommend", "compare", "faq", "lead"]),
  products: z.array(productSearchResultSchema).max(3).default([]),
  comparison: comparisonSchema.nullable().default(null),
  shouldCollectLead: z.boolean().default(false),
  retrievalMode: z
    .enum(["context", "semantic", "database", "fallback", "none"])
    .default("none"),
  conversationState: z
    .enum([
      "DISCOVERING",
      "QUALIFIED",
      "RECOMMENDING",
      "COMPARING",
      "CLOSING",
    ])
    .optional(),
  consultationProfile: z
    .union([consultationProfileSchema, z.null()])
    .optional(),
  salesIntent: z
    .enum([
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
    ])
    .optional(),
  purchaseStage: z
    .enum([
      "discover",
      "consider",
      "compare",
      "objection",
      "purchase",
      "after_sales",
    ])
    .optional(),
  customerCapture: customerCaptureSchema.optional(),
  customerSaved: z.boolean().optional(),
  sessionState: consultationSessionStateSchema.optional(),
});

export const leadInputSchema = z.object({
  sessionId: z.string().uuid(),
  customerName: z.string().trim().min(2).max(120),
  customerPhone: z
    .string()
    .trim()
    .regex(/^(?:\+84|0)(?:\d[\s.-]?){8,10}$/, "Số điện thoại chưa hợp lệ."),
  customerNeed: z.string().trim().min(5).max(1_000),
  customerAddress: z.string().trim().min(5).max(300).optional(),
  interestedProductIds: z.array(z.string()).max(3).default([]),
  orderQuantity: z.number().int().min(1).max(999).default(1),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type ChatHistoryItem = z.infer<typeof chatHistoryItemSchema>;
export type ChatResponse = z.infer<typeof chatResponseSchema>;
export type ConsultationSessionState = z.infer<
  typeof consultationSessionStateSchema
>;
export type CustomerCapture = z.infer<typeof customerCaptureSchema>;
export type LeadInput = z.infer<typeof leadInputSchema>;
