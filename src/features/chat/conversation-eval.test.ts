import assert from "node:assert/strict";
import test from "node:test";
import { analyzeConversation } from "@/features/chat/conversation-analyzer";
import {
  buildConsultationProfile,
  missingConsultationField,
} from "@/features/chat/consultation-profile";

test("eval: accumulates needs across separate user turns", () => {
  const profile = buildConsultationProfile({
    message: "Ngân sách dưới 100 nghìn, thích vị đậm",
    history: [
      { role: "user", content: "Tư vấn cà phê Nescafé" },
      {
        role: "assistant",
        content: "Bạn dùng cho ai?",
        consultationProfile: { category: "ca-phe" },
      },
      { role: "user", content: "Tôi uống hằng ngày mỗi sáng" },
      { role: "assistant", content: "Ngân sách của bạn là bao nhiêu?" },
    ],
  });

  assert.deepEqual(profile, {
    category: "ca-phe",
    budgetMax: 100_000,
    useCase: "uong hang ngay",
    preference: "vi dam",
  });
  assert.equal(missingConsultationField(profile), null);
});

test("eval: structured profile survives a long history window", () => {
  const profile = buildConsultationProfile({
    message: "Tôi thích vị nguyên bản",
    history: [
      {
        role: "assistant",
        content: "Mình đã ghi nhận nhu cầu.",
        consultationProfile: {
          category: "ca-phe",
          budgetMax: 120_000,
          useCase: "uống hằng ngày",
        },
      },
      ...Array.from({ length: 8 }, (_, index) => ({
        role: (index % 2 ? "assistant" : "user") as "assistant" | "user",
        content: `Lượt trao đổi ${index + 1}`,
      })),
    ],
  });

  assert.equal(profile.category, "ca-phe");
  assert.equal(profile.budgetMax, 120_000);
  assert.equal(profile.preference, "vi nguyen ban");
  assert.equal(missingConsultationField(profile), null);
});

test("eval: explicit new need clears stale consultation slots", () => {
  const profile = buildConsultationProfile({
    message: "Tư vấn lại, tôi muốn bánh kẹo làm quà khoảng 200 nghìn",
    history: [
      {
        role: "assistant",
        content: "Các lựa chọn cà phê phù hợp.",
        consultationProfile: {
          category: "ca-phe",
          budgetMax: 80_000,
          useCase: "uống buổi sáng",
          preference: "vị đậm",
        },
      },
    ],
  });

  assert.equal(profile.category, "banh-keo");
  assert.equal(profile.budgetMax, 200_000);
  assert.equal(profile.useCase, "lam qua");
  assert.equal(profile.preference, undefined);
});

test("eval: analyzer rewrites a follow-up with prior user context", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const analysis = await analyzeConversation({
      message: "Loại 20 gói đó",
      history: [
        {
          role: "user",
          content: "Tìm Nescafé vị nguyên bản dưới 100 nghìn",
        },
        { role: "assistant", content: "Marty có ba lựa chọn." },
      ],
    });
    assert.match(analysis.retrievalQuery, /Nescafé/i);
    assert.match(analysis.retrievalQuery, /20 gói/i);
    assert.equal(analysis.profile.category, "ca-phe");
    assert.equal(analysis.profile.budgetMax, 100_000);
  } finally {
    if (previousKey) process.env.OPENAI_API_KEY = previousKey;
  }
});

test("eval: analyzer recognizes objection and purchase stages", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const objection = await analyzeConversation({
      message: "Mẫu này mắc quá",
      history: [{ role: "assistant", content: "Marty vừa gửi ba lựa chọn." }],
    });
    assert.equal(objection.salesIntent, "objection");
    assert.equal(objection.stage, "objection");

    const purchase = await analyzeConversation({
      message: "Tôi muốn lấy loại này",
      history: [{ role: "assistant", content: "Đây là sản phẩm phù hợp." }],
    });
    assert.equal(purchase.salesIntent, "purchase_intent");
    assert.equal(purchase.stage, "purchase");
    assert.equal(purchase.purchaseReadiness, "high");
  } finally {
    if (previousKey) process.env.OPENAI_API_KEY = previousKey;
  }
});
