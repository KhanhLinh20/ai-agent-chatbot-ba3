import assert from "node:assert/strict";
import test from "node:test";
import { runChat } from "@/features/chat/orchestrator";
import {
  emptySessionState,
  projectSessionState,
} from "@/features/chat/session-state";

async function coffeeRecommendation() {
  return runChat({
    message:
      "Tư vấn Nescafé hộp 20 gói để tôi uống mỗi sáng, vị đậm, ngân sách dưới 100 nghìn",
    history: [],
  });
}

function recommendationHistory(
  recommendation: Awaited<ReturnType<typeof coffeeRecommendation>>,
) {
  return [
    {
      role: "assistant" as const,
      content: recommendation.text,
      productIds: recommendation.products.map((product) => product.id),
      consultationProfile: recommendation.consultationProfile ?? undefined,
    },
  ];
}

test("TC01 - vague request stays in discovery", async () => {
  const response = await runChat({ message: "Tư vấn giúp mình", history: [] });
  assert.equal(response.intent, "discover");
  assert.equal(response.products.length, 0);
});

test("TC02 - complete need returns verified recommendations", async () => {
  const response = await coffeeRecommendation();
  assert.equal(response.intent, "recommend");
  assert.ok(response.products.length > 0 && response.products.length <= 3);
  assert.ok(response.products.every((product) => product.price <= 100_000));
});

test("TC03 - missing budget is requested before recommendation", async () => {
  const response = await runChat({
    message: "Tư vấn cà phê cho tôi uống mỗi sáng, tôi thích vị đậm",
    history: [],
  });
  assert.equal(response.intent, "discover");
  assert.equal(response.products.length, 0);
  assert.match(response.text, /ngân sách/i);
});

test("TC04 - package follow-up keeps the current product context", async () => {
  const recommendation = await coffeeRecommendation();
  const response = await runChat({
    sessionId: recommendation.sessionId,
    message: "Loại 20 gói đó có hương vị như thế nào?",
    history: recommendationHistory(recommendation),
  });
  assert.equal(response.retrievalMode, "context");
  assert.ok(response.products.length > 0);
  assert.ok(response.products.every((product) => /20\s*gói/i.test(product.name)));
});

test("TC05 - discount question compares only current choices", async () => {
  const recommendation = await coffeeRecommendation();
  const response = await runChat({
    sessionId: recommendation.sessionId,
    message: "Trong các sản phẩm trên, loại nào giảm giá nhiều nhất?",
    history: recommendationHistory(recommendation),
  });
  assert.equal(response.retrievalMode, "context");
  assert.deepEqual(
    response.products.map((product) => product.id),
    recommendation.products.map((product) => product.id),
  );
});

test("TC06 - price objection does not restart product discovery", async () => {
  const recommendation = await coffeeRecommendation();
  const response = await runChat({
    sessionId: recommendation.sessionId,
    message: "Loại này mắc quá, có lựa chọn tiết kiệm hơn không?",
    history: recommendationHistory(recommendation),
  });
  assert.equal(response.retrievalMode, "context");
  assert.ok(response.products.length > 0);
});

test("TC07 - concrete purchase choice starts checkout", async () => {
  const recommendation = await coffeeRecommendation();
  const response = await runChat({
    sessionId: recommendation.sessionId,
    message: "Tôi chốt sản phẩm đầu tiên",
    history: recommendationHistory(recommendation),
  });
  assert.equal(response.intent, "lead");
  assert.equal(response.products.length, 1);
  assert.equal(response.customerCapture?.status, "collecting");
  assert.match(response.text, /họ và tên/i);
  assert.match(response.text, /số điện thoại/i);
  assert.match(response.text, /địa chỉ giao hàng/i);
});

test("TC08 - affirmative confirmation advances instead of asking again", async () => {
  const recommendation = await coffeeRecommendation();
  const chosen = recommendation.products[0];
  assert.ok(chosen);
  const response = await runChat({
    sessionId: recommendation.sessionId,
    message: "Đúng rồi",
    history: [
      {
        role: "assistant",
        content: `Bạn đã chọn mua “${chosen.name}” đúng không ạ?`,
        productIds: recommendation.products.map((product) => product.id),
        consultationProfile: recommendation.consultationProfile ?? undefined,
      },
    ],
  });
  assert.equal(response.intent, "lead");
  assert.equal(response.products.length, 1);
  assert.doesNotMatch(response.text, /đúng không/i);
});

test("TC09 - incomplete contact information asks for the missing address", async () => {
  const recommendation = await coffeeRecommendation();
  const checkout = await runChat({
    sessionId: recommendation.sessionId,
    message: "Tôi chốt sản phẩm đầu tiên",
    history: recommendationHistory(recommendation),
  });
  const response = await runChat({
    sessionId: checkout.sessionId,
    message: "Nguyễn Minh Anh; 0901234567",
    history: [],
    sessionState: projectSessionState(emptySessionState(), checkout),
  });
  assert.match(response.text, /địa chỉ giao hàng/i);
  assert.equal(response.customerCapture?.status, "collecting");
});

test("TC10 - complete contact information returns an order summary", async () => {
  const recommendation = await coffeeRecommendation();
  const checkout = await runChat({
    sessionId: recommendation.sessionId,
    message: "Tôi chốt sản phẩm đầu tiên",
    history: recommendationHistory(recommendation),
  });
  const response = await runChat({
    sessionId: checkout.sessionId,
    message:
      "Nguyễn Minh Anh; 0901234567; 12 Nguyễn Huệ, Quận 1, TP.HCM",
    history: [],
    sessionState: projectSessionState(emptySessionState(), checkout),
  });
  assert.match(response.text, /tóm tắt đơn hàng/i);
  assert.match(response.text, /Nguyễn Minh Anh/);
  assert.match(response.text, /0901234567/);
  assert.equal(response.customerCapture?.status, "ready");
});
