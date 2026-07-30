import assert from "node:assert/strict";
import test from "node:test";
import {
  buildConsultationProfile,
  clarificationFor,
  isExactProductLookup,
  missingConsultationField,
} from "./consultation-profile";

test("collects consultation slots across multiple turns", () => {
  const profile = buildConsultationProfile({
    message: "Dưới 100 nghìn, bố thích vị đậm",
    history: [
      { role: "user", content: "Tư vấn cà phê giúp mình" },
      {
        role: "assistant",
        content: "Sản phẩm dùng cho ai?",
      },
      { role: "user", content: "Cho bố uống buổi sáng" },
    ],
  });

  assert.equal(profile.category, "ca-phe");
  assert.equal(profile.budgetMax, 100_000);
  assert.match(profile.useCase || "", /bo|buoi sang/);
  assert.equal(profile.preference, "vi dam");
  assert.equal(missingConsultationField(profile), null);
});

test("asks for the next missing field instead of recommending", () => {
  const profile = buildConsultationProfile({
    message: "Tư vấn cà phê",
    history: [],
  });
  const missing = missingConsultationField(profile);

  assert.equal(missing, "useCase");
  assert.match(clarificationFor(missing!, profile), /dùng cho ai/i);
});

test("recognizes an exact product lookup", () => {
  assert.equal(
    isExactProductLookup("Nescafé vị nguyên bản hộp 20 gói"),
    true,
  );
});

test("understands daily morning usage instead of asking the same question", () => {
  const profile = buildConsultationProfile({
    message: "Dùng cho tôi uống hằng ngày mỗi sáng",
    history: [{ role: "user", content: "Tư vấn cà phê Nescafé" }],
  });

  assert.equal(profile.category, "ca-phe");
  assert.match(profile.useCase || "", /hang ngay|moi sang/);
  assert.equal(missingConsultationField(profile), "budget");
});

test("accepts an explicit no-preference answer instead of asking again", () => {
  for (const answer of [
    "Loại nào cũng được, tư vấn giúp mình",
    "Không quan trọng đâu",
    "Tùy Marty chọn giúp",
    "Mình không biết",
  ]) {
    const profile = buildConsultationProfile({
      message: answer,
      history: [
        {
          role: "assistant",
          content: "Bạn thích cà phê vị nào?",
          consultationProfile: {
            category: "ca-phe",
            useCase: "uong hang ngay",
            budgetMax: 100_000,
          },
        },
      ],
    });

    assert.equal(profile.preference, "khong uu tien");
    assert.equal(missingConsultationField(profile), null);
  }
});
