import type { ProductSearchResult } from "@/features/catalog/schemas";
import type { StatefulChatRequest } from "@/features/chat/session-state";

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

function matchingTokens(value: string) {
  const tokens = normalize(value).split(" ").filter(Boolean);
  const expanded = new Set(tokens);
  for (const token of tokens) {
    const compactMeasure = token.match(/^x?(\d+)(ml|gr|kg|mg|g|l)$/);
    if (!compactMeasure) continue;
    expanded.add(`${compactMeasure[1]}${compactMeasure[2]}`);
    expanded.add(compactMeasure[1]);
    expanded.add(compactMeasure[2]);
  }
  return expanded;
}

export function isAffirmativeConfirmation(message: string) {
  const value = normalize(message);
  return /^(?:dung|dung roi|chinh xac|phai|phai roi|ok|okay|vang)\b/.test(
    value,
  );
}

export function isPurchaseCommitment(message: string) {
  const value = normalize(message);
  if (
    /\b(?:nen mua|co nen mua|mua gi|mua (?:loai|san pham|cai) nao)\b/.test(
      value,
    )
  ) {
    return false;
  }
  return (
    /\b(?:toi|minh)\s+(?:muon\s+)?(?:mua|lay|chot|dat)\b/.test(value) ||
    /\b(?:chot|dat hang|lay loai|lay san pham|mua loai|mua san pham)\b/.test(
      value,
    ) ||
    /\bcho\s+(?:toi|minh)\s+\d+\b/.test(value)
  );
}

export function latestContextProductIds(request: StatefulChatRequest) {
  if (request.sessionState?.activeProductIds.length) {
    return request.sessionState.activeProductIds;
  }
  for (let index = request.history.length - 1; index >= 0; index -= 1) {
    const item = request.history[index];
    if (item.role === "assistant" && item.productIds?.length) {
      return item.productIds;
    }
  }
  return [];
}

export function isContextualFollowUp(message: string) {
  const value = normalize(message);
  const wordCount = value.split(" ").filter(Boolean).length;
  return (
    wordCount <= 22 &&
    /\b(do|nay|kia|tren|truoc|vua roi)\b|loai|goi|hop|tui|chai|huong|vi|chi tiet|thanh phan|re hon|dat hon|bao nhieu|con hang|chon cai|lay cai|discount|giam gia|khuyen mai/.test(
      value,
    )
  );
}

export function buildContextualQuery(request: StatefulChatRequest) {
  const recentUserContext = request.history
    .filter((item) => item.role === "user")
    .slice(-2)
    .map((item) => item.content)
    .join(" ");
  return `${recentUserContext} ${request.message}`.trim();
}

export function selectReferencedProducts(
  message: string,
  products: ProductSearchResult[],
) {
  const value = normalize(message);
  const exactNameMatches = products.filter((product) =>
    value.includes(normalize(product.name)),
  );
  if (exactNameMatches.length === 1) return exactNameMatches;

  const ordinal = value.match(
    /(?:san pham|loai|cai)\s*(?:thu)?\s*([123])\b/,
  );
  if (ordinal) {
    const selected = products[Number(ordinal[1]) - 1];
    if (selected) return [selected];
  }
  if (/\b(cuoi|thu ba|so ba)\b/.test(value) && products.at(-1)) {
    return [products.at(-1)!];
  }
  if (/\b(dau|dau tien|thu nhat|so mot)\b/.test(value) && products[0]) {
    return [products[0]];
  }

  let candidates = products;
  const quantityReferences = [
    ...value.matchAll(
      /\b(\d+)\s*(goi|hop|tui|chai|lon|g|gr|kg|ml|lit|l)\b/g,
    ),
  ];

  if (quantityReferences.length) {
    const exact = products.filter((product) => {
      const name = normalize(product.name);
      return quantityReferences.some((reference) => {
        const amount = reference[1];
        const unit = reference[2];
        return new RegExp(`\\b${amount}\\s*${unit}\\b`).test(name);
      });
    });
    if (exact.length === 1) return exact;
    if (exact.length > 1) candidates = exact;
  }

  const messageTokens = matchingTokens(value);
  const scored = candidates
    .map((product) => {
      const productTokens = matchingTokens(product.name);
      let score = 0;
      for (const token of productTokens) {
        if (!messageTokens.has(token)) continue;
        score += /\d/.test(token) ? 3 : token.length >= 3 ? 1 : 0;
      }
      return { product, score };
    })
    .sort((left, right) => right.score - left.score);
  const best = scored[0];
  const runnerUp = scored[1];
  if (best && best.score >= 3 && best.score > (runnerUp?.score ?? 0)) {
    return [best.product];
  }

  return candidates;
}

function conciseDescription(product: ProductSearchResult) {
  const repeatedTitle = `${product.name}.`;
  const description = product.shortDescription.startsWith(repeatedTitle)
    ? product.shortDescription.slice(repeatedTitle.length).trim()
    : product.shortDescription.trim();
  if (
    !description ||
    /sản phẩm thuộc danh mục|tên, thương hiệu hoặc mục đích/i.test(description)
  ) {
    return "";
  }
  const sentences = description.match(/[^.!?]+[.!?]+/g)?.slice(0, 2).join(" ");
  return (sentences || description).slice(0, 420).trim();
}

export function contextualProductAnswer(
  message: string,
  products: ProductSearchResult[],
) {
  const normalizedMessage = normalize(message);
  if (
    products.length > 1 &&
    /discount|giam gia|khuyen mai|re nhieu|giam nhieu/.test(normalizedMessage)
  ) {
    const discountValue = (product: ProductSearchResult) =>
      product.originalPrice && product.originalPrice > product.price
        ? product.originalPrice - product.price
        : 0;
    const discountPercent = (product: ProductSearchResult) =>
      product.originalPrice && product.originalPrice > product.price
        ? Math.round(
            ((product.originalPrice - product.price) / product.originalPrice) *
              100,
          )
        : 0;
    const best = [...products].sort(
      (left, right) =>
        discountPercent(right) - discountPercent(left) ||
        discountValue(right) - discountValue(left),
    )[0];
    const percent = discountPercent(best);
    if (percent <= 0) {
      return "Trong các sản phẩm vừa trao đổi, dữ liệu hiện tại chưa ghi nhận sản phẩm nào có giá gốc cao hơn giá bán, nên Marty chưa thể xác nhận sản phẩm đang giảm giá.";
    }
    return `Trong ${products.length} sản phẩm vừa trao đổi, “${best.name}” đang có mức giảm cao nhất: khoảng ${percent}% (từ ${new Intl.NumberFormat("vi-VN").format(best.originalPrice!)}đ còn ${new Intl.NumberFormat("vi-VN").format(best.price)}đ).`;
  }

  if (products.length !== 1) {
    return `Marty vẫn đang bám theo ${products.length} lựa chọn vừa trao đổi. Bạn có thể nói rõ số gói, vị hoặc vị trí sản phẩm để Marty chọn đúng một loại.`;
  }

  const product = products[0];
  const description = conciseDescription(product);
  const asksFlavor = /hương|vị|thơm|đắng|ngọt/i.test(message);
  const detail = description
    ? description
    : asksFlavor
      ? "Dữ liệu chính hãng hiện có chưa mô tả riêng hương vị của quy cách này, nên Marty không tự suy đoán."
      : "Marty chưa có thêm mô tả đã kiểm chứng ngoài thông tin trên catalog.";
  const stock = product.inStock ? "đang còn hàng" : "hiện đã hết hàng";
  const price = new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(product.price);

  return `Bạn đang hỏi đúng loại “${product.name}”. ${detail} Giá hiện tại ${price} và ${stock}.`;
}
