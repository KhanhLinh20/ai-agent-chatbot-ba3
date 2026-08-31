import { createChatProvider } from "@/lib/ai/chat-provider";
import {
  retrieveProductsByIds,
  searchProducts,
} from "@/features/catalog/repository";
import type { ProductSearchResult } from "@/features/catalog/schemas";
import type {
  ChatResponse,
  CustomerCapture,
} from "@/features/chat/schemas";
import type { StatefulChatRequest } from "@/features/chat/session-state";
import { isExplicitNewNeed } from "@/features/chat/session-state";
import {
  buildContextualQuery,
  contextualProductAnswer,
  isAffirmativeConfirmation,
  isContextualFollowUp,
  isPurchaseCommitment,
  latestContextProductIds,
  selectReferencedProducts,
} from "@/features/chat/conversation-context";
import {
  clarificationFor,
  inferConsultationBudget as inferBudget,
  inferConsultationCategory as inferCategory,
  isExactProductLookup,
  missingConsultationField,
} from "@/features/chat/consultation-profile";
import {
  analyzeConversation,
  type ConversationAnalysis,
} from "@/features/chat/conversation-analyzer";
import { resolveConversationState } from "@/features/chat/conversation-state";
import {
  advanceCustomerCapture,
  checkoutQuantity,
  customerCaptureQuestion,
  startCustomerCapture,
} from "@/features/chat/customer-capture";

const FAQ = [
  {
    pattern: /giao|ship|2h|vận chuyển/i,
    answer:
      "SmartMart hỗ trợ giao nhanh 2 giờ trong khu vực phục vụ. Phí giao hàng được hiển thị trước khi xác nhận; đơn từ 300.000đ được miễn phí giao 2H trong bản demo.",
  },
  {
    pattern: /đổi|trả|hoàn/i,
    answer:
      "Bạn có thể yêu cầu đổi trả khi sản phẩm lỗi, hư hỏng hoặc giao sai. Hãy giữ hóa đơn và hình ảnh sản phẩm để SmartMart kiểm tra nhanh.",
  },
  {
    pattern: /thanh toán|chuyển khoản|cod/i,
    answer:
      "SmartMart hỗ trợ thanh toán khi nhận hàng và các phương thức điện tử được hiển thị tại bước xác nhận đơn.",
  },
];

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/đ/g, "d");
}

function formatPrice(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
}

function latestAssistantText(request: StatefulChatRequest) {
  for (let index = request.history.length - 1; index >= 0; index -= 1) {
    const item = request.history[index];
    if (item.role === "assistant") return item.content;
  }
  return "";
}

function asksToConfirmPurchase(message: string) {
  const value = normalize(message);
  return (
    /\b(?:mua|chon|lay|chot|xac nhan)\b/.test(value) &&
    /\b(?:dung khong|phai khong)\b/.test(value)
  );
}

function beginCheckout(
  sessionId: string,
  request: StatefulChatRequest,
  product: ProductSearchResult,
): ChatResponse {
  const customerCapture = startCustomerCapture(
    request.sessionState?.customerCapture,
    [product.id],
    checkoutQuantity(request.message) ?? 1,
  );
  return {
    sessionId,
    text: `Marty đã ghi nhận bạn chốt “${product.name}”. ${customerCaptureQuestion(customerCapture)}`,
    intent: "lead",
    products: [product],
    comparison: null,
    shouldCollectLead: true,
    retrievalMode: "context",
    conversationState: "CLOSING",
    consultationProfile: request.sessionState?.profile,
    salesIntent: "purchase_intent",
    purchaseStage: "purchase",
    customerCapture,
    customerSaved: false,
  };
}

function orderSummary(
  capture: CustomerCapture,
  products: ProductSearchResult[],
) {
  const productLines = products.length
    ? products.map(
        (product) =>
          `- ${product.name} × ${capture.quantity} — ${formatPrice(product.price * capture.quantity)}`,
      )
    : ["- Sản phẩm khách vừa xác nhận trong cuộc trò chuyện"];
  const subtotal = products.reduce(
    (sum, product) => sum + product.price * capture.quantity,
    0,
  );

  return [
    "Marty đã nhận đủ thông tin. Đây là tóm tắt đơn hàng của bạn:",
    "",
    ...productLines,
    ...(subtotal > 0 ? [`- Tạm tính: ${formatPrice(subtotal)}`] : []),
    `- Người nhận: ${capture.name}`,
    `- Số điện thoại: ${capture.phone}`,
    `- Địa chỉ giao hàng: ${capture.address}`,
    "",
    "Thông tin đã được chuyển vào hệ thống người bán để xác nhận đơn và phí giao hàng.",
  ].join("\n");
}

function compare(products: ProductSearchResult[]) {
  const selected = products.slice(0, 3);
  if (selected.length < 2) return null;
  const bestValue = [...selected].sort((a, b) => a.price - b.price)[0];
  return {
    title: `So sánh ${selected.map((product) => product.name).join(" và ")}`,
    productIds: selected.map((product) => product.id),
    rows: [
      {
        label: "Giá bán",
        values: selected.map((product) => formatPrice(product.price)),
      },
      {
        label: "Tình trạng",
        values: selected.map((product) =>
          product.inStock ? "Còn hàng" : "Hết hàng",
        ),
      },
      {
        label: "Phù hợp",
        values: selected.map(
          (product) => product.useCases[0] || product.reason,
        ),
      },
    ],
    verdict: `${bestValue.name} có mức giá dễ tiếp cận nhất; bạn nên ưu tiên công dụng và khẩu vị phù hợp với gia đình.`,
  };
}

async function rewriteReply(
  request: StatefulChatRequest,
  draft: string,
  products: ProductSearchResult[],
  analysis?: ConversationAnalysis,
) {
  const provider = createChatProvider();
  if (!provider) return draft;
  try {
    return await provider.rewrite({
      userMessage: request.message,
      draft,
      products,
      history: request.history,
      salesContext: analysis
        ? {
            intent: analysis.salesIntent,
            stage: analysis.stage,
            customerProfile: analysis.profile,
            shouldHandoff: analysis.shouldHandoff,
            handoffReason: analysis.handoffReason,
          }
        : undefined,
    });
  } catch (error) {
    console.warn(
      "AI rewrite unavailable; using verified deterministic reply.",
      error instanceof Error ? error.message : "Unknown error",
    );
    return draft;
  }
}

function needsClarification(message: string) {
  const value = normalize(message)
    .replace(/[.!?,;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (
    /^(hello|hi|xin chao|tu van|goi y|mua gi|san pham nao)$/.test(value) ||
    (!inferCategory(message) &&
      /(san pham|mat hang)/.test(value) &&
      /(mua|tim|tu van|goi y|ban|co)/.test(value)) ||
    /^(toi|minh|em|anh|chi)? ?(dang |muon |can )?(duoc )?(tu van|goi y|tim|mua|tim mua)? ?(mot |cac )?(san pham|mat hang|do)( phu hop| nao| gi)?( cho toi| cho minh)?$/.test(
      value,
    ) ||
    /hoi them (ve )?nhu cau/.test(value)
  );
}

function isCatalogQuestion(message: string) {
  const value = normalize(message).trim();
  return (
    /^(ban|shop|cua hang|smartmart|marty).*(ban|co).*(gi|san pham nao|mat hang nao)/.test(
      value,
    ) ||
    /^(ban co gi|ban gi|co san pham gi|co mat hang gi)[.!? ]*$/.test(value)
  );
}

export async function runChatCore(
  request: StatefulChatRequest,
): Promise<ChatResponse> {
  const sessionId = request.sessionId ?? crypto.randomUUID();
  const message = request.message;
  const currentCapture = request.sessionState?.customerCapture;
  if (currentCapture?.status === "collecting") {
    const captured = advanceCustomerCapture(message, currentCapture);
    const orderedProducts =
      captured.capture.status === "ready"
        ? await retrieveProductsByIds(
            captured.capture.interestedProductIds,
            "sản phẩm khách vừa chốt đơn",
          )
        : [];
    return {
      sessionId,
      text:
        captured.capture.status === "ready"
          ? orderSummary(captured.capture, orderedProducts)
          : captured.text,
      intent: "lead",
      products: [],
      comparison: null,
      shouldCollectLead: captured.shouldCollectLead,
      retrievalMode: "none",
      conversationState: "CLOSING",
      consultationProfile: request.sessionState?.profile,
      salesIntent: "purchase_intent",
      purchaseStage: "purchase",
      customerCapture: captured.capture,
      customerSaved: false,
    };
  }
  const faq = FAQ.find((item) => item.pattern.test(message));
  const earlyContextProductIds = latestContextProductIds(request);
  const hasContextualFollowUp =
    earlyContextProductIds.length > 0 && isContextualFollowUp(message);

  if (faq) {
    return {
      sessionId,
      text: faq.answer,
      intent: "faq",
      products: [],
      comparison: null,
      shouldCollectLead: false,
      retrievalMode: "none",
      conversationState: "DISCOVERING",
    };
  }

  if (
    earlyContextProductIds.length &&
    !isExplicitNewNeed(message) &&
    (isPurchaseCommitment(message) || isAffirmativeConfirmation(message))
  ) {
    const contextProducts = await retrieveProductsByIds(
      earlyContextProductIds,
      buildContextualQuery(request),
    );
    const previousAssistantText = latestAssistantText(request);
    const confirmsPreviousChoice =
      isAffirmativeConfirmation(message) &&
      asksToConfirmPurchase(previousAssistantText);
    const referenced = selectReferencedProducts(
      confirmsPreviousChoice ? previousAssistantText : message,
      contextProducts,
    );
    if (referenced.length === 1) {
      return beginCheckout(sessionId, request, referenced[0]);
    }
  }

  if (isCatalogQuestion(message) && !hasContextualFollowUp) {
    return {
      sessionId,
      text: "SmartMart hiện có 4 nhóm chính từ catalog thực tế: đồ uống và sữa (MILO, NESTEA), cà phê (NESCAFÉ), gia vị (MAGGI), bánh kẹo (Kinh Đô, Mars, Richy, Bibica, Orion, Perfetti và Hải Hà). Bạn muốn tìm nhóm nào, dùng cho ai và ngân sách khoảng bao nhiêu để Marty tư vấn đúng hơn?",
      intent: "discover",
      products: [],
      comparison: null,
      shouldCollectLead: false,
      retrievalMode: "none",
      conversationState: "DISCOVERING",
    };
  }

  if (needsClarification(message) && !hasContextualFollowUp) {
    return {
      sessionId,
      text: "Bạn đang tìm nhóm nào: đồ uống, cà phê, gia vị hay bánh kẹo? Nếu có ngân sách dự kiến, bạn cho Marty biết thêm nhé.",
      intent: "discover",
      products: [],
      comparison: null,
      shouldCollectLead: false,
      retrievalMode: "none",
      conversationState: "DISCOVERING",
    };
  }

  const leadIntent =
    /gọi lại|liên hệ|báo giá|số lượng lớn|tư vấn viên/i.test(message);
  if (leadIntent) {
    const customerCapture = startCustomerCapture(
      currentCapture,
      earlyContextProductIds,
    );
    return {
      sessionId,
      text: customerCaptureQuestion(customerCapture),
      intent: "lead",
      products: [],
      comparison: null,
      shouldCollectLead: true,
      retrievalMode: "none",
      conversationState: "CLOSING",
      consultationProfile: request.sessionState?.profile,
      customerCapture,
      customerSaved: false,
    };
  }

  const analysis = await analyzeConversation(request);
  const consultationProfile = analysis.profile;
  if (
    analysis.shouldHandoff ||
    ["human_support", "complaint", "order_support"].includes(
      analysis.salesIntent,
    )
  ) {
    const customerCapture = startCustomerCapture(
      currentCapture,
      earlyContextProductIds,
    );
    const handoffText = `${
      analysis.salesIntent === "complaint"
        ? "Marty đã ghi nhận vấn đề và sẽ chuyển toàn bộ nội dung cho nhân viên xử lý."
        : analysis.salesIntent === "order_support"
          ? "Marty sẽ chuyển yêu cầu kiểm tra đơn hàng cho nhân viên phụ trách."
          : "Marty sẽ chuyển nhu cầu của bạn cho nhân viên tư vấn."
    } ${customerCaptureQuestion(customerCapture)}`;
    return {
      sessionId,
      text: handoffText,
      intent: "lead",
      products: [],
      comparison: null,
      shouldCollectLead: true,
      retrievalMode: "none",
      conversationState: "CLOSING",
      consultationProfile,
      salesIntent: analysis.salesIntent,
      purchaseStage: analysis.stage,
      customerCapture,
      customerSaved: false,
    };
  }

  if (
    analysis.intent === "faq" &&
    ["shipping_question", "policy_question"].includes(analysis.salesIntent)
  ) {
    const customerCapture = startCustomerCapture(
      currentCapture,
      earlyContextProductIds,
    );
    return {
      sessionId,
      text: `Thông tin này hiện Marty chưa thấy trong chính sách đã xác minh nên sẽ chuyển cho nhân viên phụ trách kiểm tra. ${customerCaptureQuestion(customerCapture)}`,
      intent: "lead",
      products: [],
      comparison: null,
      shouldCollectLead: true,
      retrievalMode: "none",
      conversationState: "CLOSING",
      consultationProfile,
      salesIntent: analysis.salesIntent,
      purchaseStage: analysis.stage,
      customerCapture,
      customerSaved: false,
    };
  }

  const isCompare =
    analysis.intent === "compare" ||
    /so sánh|khác nhau|nên chọn|hay hơn/i.test(message);
  const contextProductIds = earlyContextProductIds;
  const startsNewNeed = isExplicitNewNeed(message);
  if (
    contextProductIds.length &&
    !startsNewNeed &&
    (isContextualFollowUp(message) ||
      ["objection", "purchase"].includes(analysis.stage) ||
      ["price_question", "stock_question"].includes(analysis.salesIntent))
  ) {
    const contextualQuery = buildContextualQuery(request);
    const contextProducts = await retrieveProductsByIds(
      contextProductIds,
      contextualQuery,
    );
    const explicitCategory = inferCategory(message);
    const keepsPreviousCategory =
      !explicitCategory ||
      contextProducts.some((product) => product.category === explicitCategory);

    if (contextProducts.length && keepsPreviousCategory) {
      const referenced = selectReferencedProducts(message, contextProducts);
      const selected =
        analysis.salesIntent === "objection" && referenced.length === 1
          ? [
              referenced[0],
              ...contextProducts.filter(
                (product) => product.id !== referenced[0].id,
              ),
            ].slice(0, 3)
          : referenced;
      const primaryProduct = referenced[0];
      const cheaperAlternative = primaryProduct
        ? contextProducts
            .filter((product) => product.price < primaryProduct.price)
            .sort((left, right) => left.price - right.price)[0]
        : undefined;
      const contextDraft =
        analysis.salesIntent === "purchase_intent"
          ? selected.length === 1
            ? `Marty xác nhận bạn đang chọn “${selected[0].name}”. Marty sẽ hỏi thông tin nhận hàng trực tiếp trong cuộc trò chuyện trước khi tóm tắt đơn.`
            : "Marty đã ghi nhận ý định mua. Bạn chọn rõ một trong các sản phẩm vừa trao đổi để Marty xác nhận đúng sản phẩm và quy cách trước khi tiếp tục."
          : analysis.salesIntent === "objection"
            ? `Marty hiểu mức giá của “${primaryProduct?.name ?? "sản phẩm này"}” đang khiến bạn cân nhắc. Giá hiện tại là ${primaryProduct ? formatPrice(primaryProduct.price) : "chưa xác định"}.${cheaperAlternative ? ` Nếu ưu tiên tiết kiệm hơn, “${cheaperAlternative.name}” có giá ${formatPrice(cheaperAlternative.price)} và cũng nằm trong các lựa chọn phù hợp vừa trao đổi.` : " Trong các lựa chọn vừa trao đổi chưa có sản phẩm nào rẻ hơn đã được xác minh."} Không phủ nhận băn khoăn của khách, không gây áp lực và chỉ giải thích lợi ích có trong dữ liệu.`
            : isCompare
              ? `Marty đang so sánh đúng các sản phẩm vừa trao đổi. ${compare(selected)?.verdict ?? contextualProductAnswer(message, selected)}`
              : contextualProductAnswer(message, selected);
      const wantsPurchase = analysis.salesIntent === "purchase_intent";
      const isPurchase = wantsPurchase && selected.length === 1;
      const customerCapture = isPurchase
        ? startCustomerCapture(
            currentCapture,
            selected.map((product) => product.id),
          )
        : undefined;
      const finalContextDraft = isPurchase
        ? `Marty đã ghi nhận bạn chọn “${selected[0]?.name ?? "sản phẩm vừa trao đổi"}”. ${customerCaptureQuestion(customerCapture!)}`
        : contextDraft;
      return {
        sessionId,
        text: isPurchase
          ? finalContextDraft
          : await rewriteReply(request, contextDraft, selected, analysis),
        intent: isPurchase ? "lead" : isCompare ? "compare" : "recommend",
        products: selected,
        comparison: isCompare ? compare(selected) : null,
        shouldCollectLead: isPurchase,
        retrievalMode: "context",
        conversationState: isPurchase
          ? "CLOSING"
          : resolveConversationState({
              profile: consultationProfile,
              intent: analysis.intent,
              hasProductContext: true,
            }),
        consultationProfile,
        salesIntent: analysis.salesIntent,
        purchaseStage: analysis.stage,
        customerCapture,
        customerSaved: false,
      };
    }
  }

  if (!isExactProductLookup(message) && !contextProductIds.length) {
    const missingField = missingConsultationField(consultationProfile);
    if (missingField) {
      return {
        sessionId,
        text: clarificationFor(
          missingField,
          consultationProfile,
        ),
        intent: "discover",
        products: [],
        comparison: null,
        shouldCollectLead: false,
        retrievalMode: "none",
        conversationState: "DISCOVERING",
        consultationProfile,
        salesIntent: analysis.salesIntent,
        purchaseStage: analysis.stage,
      };
    }
  }

  const retrievalQuery =
    analysis.retrievalQuery ||
    (request.history.some((item) => item.role === "user")
      ? buildContextualQuery(request)
      : message);
  const result = await searchProducts({
    query: retrievalQuery,
    category: consultationProfile.category ?? inferCategory(message),
    budgetMin: consultationProfile.budgetMin,
    budgetMax: consultationProfile.budgetMax ?? inferBudget(message),
    inStockOnly: true,
    limit: 3,
  });

  if (!result.products.length) {
    return {
      sessionId,
      text: "Marty chưa tìm thấy sản phẩm còn hàng phù hợp với điều kiện này. Bạn có thể nới ngân sách hoặc chọn nhóm sản phẩm khác nhé.",
      intent: "recommend",
      products: [],
      comparison: null,
      shouldCollectLead: false,
      retrievalMode: result.retrievalMode,
      conversationState: "QUALIFIED",
      consultationProfile,
      salesIntent: analysis.salesIntent,
      purchaseStage: analysis.stage,
    };
  }

  const intro = isCompare
    ? `Marty tìm thấy ${result.products.length} lựa chọn gần nhu cầu để bạn so sánh.`
    : `Marty chọn ${result.products.length} sản phẩm phù hợp nhất dựa trên nhu cầu, giá và tình trạng hàng.`;
  const popularProduct = [...result.products]
    .filter((product) => Number(product.monthlySold ?? 0) >= 1_000)
    .sort((left, right) => Number(right.monthlySold) - Number(left.monthlySold))[0];
  const popularityNote = popularProduct
    ? ` Trong các lựa chọn này, “${popularProduct.name}” đang được khách hàng mua nhiều (khoảng ${new Intl.NumberFormat("vi-VN").format(Number(popularProduct.monthlySold))} lượt/tháng).`
    : "";
  const safety =
    /bé|trẻ|dị ứng|ăn kiêng/i.test(message)
      ? " Nếu dùng cho trẻ nhỏ hoặc có dị ứng, bạn nhớ kiểm tra kỹ thành phần trên bao bì."
      : "";
  const nextStep = isCompare
    ? " Bạn nghiêng về lựa chọn nào để Marty giúp chốt sản phẩm?"
    : " Bạn muốn chọn sản phẩm nào, hay cần Marty làm rõ thêm điểm khác biệt?";
  const rewrittenText = await rewriteReply(
    request,
    `${intro}${popularityNote}${safety}${nextStep}`,
    result.products,
    analysis,
  );
  const text = `${rewrittenText}${popularityNote}`;

  return {
    sessionId,
    text,
    intent: isCompare ? "compare" : "recommend",
    products: result.products,
    comparison: isCompare ? compare(result.products) : null,
    shouldCollectLead: false,
    retrievalMode: result.retrievalMode,
    conversationState: resolveConversationState({
      profile: consultationProfile,
      intent: isCompare ? "compare" : analysis.intent,
      hasProductContext: true,
    }),
    consultationProfile,
    salesIntent: analysis.salesIntent,
    purchaseStage: analysis.stage,
  };
}

// Kept for unit-level orchestration tests and non-persistent callers.
export const runChat = runChatCore;
