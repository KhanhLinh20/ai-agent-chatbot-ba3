import assert from "node:assert/strict";
import test from "node:test";
import { runSalesAgentGraph } from "@/features/chat/sales-agent-graph";
import {
  emptySessionState,
  isExplicitNewNeed,
  projectSessionState,
} from "@/features/chat/session-state";
import { runChatCore } from "@/features/chat/orchestrator";

test("restores active products even when the client sends no history", async () => {
  const recommendation = await runChatCore({
    message: "Túi cà phê hòa tan Nescafé vị nguyên bản",
    history: [],
  });
  assert.ok(
    recommendation.products.some((product) => /20\s*gói/i.test(product.name)),
  );

  const persistedState = projectSessionState(
    emptySessionState(),
    recommendation,
  );
  const followUp = await runSalesAgentGraph({
    request: {
      sessionId: recommendation.sessionId,
      message: "Loại 20 gói đó, hương vị như nào?",
      history: [],
    },
    persistedState,
  });

  assert.equal(
    followUp.response.retrievalMode,
    "context",
    followUp.response.text,
  );
  assert.equal(followUp.response.products.length, 1);
  assert.match(followUp.response.products[0].name, /20\s*gói/i);
  assert.deepEqual(
    followUp.nextState.activeProductIds,
    followUp.response.products.map((product) => product.id),
  );
});

test("does not treat a contextual discount question as a new catalog search", async () => {
  const recommendation = await runChatCore({
    message: "Nescafé hộp 20 gói vị nguyên bản",
    history: [],
  });
  const persistedState = projectSessionState(
    emptySessionState(),
    recommendation,
  );

  const followUp = await runSalesAgentGraph({
    request: {
      sessionId: recommendation.sessionId,
      message: "Trong các sản phẩm trên, sản phẩm nào discount nhiều nhất?",
      history: [],
    },
    persistedState,
  });

  assert.equal(
    followUp.response.retrievalMode,
    "context",
    followUp.response.text,
  );
  assert.deepEqual(
    followUp.response.products.map((product) => product.id),
    recommendation.products.map((product) => product.id),
  );
  assert.match(
    followUp.response.text,
    /giảm|discount|chưa ghi nhận sản phẩm nào/i,
  );
});

test("only an explicit reset changes the shopping need", () => {
  assert.equal(isExplicitNewNeed("Loại nào cũng được, tư vấn giúp mình"), false);
  assert.equal(isExplicitNewNeed("Sản phẩm trên có giảm giá không?"), false);
  assert.equal(
    isExplicitNewNeed("Bắt đầu lại, tôi muốn chuyển sang bánh kẹo"),
    true,
  );
});
