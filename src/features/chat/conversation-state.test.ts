import assert from "node:assert/strict";
import test from "node:test";
import { resolveConversationState } from "@/features/chat/conversation-state";

test("stays in discovery while required slots are missing", () => {
  assert.equal(
    resolveConversationState({
      profile: { category: "ca-phe", useCase: "uống mỗi sáng" },
      intent: "recommend",
      hasProductContext: false,
    }),
    "DISCOVERING",
  );
});

test("moves through qualified, recommendation and closing states", () => {
  const profile = {
    category: "ca-phe" as const,
    useCase: "uống mỗi sáng",
    budgetMax: 100_000,
    preference: "vị đậm",
  };
  assert.equal(
    resolveConversationState({
      profile,
      intent: "recommend",
      hasProductContext: false,
    }),
    "QUALIFIED",
  );
  assert.equal(
    resolveConversationState({
      profile,
      intent: "product_detail",
      hasProductContext: true,
    }),
    "RECOMMENDING",
  );
  assert.equal(
    resolveConversationState({
      profile,
      intent: "lead",
      hasProductContext: true,
      shouldCollectLead: true,
    }),
    "CLOSING",
  );
});
