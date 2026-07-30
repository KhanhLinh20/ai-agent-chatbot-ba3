import assert from "node:assert/strict";
import test from "node:test";
import { runChat } from "@/features/chat/orchestrator";
import {
  emptySessionState,
  projectSessionState,
} from "@/features/chat/session-state";

test("asks for clarification when the request is vague", async () => {
  const result = await runChat({ message: "Tư vấn", history: [] });
  assert.equal(result.intent, "discover");
  assert.equal(result.products.length, 0);
  assert.match(result.text, /đồ uống/i);
});

test("describes catalog groups without recommending products too early", async () => {
  const result = await runChat({
    message: "Bạn bán sản phẩm gì?",
    history: [],
  });
  assert.equal(result.intent, "discover");
  assert.equal(result.products.length, 0);
  assert.match(result.text, /4 nhóm chính/i);
  assert.match(result.text, /ngân sách/i);
});

test("answers shipping from the controlled FAQ", async () => {
  const result = await runChat({
    message: "Chính sách giao hàng 2H thế nào?",
    history: [],
  });
  assert.equal(result.intent, "faq");
  assert.equal(result.retrievalMode, "none");
  assert.match(result.text, /300\.000/);
});

test("returns no more than three verified products", async () => {
  const result = await runChat({
    message: "Milo cho bé dưới 100 nghìn",
    history: [],
  });
  assert.equal(result.intent, "recommend");
  assert.ok(result.products.length > 0);
  assert.ok(result.products.length <= 3);
  assert.ok(result.products.every((product) => product.price <= 100_000));
});

test("does not recommend until all consultation slots are available", async () => {
  const first = await runChat({
    message: "Tư vấn cà phê giúp mình",
    history: [],
  });
  assert.equal(first.intent, "discover");
  assert.equal(first.products.length, 0);
  assert.match(first.text, /dùng cho ai/i);

  const second = await runChat({
    sessionId: first.sessionId,
    message: "Cho bố uống buổi sáng",
    history: [
      { role: "user", content: "Tư vấn cà phê giúp mình" },
      { role: "assistant", content: first.text },
    ],
  });
  assert.equal(second.intent, "discover");
  assert.equal(second.products.length, 0);
  assert.match(second.text, /ngân sách/i);

  const third = await runChat({
    sessionId: first.sessionId,
    message: "Dưới 100 nghìn, bố thích vị đậm",
    history: [
      { role: "user", content: "Tư vấn cà phê giúp mình" },
      { role: "assistant", content: first.text },
      { role: "user", content: "Cho bố uống buổi sáng" },
      { role: "assistant", content: second.text },
    ],
  });
  assert.equal(third.intent, "recommend");
  assert.ok(third.products.length > 0);
  assert.ok(third.products.every((product) => product.category === "ca-phe"));
  assert.ok(third.products.every((product) => product.price <= 100_000));
});

test("keeps the previously recommended products for a referential follow-up", async () => {
  const firstTurn = await runChat({
    message: "Túi cà phê hòa tan Nescafé vị nguyên bản",
    history: [],
  });
  assert.ok(firstTurn.products.some((product) => /20\s*gói/i.test(product.name)));

  const followUp = await runChat({
    sessionId: firstTurn.sessionId,
    message: "Loại 20 gói đó, hương vị như nào?",
    history: [
      {
        role: "user",
        content: "Túi cà phê hòa tan Nescafé vị nguyên bản",
      },
      {
        role: "assistant",
        content: firstTurn.text,
        productIds: firstTurn.products.map((product) => product.id),
      },
    ],
  });

  assert.equal(followUp.products.length, 1);
  assert.match(followUp.products[0].name, /20\s*gói/i);
  assert.equal(followUp.products[0].category, "ca-phe");
  assert.doesNotMatch(followUp.products[0].name, /kẹo|bánh/i);
});

test("recommends after the customer says any coffee preference is acceptable", async () => {
  const result = await runChat({
    message: "Loại nào cũng được, tư vấn giúp mình",
    history: [
      {
        role: "user",
        content: "Tư vấn cà phê Nescafé dưới 100 nghìn để uống mỗi sáng",
      },
      {
        role: "assistant",
        content:
          "Bạn thích cà phê vị nguyên bản, đậm, cà phê đen hay cà phê sữa/ít ngọt?",
        consultationProfile: {
          category: "ca-phe",
          useCase: "moi sang",
          budgetMax: 100_000,
        },
      },
    ],
  });

  assert.equal(result.intent, "recommend");
  assert.ok(result.products.length > 0);
  assert.equal(result.consultationProfile?.preference, "khong uu tien");
});

test("hands a request for a real person to the seller without restarting discovery", async () => {
  const result = await runChat({
    message: "Tôi muốn gặp nhân viên tư vấn",
    history: [],
  });

  assert.equal(result.intent, "lead");
  assert.equal(result.shouldCollectLead, true);
  assert.equal(result.conversationState, "CLOSING");
  assert.equal(result.products.length, 0);
});

test("keeps product context when the customer objects to the price", async () => {
  const recommendation = await runChat({
    message: "Nescafé hộp 20 gói vị nguyên bản",
    history: [],
  });
  const result = await runChat({
    sessionId: recommendation.sessionId,
    message: "Loại này mắc quá",
    history: [
      {
        role: "assistant",
        content: recommendation.text,
        productIds: recommendation.products.map((product) => product.id),
        consultationProfile: recommendation.consultationProfile ?? undefined,
      },
    ],
  });

  assert.equal(result.retrievalMode, "context");
  assert.ok(result.products.length > 0);
  assert.deepEqual(
    result.products.map((product) => product.id),
    recommendation.products.map((product) => product.id),
  );
});

test("moves a concrete product choice into the closing flow", async () => {
  const recommendation = await runChat({
    message: "Nescafé hộp 20 gói vị nguyên bản",
    history: [],
  });
  const result = await runChat({
    sessionId: recommendation.sessionId,
    message: "Tôi muốn lấy loại đầu tiên",
    history: [
      {
        role: "assistant",
        content: recommendation.text,
        productIds: recommendation.products.map((product) => product.id),
        consultationProfile: recommendation.consultationProfile ?? undefined,
      },
    ],
  });

  assert.equal(result.intent, "lead");
  assert.equal(result.shouldCollectLead, true);
  assert.equal(result.conversationState, "CLOSING");
  assert.equal(result.retrievalMode, "context");
  assert.equal(result.products.length, 1);

  const completed = await runChat({
    sessionId: result.sessionId,
    message:
      "Họ tên: Nguyễn Minh Anh; SĐT: 0901234567; Địa chỉ: 12 Nguyễn Huệ, Quận 1, TP.HCM",
    history: [],
    sessionState: projectSessionState(emptySessionState(), result),
  });
  assert.match(completed.text, /tóm tắt đơn hàng/i);
  assert.ok(completed.text.includes(result.products[0].name));
  assert.match(completed.text, /Nguyễn Minh Anh/);
  assert.match(completed.text, /0901234567/);
});

test("does not ask for the product again after confirming a concrete choice", async () => {
  const recommendation = await runChat({
    message: "Nescafé hộp 20 gói vị nguyên bản",
    history: [],
  });
  const chosen = recommendation.products[0];
  assert.ok(chosen);

  const result = await runChat({
    sessionId: recommendation.sessionId,
    message: "Đúng rồi",
    history: [
      {
        role: "assistant",
        content: `Bạn đã chọn mua “${chosen.name}” đúng không ạ? Mình xác nhận lại sản phẩm này đang còn hàng.`,
        productIds: recommendation.products.map((product) => product.id),
        consultationProfile: recommendation.consultationProfile ?? undefined,
      },
    ],
  });

  assert.equal(result.intent, "lead");
  assert.equal(result.shouldCollectLead, true);
  assert.equal(result.products.length, 1);
  assert.equal(result.products[0].id, chosen.id);
  assert.equal(result.customerCapture?.status, "collecting");
  assert.match(result.text, /họ và tên/i);
  assert.match(result.text, /số điện thoại/i);
  assert.match(result.text, /địa chỉ giao hàng/i);
  assert.doesNotMatch(result.text, /đúng không/i);
});

test("moves a purchase commitment with a product name directly to checkout", async () => {
  const recommendation = await runChat({
    message: "Nescafé hộp 20 gói vị nguyên bản",
    history: [],
  });
  const chosen = recommendation.products[0];
  assert.ok(chosen);

  const result = await runChat({
    sessionId: recommendation.sessionId,
    message: `Tôi chốt ${chosen.name}`,
    history: [
      {
        role: "assistant",
        content: recommendation.text,
        productIds: recommendation.products.map((product) => product.id),
        consultationProfile: recommendation.consultationProfile ?? undefined,
      },
    ],
  });

  assert.equal(result.intent, "lead");
  assert.equal(result.products.length, 1);
  assert.equal(result.products[0].id, chosen.id);
  assert.equal(result.customerCapture?.status, "collecting");
});

test("does not confuse the requested quantity with a combo product", async () => {
  const recommendation = await runChat({
    message:
      "Tư vấn sữa lúa mạch Nestlé MILO A2 48 hộp x 180ml, dùng cho gia đình hằng ngày, ngân sách dưới 500.000 đồng",
    history: [],
  });
  assert.ok(recommendation.products.some((product) => /\bA2\b/i.test(product.name)));

  const result = await runChat({
    sessionId: recommendation.sessionId,
    message:
      "Tôi chốt mua 2 thùng Sữa lúa mạch Nestlé MILO A2 48 hộp x 180ml",
    history: [
      {
        role: "assistant",
        content: recommendation.text,
        productIds: recommendation.products.map((product) => product.id),
        consultationProfile: recommendation.consultationProfile ?? undefined,
      },
    ],
  });

  assert.equal(result.intent, "lead");
  assert.equal(result.products.length, 1);
  assert.match(result.products[0].name, /\bA2\b/i);
  assert.doesNotMatch(result.products[0].name, /ít đường/i);
  assert.equal(result.customerCapture?.status, "collecting");
});
