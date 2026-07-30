import type {
  ChatResponse,
  CustomerCapture,
} from "@/features/chat/schemas";
import type { ConsultationProfile } from "@/features/chat/consultation-profile";

const PHONE_PATTERN = /(?:\+84|0)(?:\d[\s.-]?){8,10}/;

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ")
    .trim();
}

export function checkoutQuantity(message: string) {
  const match = normalize(message).match(
    /\b(?:mua|lay|chot|dat|cho (?:toi|minh))\s+(?:so luong\s+)?(\d{1,3})(?:\s+(?:san pham|hop|tui|thung|chai|goi|cai|bo))?\b/,
  );
  if (!match) return null;
  const quantity = Number(match[1]);
  return Number.isSafeInteger(quantity) && quantity > 0 ? quantity : null;
}

function cleanName(value: string) {
  return value
    .replace(
      /^(?:tôi|mình|em|anh|chị)?\s*(?:tên(?:\s+tôi|\s+mình)?\s+là|là)\s+/i,
      "",
    )
    .replace(/\s*(?:,|;).*/g, "")
    .trim();
}

function explicitName(message: string) {
  const match = message.match(
    /(?:họ\s*(?:và\s*)?tên|tôi|mình|em|anh|chị)?\s*(?:tên(?:\s+tôi|\s+mình)?\s+là|tên\s*:|là)\s+([^,;\n0-9]{2,120})/i,
  );
  return match ? cleanName(match[1]) : null;
}

function explicitAddress(message: string) {
  const match = message.match(
    /(?:địa chỉ|giao (?:đến|tới|tại))\s*(?:là|:)?\s*(.{5,300})/i,
  );
  return match?.[1]?.trim() ?? null;
}

function validName(value: string) {
  return (
    value.length >= 2 &&
    value.length <= 120 &&
    /^[\p{Letter}][\p{Letter}\s.'-]+$/u.test(value)
  );
}

function inferredName(message: string, phone: string | null) {
  const beforePhone = phone
    ? message.slice(0, message.indexOf(phone))
    : message;
  const candidates = beforePhone
    .split(/[\n;|]+/)
    .map(cleanName)
    .map((value) =>
      value
        .replace(/^(?:họ\s*(?:và\s*)?tên|tên)\s*:?\s*/i, "")
        .replace(/[\s,.-]+$/g, "")
        .trim(),
    );
  return candidates.find(validName) ?? null;
}

function inferredAddress(message: string, phone: string | null) {
  if (!phone) return null;
  const phoneIndex = message.indexOf(phone);
  if (phoneIndex < 0) return null;
  const candidate = message
    .slice(phoneIndex + phone.length)
    .replace(/^[\s,;|.-]+/, "")
    .replace(/^(?:địa\s*chỉ|giao\s*(?:đến|tới|tại))\s*(?:là|:)?\s*/i, "")
    .trim();
  return candidate.length >= 5 ? candidate : null;
}

function missingInformation(capture: CustomerCapture) {
  return [
    !capture.name ? "họ và tên" : "",
    !capture.phone ? "số điện thoại" : "",
    !capture.address ? "địa chỉ giao hàng" : "",
  ].filter(Boolean);
}

function formatVietnameseList(values: string[]) {
  if (values.length <= 1) return values[0] ?? "";
  return `${values.slice(0, -1).join(", ")} và ${values.at(-1)}`;
}

function nextQuestion(capture: CustomerCapture) {
  const missing = missingInformation(capture);
  if (missing.length === 3) {
    return [
      "Để chốt đơn, bạn vui lòng gửi đầy đủ 3 thông tin trong một tin nhắn:",
      "- Họ và tên",
      "- Số điện thoại",
      "- Địa chỉ giao hàng",
      "Ví dụ: Nguyễn Minh Anh; 0901234567; 12 Nguyễn Huệ, Quận 1, TP.HCM.",
    ].join("\n");
  }
  return `Marty còn thiếu ${formatVietnameseList(missing)} để chốt đơn. Bạn vui lòng gửi bổ sung ${
    missing.length > 1 ? "các thông tin này" : "thông tin này"
  } trong một tin nhắn nhé.`;
}

export function startCustomerCapture(
  previous: CustomerCapture | undefined,
  interestedProductIds: string[],
  quantity = previous?.quantity ?? 1,
): CustomerCapture {
  if (
    previous?.status === "save_failed" &&
    previous.name &&
    previous.phone &&
    previous.address
  ) {
    return {
      ...previous,
      status: "ready",
      interestedProductIds: interestedProductIds.length
        ? interestedProductIds.slice(0, 3)
        : previous.interestedProductIds,
      quantity,
      error: null,
    };
  }
  if (previous?.status === "saved" && !previous.address) {
    return {
      ...previous,
      status: "collecting",
      addressSkipped: false,
      interestedProductIds: interestedProductIds.length
        ? interestedProductIds.slice(0, 3)
        : previous.interestedProductIds,
      quantity,
      error: null,
    };
  }
  if (
    previous &&
    ["collecting", "ready", "saved"].includes(previous.status)
  ) {
    return {
      ...previous,
      interestedProductIds: interestedProductIds.length
        ? interestedProductIds.slice(0, 3)
        : previous.interestedProductIds,
      quantity,
    };
  }
  return {
    status: "collecting",
    name: null,
    phone: null,
    address: null,
    addressSkipped: false,
    interestedProductIds: interestedProductIds.slice(0, 3),
    quantity,
    savedLeadId: null,
    error: null,
  };
}

export function customerCaptureQuestion(capture: CustomerCapture) {
  if (capture.status === "ready") {
    return "Marty đã giữ đủ thông tin và đang thử đồng bộ lại với hệ thống người bán.";
  }
  return nextQuestion(capture);
}

export function advanceCustomerCapture(
  message: string,
  previous: CustomerCapture,
): {
  capture: CustomerCapture;
  text: string;
  shouldCollectLead: boolean;
} {
  const normalized = normalize(message);
  if (
    /khong muon cung cap|khong cung cap|huy|dung thu thap|thoi khong can/.test(
      normalized,
    )
  ) {
    return {
      capture: { ...previous, status: "cancelled", error: null },
      text: "Được rồi, Marty sẽ không tiếp tục thu thập thông tin. Bạn vẫn có thể tiếp tục xem và hỏi về sản phẩm.",
      shouldCollectLead: false,
    };
  }

  const capture: CustomerCapture = { ...previous, error: null };
  const foundQuantity = checkoutQuantity(message);
  const foundPhone = message.match(PHONE_PATTERN)?.[0];
  const foundName =
    explicitName(message) ?? inferredName(message, foundPhone ?? null);
  const foundAddress =
    explicitAddress(message) ?? inferredAddress(message, foundPhone ?? null);

  if (!capture.name) {
    const candidate =
      foundName ??
      (!foundPhone && !capture.phone && !capture.address
        ? cleanName(message)
        : null);
    if (candidate && validName(candidate)) {
      capture.name = candidate;
    }
  }

  if (!capture.phone && foundPhone) {
    capture.phone = foundPhone.replace(/[\s.-]/g, "");
  }

  if (!capture.address) {
    if (foundAddress) {
      capture.address = foundAddress;
    } else if (
      previous.phone &&
      message.trim().length >= 5 &&
      !foundPhone &&
      !validName(cleanName(message))
    ) {
      capture.address = message.trim();
    }
  }

  capture.addressSkipped = false;
  if (foundQuantity) capture.quantity = foundQuantity;

  if (capture.name && capture.phone && capture.address) {
    capture.status = "ready";
    return {
      capture,
      text: `Cảm ơn ${capture.name}. Marty đã nhận đủ họ tên, số điện thoại và địa chỉ giao hàng.`,
      shouldCollectLead: false,
    };
  }

  return {
    capture,
    text: nextQuestion(capture),
    shouldCollectLead: true,
  };
}

export function customerNeedSummary(
  profile: ConsultationProfile,
  response: ChatResponse,
  capture: CustomerCapture,
) {
  const parts = [
    profile.category ? `Danh mục: ${profile.category}` : "",
    profile.useCase ? `Mục đích: ${profile.useCase}` : "",
    profile.budgetMax
      ? `Ngân sách tối đa: ${new Intl.NumberFormat("vi-VN").format(profile.budgetMax)}đ`
      : "",
    profile.preference && profile.preference !== "khong uu tien"
      ? `Ưu tiên: ${profile.preference}`
      : "",
    capture.address ? `Địa chỉ: ${capture.address}` : "",
    capture.interestedProductIds.length
      ? `Sản phẩm quan tâm: ${capture.interestedProductIds.join(", ")}`
      : "",
    response.text ? `Ngữ cảnh: ${response.text.slice(0, 300)}` : "",
  ].filter(Boolean);

  return parts.join(". ").slice(0, 1_000) ||
    "Khách hàng cần người bán liên hệ tư vấn thêm.";
}
