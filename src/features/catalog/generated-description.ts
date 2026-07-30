export const PRODUCT_DESCRIPTION_GENERATION_VERSION = "title-template-v1";

type ProductDescriptionInput = {
  productName: string;
  brand?: string | null;
};

type ProductCategory = {
  label: string;
  selectionHint: string;
};

const PROMOTION_PATTERN =
  /(?:tặng|quà|giao nhanh|voucher|sale|deal|mua \d|đơn từ|giảm|freeship)/i;

const FEATURE_LABELS = [
  ["3in1", "3 trong 1"],
  ["3 in 1", "3 trong 1"],
  ["2in1", "2 trong 1"],
  ["2 in 1", "2 trong 1"],
  ["nguyen ban", "nguyên bản"],
  ["rang dam", "rang đậm"],
  ["dam vi", "đậm vị"],
  ["it ngot", "ít ngọt"],
  ["khong duong", "không đường"],
  ["hoa tan", "hòa tan"],
  ["ca phe den", "cà phê đen"],
  ["sua da", "sữa đá"],
  ["tra sua", "trà sữa"],
  ["keo deo", "kẹo dẻo"],
  ["keo mut", "kẹo mút"],
  ["banh quy", "bánh quy"],
  ["socola", "socola"],
] as const;

function normalizedText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function cleanProductName(productName: string) {
  const withoutPromotions = productName.replace(/\[([^\]]+)\]/g, (match, text) =>
    PROMOTION_PATTERN.test(text) ? "" : match,
  );

  return withoutPromotions
    .replace(/\s+/g, " ")
    .replace(/^[\s,;|./-]+|[\s,;|./-]+$/g, "")
    .trim();
}

function inferCategory(productName: string): ProductCategory {
  const name = normalizedText(productName);

  if (/nescaf|ca phe|coffee/.test(name)) {
    return {
      label: "cà phê",
      selectionHint: "dòng cà phê, hương vị và quy cách đóng gói",
    };
  }
  if (/\b(?:keo|banh|socola|chocolate|biscuit|snack)\b/.test(name)) {
    return {
      label: "bánh kẹo",
      selectionHint: "loại bánh kẹo, hương vị và quy cách đóng gói",
    };
  }
  if (/\b(?:tra|nestea|milo|sua|nuoc|thuc uong|do uong)\b/.test(name)) {
    return {
      label: "đồ uống",
      selectionHint: "hương vị, dung tích và quy cách đóng gói",
    };
  }
  if (/maggi|nuoc tuong|dau hao|hat nem|gia vi|tuong ot|xot/.test(name)) {
    return {
      label: "gia vị",
      selectionHint: "loại gia vị, hương vị và dung tích",
    };
  }
  return {
    label: "hàng tiêu dùng",
    selectionHint: "loại sản phẩm và quy cách được niêm yết",
  };
}

function extractPackaging(productName: string) {
  const matches = productName.match(
    /\b\d+(?:[.,]\d+)?\s*(?:gói|goi|hộp|hop|túi|tui|bịch|bich|chai|lon|que|viên|vien|cái|cai|bánh|banh|thùng|thung|lít|lit|kg|gr|ml|g|l)(?:\s*(?:x|×)\s*\d+(?:[.,]\d+)?\s*(?:gói|goi|hộp|hop|túi|tui|bịch|bich|chai|lon|que|viên|vien|cái|cai|bánh|banh|thùng|thung|lít|lit|kg|gr|ml|g|l))?/giu,
  );

  return unique(matches ?? []).slice(0, 4);
}

function extractFlavors(productName: string) {
  const flavors = Array.from(
    productName.matchAll(
      /(?:hương vị|hương|vị)\s+([^,()[\]|]{2,55})(?=$|[,()[\]|])/giu,
    ),
    (match) => match[1].replace(/\s+/g, " ").trim(),
  );

  return unique(flavors).slice(0, 3);
}

function extractFeatures(productName: string) {
  const normalized = normalizedText(productName);
  return unique(
    FEATURE_LABELS.filter(([needle]) => normalized.includes(needle)).map(
      ([, label]) => label,
    ),
  ).slice(0, 4);
}

function formatVietnameseList(values: string[]) {
  if (values.length <= 1) return values[0] ?? "";
  return `${values.slice(0, -1).join(", ")} và ${values.at(-1)}`;
}

export function generateProductDescription({
  productName,
  brand,
}: ProductDescriptionInput) {
  const cleanedName = cleanProductName(productName) || productName.trim();
  const category = inferCategory(cleanedName);
  const packaging = extractPackaging(cleanedName);
  const flavors = extractFlavors(cleanedName);
  const features = extractFeatures(cleanedName);
  const normalizedBrand = brand?.trim();

  const sentences = [
    `${cleanedName} là sản phẩm thuộc nhóm ${category.label}${
      normalizedBrand ? ` của thương hiệu ${normalizedBrand}` : ""
    }.`,
  ];

  const titleFacts = [
    features.length
      ? `đặc điểm ${formatVietnameseList(features)}`
      : "",
    flavors.length ? `hương vị ${formatVietnameseList(flavors)}` : "",
    packaging.length
      ? `quy cách ${formatVietnameseList(packaging)}`
      : "",
  ].filter(Boolean);

  if (titleFacts.length) {
    sentences.push(
      `Theo tên sản phẩm, thông tin nổi bật gồm ${formatVietnameseList(titleFacts)}.`,
    );
  }

  sentences.push(
    `Sản phẩm phù hợp để khách hàng cân nhắc theo ${category.selectionHint}.`,
    "Vui lòng kiểm tra bao bì hoặc trang bán hàng để xác nhận thành phần, hạn sử dụng và hướng dẫn sử dụng.",
  );

  return sentences.join(" ");
}
