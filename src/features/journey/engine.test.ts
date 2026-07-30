import assert from "node:assert/strict";
import test from "node:test";
import { analyzeJourney, type JourneyEvent } from "./engine";

const at = "2026-07-29T00:00:00.000Z";

test("keeps a vague session in discovery", () => {
  const insight = analyzeJourney([
    { type: "search", occurredAt: at, query: "tôi muốn mua sản phẩm" },
  ]);

  assert.equal(insight.stage, "Khám phá");
  assert.equal(insight.purchaseLikelihood, "Thấp");
  assert.equal(insight.interestedCategory, null);
});

test("turns cart intent into a concrete seller action", () => {
  const events: JourneyEvent[] = [
    { type: "search", occurredAt: at, category: "ca-phe" },
    { type: "product_click", occurredAt: at, category: "ca-phe" },
    { type: "add_to_cart", occurredAt: at, category: "ca-phe" },
  ];
  const insight = analyzeJourney(events);

  assert.equal(insight.stage, "Sẵn sàng mua");
  assert.equal(insight.interestedCategory, "Cà phê");
  assert.match(insight.nextBestAction, /số điện thoại/i);
});

test("marks an order as converted", () => {
  const insight = analyzeJourney([
    { type: "order_complete", occurredAt: at, category: "gia-vi" },
  ]);

  assert.equal(insight.score, 100);
  assert.equal(insight.stage, "Đã mua");
  assert.equal(insight.purchaseLikelihood, "Đã chuyển đổi");
});
