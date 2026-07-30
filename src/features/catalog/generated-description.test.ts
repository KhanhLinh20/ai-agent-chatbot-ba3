import assert from "node:assert/strict";
import test from "node:test";

import {
  generateProductDescription,
  PRODUCT_DESCRIPTION_GENERATION_VERSION,
} from "./generated-description";

test("generates a coffee description from title facts without promotion text", () => {
  const description = generateProductDescription({
    productName:
      "[MUA 1 TẶNG 1] Hộp Cà phê hòa tan NESCAFÉ VỊ NGUYÊN BẢN 20 gói",
    brand: "Nescafé",
  });

  assert.match(description, /^Hộp Cà phê hòa tan/);
  assert.doesNotMatch(description, /MUA 1 TẶNG 1/);
  assert.match(description, /nhóm cà phê/);
  assert.match(description, /nguyên bản/);
  assert.match(description, /20 gói/);
});

test("keeps flavor and packaging facts for confectionery products", () => {
  const description = generateProductDescription({
    productName: "Kẹo mút Chupa Chups hương dâu và cola (Gói 60 que)",
    brand: "Chupa Chups",
  });

  assert.match(description, /nhóm bánh kẹo/);
  assert.doesNotMatch(description, /nhóm đồ uống/);
  assert.match(description, /hương vị dâu và cola/);
  assert.match(description, /60 que/);
});

test("extracts a compound package instead of truncating it to grams", () => {
  const description = generateProductDescription({
    productName: "Trà vị chanh NESTEA (Hộp 16 gói x 12g)",
    brand: "Nestea",
  });

  assert.match(description, /16 gói x 12g/);
  assert.doesNotMatch(description, /quy cách 16 g và 12g/);
});

test("returns a useful generic description when the title has no structured facts", () => {
  const description = generateProductDescription({
    productName: "Sản phẩm tiêu dùng ABC",
  });

  assert.match(description, /nhóm hàng tiêu dùng/);
  assert.match(description, /kiểm tra bao bì hoặc trang bán hàng/);
  assert.ok(description.length > 120);
});

test("exports a stable generation version for database provenance", () => {
  assert.equal(PRODUCT_DESCRIPTION_GENERATION_VERSION, "title-template-v1");
});
