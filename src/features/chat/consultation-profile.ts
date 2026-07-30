import type { ChatRequest } from "@/features/chat/schemas";

export type ConsultationProfile = {
  category?: "banh-keo" | "ca-phe" | "gia-vi" | "do-uong";
  budgetMin?: number;
  budgetMax?: number;
  useCase?: string;
  preference?: string;
  recipient?: string;
  preferredFeatures?: string[];
  unwantedFeatures?: string[];
  variantPreferences?: string[];
  requiredTime?: string;
};

export const NO_PREFERENCE = "khong uu tien";

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/[^\p{Letter}\p{Number}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function inferConsultationCategory(message: string) {
  const value = normalize(message);
  if (/banh|keo|socola|snack|bibica|orion|richy/.test(value))
    return "banh-keo" as const;
  if (/ca phe|nescafe|coffee/.test(value)) return "ca-phe" as const;
  if (/gia vi|maggi|nuoc mam|dau hao|hat nem/.test(value))
    return "gia-vi" as const;
  if (/milo|nestea|\btra\b|\bsua\b|do uong|\bnuoc\b/.test(value))
    return "do-uong" as const;
  return undefined;
}

export function inferConsultationBudget(message: string) {
  const value = normalize(message).replace(/,/g, ".");
  const unitMatch = value.match(
    /(?:duoi|toi da|khoang|tam|ngan sach)?\s*(\d+(?:\.\d+)?)\s*(trieu|tr|nghin|ngan|k)\b/,
  );
  if (unitMatch) {
    const multiplier = /trieu|tr/.test(unitMatch[2]) ? 1_000_000 : 1_000;
    return Math.round(Number(unitMatch[1]) * multiplier);
  }
  const currencyMatch = value.match(
    /(?:duoi|toi da|khoang|tam|ngan sach)\s*(\d{4,})\b/,
  );
  return currencyMatch ? Number(currencyMatch[1]) : undefined;
}

function inferUseCase(message: string) {
  const value = normalize(message);
  const meaningfulTarget = value.match(
    /(?:cho|dung cho)\s+(be|tre em|con|bo|ba|me|ong ba|nguoi lon|nguoi gia|gia dinh|van phong|nhan vien|khach|ban be)/,
  );
  if (meaningfulTarget) return meaningfulTarget[0];

  const purpose = value.match(
    /(an vat|bua sang|buoi sang|moi sang|hang ngay|uong hang ngay|bua toi|nau an|pha che|lam qua|tang qua|mang di hoc|mang di lam|tiep khach|tap luyen|giam can)/,
  );
  return purpose?.[0];
}

function inferPreference(message: string) {
  const value = normalize(message);
  if (
    /(?:loai|vi|cai)?\s*nao cung duoc|gi cung duoc|sao cung duoc|khong quan trong|khong co uu tien|khong uu tien|khong yeu cau|tuy (?:ban|shop|marty)|(?:ban|shop|marty) chon giup|khong biet|chua biet/.test(
      value,
    )
  ) {
    return NO_PREFERENCE;
  }
  const preference = value.match(
    /(vi nguyen ban|nguyen ban|dam thom|vi dam|dam|ca phe sua da|sua da|ca phe den|den da|3 ?in ?1|it ngot|khong duong|ngot|dang|arabica|robusta)/,
  );
  return preference?.[0];
}

export function buildConsultationProfile(
  request: Pick<ChatRequest, "message" | "history">,
): ConsultationProfile {
  const rememberedProfile = request.history
    .findLast(
      (item) =>
        item.role === "assistant" && item.consultationProfile !== undefined,
    )
    ?.consultationProfile;
  const userTurns = [
    ...request.history
      .filter((item) => item.role === "user")
      .map((item) => item.content),
    request.message,
  ].slice(-6);

  const profile: ConsultationProfile = { ...rememberedProfile };
  for (const turn of userTurns) {
    const normalizedTurn = normalize(turn);
    if (
      /san pham khac|nhu cau khac|tu van lai|bat dau lai|doi nhu cau/.test(
        normalizedTurn,
      )
    ) {
      delete profile.category;
      delete profile.budgetMin;
      delete profile.budgetMax;
      delete profile.useCase;
      delete profile.preference;
      delete profile.recipient;
      delete profile.preferredFeatures;
      delete profile.unwantedFeatures;
      delete profile.variantPreferences;
      delete profile.requiredTime;
    }

    const nextCategory = inferConsultationCategory(turn);
    if (
      nextCategory &&
      profile.category &&
      nextCategory !== profile.category
    ) {
      delete profile.budgetMax;
      delete profile.budgetMin;
      delete profile.useCase;
      delete profile.preference;
      delete profile.recipient;
      delete profile.preferredFeatures;
      delete profile.unwantedFeatures;
      delete profile.variantPreferences;
      delete profile.requiredTime;
    }
    profile.category = nextCategory ?? profile.category;
    profile.budgetMax = inferConsultationBudget(turn) ?? profile.budgetMax;
    profile.useCase = inferUseCase(turn) ?? profile.useCase;
    profile.preference = inferPreference(turn) ?? profile.preference;
  }
  return profile;
}

export function missingConsultationField(profile: ConsultationProfile) {
  if (!profile.category) return "category" as const;
  if (!profile.useCase) return "useCase" as const;
  if (!profile.budgetMax) return "budget" as const;
  if (profile.category === "ca-phe" && !profile.preference)
    return "preference" as const;
  return null;
}

export function clarificationFor(
  missing: NonNullable<ReturnType<typeof missingConsultationField>>,
  profile: ConsultationProfile,
) {
  if (missing === "category") {
    return "Bạn muốn tìm nhóm sản phẩm nào: đồ uống, cà phê, gia vị hay bánh kẹo?";
  }
  if (missing === "useCase") {
    const examples =
      profile.category === "gia-vi"
        ? "nấu món gì hoặc dùng cho bữa ăn nào"
        : "dùng cho ai hoặc trong dịp nào";
    return `Để chọn đúng hơn, sản phẩm này sẽ ${examples}?`;
  }
  if (missing === "budget") {
    return "Ngân sách tối đa bạn dự kiến cho sản phẩm là khoảng bao nhiêu?";
  }
  return "Bạn thích cà phê vị nguyên bản, đậm, cà phê đen hay cà phê sữa/ít ngọt?";
}

export function isExactProductLookup(message: string) {
  const value = normalize(message);
  const hasBrand =
    /nescafe|milo|maggi|bibica|orion|richy|chupa chups|cool air/.test(value);
  const hasExactVariant =
    /\b\d+\s*(goi|hop|tui|chai|lon|g|gr|kg|ml|l)\b/.test(value) ||
    /vi nguyen ban|sua da|3 ?in ?1|signature/.test(value);
  return hasBrand && hasExactVariant;
}
