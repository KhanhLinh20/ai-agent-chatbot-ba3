import type { ChatResponse } from "@/features/chat/schemas";
import {
  consultationSessionStateSchema,
  type ChatRequest,
  type ConsultationSessionState,
} from "@/features/chat/schemas";
export { consultationSessionStateSchema };
export type { ConsultationSessionState };

export type StatefulChatRequest = ChatRequest;

export function emptySessionState(): ConsultationSessionState {
  return consultationSessionStateSchema.parse({});
}

export function isExplicitNewNeed(message: string) {
  const normalized = message
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/đ/g, "d");

  return (
    /(?:bat dau|lam|tu van) lai/.test(normalized) ||
    /(?:doi|chuyen) (?:sang )?(?:nhu cau|san pham|mat hang|danh muc)/.test(
      normalized,
    ) ||
    /(?:nhu cau|san pham|mat hang|danh muc) khac/.test(normalized)
  );
}

export function mergeStateIntoRequest(
  request: ChatRequest,
  state: ConsultationSessionState,
): StatefulChatRequest {
  if (isExplicitNewNeed(request.message)) {
    return {
      ...request,
      sessionState: emptySessionState(),
    };
  }

  const history = [
    {
      role: "assistant" as const,
      content: "Ngữ cảnh tư vấn đã lưu của phiên hiện tại.",
      productIds: state.activeProductIds,
      consultationProfile: state.profile,
    },
    ...request.history,
  ];

  return { ...request, history, sessionState: state };
}

export function projectSessionState(
  previous: ConsultationSessionState,
  response: ChatResponse,
): ConsultationSessionState {
  const responseIds = response.products.map((product) => product.id);
  const preserveActiveProducts =
    responseIds.length === 0 &&
    response.intent !== "discover" &&
    response.retrievalMode === "none";
  const activeProductIds = responseIds.length
    ? responseIds
    : preserveActiveProducts
      ? previous.activeProductIds
      : response.intent === "faq"
        ? previous.activeProductIds
        : [];
  const selectedProductId =
    response.shouldCollectLead && responseIds.length === 1
      ? responseIds[0]
      : activeProductIds.includes(previous.selectedProductId ?? "")
        ? previous.selectedProductId
        : null;

  return consultationSessionStateSchema.parse({
    version: 1,
    profile: response.consultationProfile ?? previous.profile,
    stage: response.conversationState ?? previous.stage,
    activeProductIds,
    selectedProductId,
    lastIntent: response.intent,
    lastSalesIntent: response.salesIntent ?? null,
    customerCapture:
      response.customerCapture ?? previous.customerCapture,
    updatedAt: new Date().toISOString(),
  });
}
