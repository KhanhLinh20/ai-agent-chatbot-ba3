export const journeyEventTypes = [
  "search",
  "product_impression",
  "product_click",
  "compare",
  "add_to_cart",
  "lead_submit",
  "order_complete",
  "livestream_interaction",
] as const;

export type JourneyEventType = (typeof journeyEventTypes)[number];

export type JourneyEvent = {
  type: JourneyEventType;
  occurredAt: string;
  productId?: string;
  productName?: string;
  category?: string;
  query?: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export type JourneyInsight = {
  score: number;
  stage: "Khám phá" | "Đang cân nhắc" | "Sẵn sàng mua" | "Đã mua";
  purchaseLikelihood: "Thấp" | "Trung bình" | "Cao" | "Đã chuyển đổi";
  interestedCategory: string | null;
  nextBestAction: string;
  evidence: string[];
};

const weights: Record<JourneyEventType, number> = {
  search: 8,
  product_impression: 4,
  product_click: 13,
  compare: 15,
  add_to_cart: 28,
  lead_submit: 20,
  order_complete: 100,
  livestream_interaction: 12,
};

const categoryLabels: Record<string, string> = {
  "banh-keo": "Bánh kẹo",
  "ca-phe": "Cà phê",
  "gia-vi": "Gia vị",
  "do-uong": "Đồ uống",
};

export function analyzeJourney(events: JourneyEvent[]): JourneyInsight {
  const recent = events.slice(-30);
  const hasOrder = recent.some((event) => event.type === "order_complete");
  const hasLead = recent.some((event) => event.type === "lead_submit");
  const cartAdds = recent.filter((event) => event.type === "add_to_cart");
  const clicks = recent.filter((event) => event.type === "product_click");
  const comparisons = recent.filter((event) => event.type === "compare");

  const rawScore = hasOrder
    ? 100
    : recent.reduce((sum, event) => sum + weights[event.type], 0);
  const score = hasOrder ? 100 : Math.min(96, rawScore);

  const categoryScores = new Map<string, number>();
  for (const event of recent) {
    if (!event.category) continue;
    categoryScores.set(
      event.category,
      (categoryScores.get(event.category) ?? 0) + weights[event.type],
    );
  }
  const category = [...categoryScores.entries()].sort(
    (left, right) => right[1] - left[1],
  )[0]?.[0];

  const stage: JourneyInsight["stage"] = hasOrder
    ? "Đã mua"
    : cartAdds.length > 0 || hasLead
      ? "Sẵn sàng mua"
      : clicks.length > 0 || comparisons.length > 0
        ? "Đang cân nhắc"
        : "Khám phá";

  const purchaseLikelihood: JourneyInsight["purchaseLikelihood"] = hasOrder
    ? "Đã chuyển đổi"
    : score >= 65
      ? "Cao"
      : score >= 30
        ? "Trung bình"
        : "Thấp";

  let nextBestAction =
    "Hỏi thêm mục đích sử dụng và ngân sách trước khi đề xuất.";
  if (clicks.length >= 2 && comparisons.length === 0)
    nextBestAction = "So sánh các sản phẩm khách vừa quan tâm.";
  if (comparisons.length > 0)
    nextBestAction = "Làm rõ điểm khác biệt và hỏi khách nghiêng về lựa chọn nào.";
  if (cartAdds.length > 0 && !hasLead)
    nextBestAction = "Thu số điện thoại và địa chỉ để xác nhận đơn.";
  if (cartAdds.length > 0 && hasLead)
    nextBestAction = "Xác nhận lại sản phẩm, tổng tiền và chốt đơn ngay.";
  if (hasOrder)
    nextBestAction = "Theo dõi giao hàng và chuẩn bị kịch bản chăm sóc sau mua.";

  const evidence: string[] = [];
  if (clicks.length)
    evidence.push(`Đã xem chi tiết ${clicks.length} sản phẩm`);
  if (comparisons.length) evidence.push("Đã yêu cầu so sánh");
  if (cartAdds.length)
    evidence.push(`Đã thêm giỏ ${cartAdds.length} lượt`);
  if (hasLead) evidence.push("Đã để lại thông tin");
  if (hasOrder) evidence.push("Đã hoàn tất đơn hàng");

  return {
    score,
    stage,
    purchaseLikelihood,
    interestedCategory: category
      ? (categoryLabels[category] ?? category)
      : null,
    nextBestAction,
    evidence,
  };
}
