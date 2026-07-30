import assert from "node:assert/strict";
import test from "node:test";
import { runChatCore } from "@/features/chat/orchestrator";
import {
  emptySessionState,
  projectSessionState,
} from "@/features/chat/session-state";
import {
  advanceCustomerCapture,
  checkoutQuantity,
  startCustomerCapture,
} from "@/features/chat/customer-capture";

test("extracts an explicitly confirmed checkout quantity", () => {
  assert.equal(checkoutQuantity("Cho mình 3 hộp loại này"), 3);
  assert.equal(checkoutQuantity("Tôi chốt 2 thùng nhé"), 2);
});

test("does not confuse package size with checkout quantity", () => {
  assert.equal(checkoutQuantity("Tôi muốn loại 20 gói"), null);
  assert.equal(checkoutQuantity("Hộp này có 48 gói phải không?"), null);
});

test("asks for all required checkout information in one message", async () => {
  const started = await runChatCore({
    message: "Tôi muốn để lại thông tin để shop liên hệ",
    history: [],
  });
  assert.equal(started.intent, "lead");
  assert.equal(started.customerCapture?.status, "collecting");
  assert.match(started.text, /họ và tên/i);
  assert.match(started.text, /số điện thoại/i);
  assert.match(started.text, /địa chỉ giao hàng/i);
  assert.doesNotMatch(started.text, /biểu mẫu/i);

  const afterStart = projectSessionState(emptySessionState(), started);
  const completed = await runChatCore({
    sessionId: started.sessionId,
    message:
      "Họ tên: Nguyễn Minh Anh; SĐT: 0901234567; Địa chỉ: 12 Nguyễn Huệ, Quận 1, TP.HCM",
    history: [],
    sessionState: afterStart,
  });
  assert.equal(completed.customerCapture?.status, "ready");
  assert.equal(completed.customerCapture?.name, "Nguyễn Minh Anh");
  assert.equal(completed.customerCapture?.phone, "0901234567");
  assert.equal(
    completed.customerCapture?.address,
    "12 Nguyễn Huệ, Quận 1, TP.HCM",
  );
  assert.equal(completed.shouldCollectLead, false);
  assert.match(completed.text, /tóm tắt đơn hàng/i);
  assert.match(completed.text, /Nguyễn Minh Anh/);
  assert.match(completed.text, /0901234567/);
  assert.match(completed.text, /12 Nguyễn Huệ, Quận 1, TP\.HCM/);
});

test("asks again for every missing field in one message", () => {
  const capture = startCustomerCapture(undefined, ["101"]);
  const partial = advanceCustomerCapture(
    "Tên: Trần Văn Nam; SĐT: 0901234567",
    capture,
  );
  assert.equal(partial.capture.name, "Trần Văn Nam");
  assert.equal(partial.capture.phone, "0901234567");
  assert.equal(partial.capture.address, null);
  assert.match(partial.text, /còn thiếu địa chỉ giao hàng/i);

  const cancelled = advanceCustomerCapture(
    "Tôi không muốn cung cấp nữa",
    partial.capture,
  );
  assert.equal(cancelled.capture.status, "cancelled");
  assert.equal(cancelled.shouldCollectLead, false);
});

test("does not allow the delivery address to be skipped", () => {
  const capture = startCustomerCapture(undefined, []);
  const partial = advanceCustomerCapture(
    "Lê Hoàng Minh; 0987654321",
    capture,
  );
  const skipped = advanceCustomerCapture("bỏ qua", partial.capture);

  assert.equal(skipped.capture.name, "Lê Hoàng Minh");
  assert.equal(skipped.capture.phone, "0987654321");
  assert.equal(skipped.capture.addressSkipped, false);
  assert.equal(skipped.capture.status, "collecting");
  assert.match(skipped.text, /địa chỉ giao hàng/i);
});

test("asks for all fields that remain missing in a single follow-up", () => {
  const capture = startCustomerCapture(undefined, []);
  const partial = advanceCustomerCapture("SĐT: 0912345678", capture);

  assert.equal(partial.capture.phone, "0912345678");
  assert.equal(partial.capture.name, null);
  assert.equal(partial.capture.address, null);
  assert.match(partial.text, /họ và tên/i);
  assert.match(partial.text, /địa chỉ giao hàng/i);
});

test("retries a failed sync without asking for the same information again", () => {
  const retry = startCustomerCapture(
    {
      status: "save_failed",
      name: "Nguyễn Minh Anh",
      phone: "0901234567",
      address: "12 Nguyễn Huệ, Quận 1",
      addressSkipped: false,
      interestedProductIds: ["101"],
      quantity: 1,
      savedLeadId: null,
      error: "Chưa đồng bộ được",
    },
    ["101"],
  );

  assert.equal(retry.status, "ready");
  assert.equal(retry.name, "Nguyễn Minh Anh");
  assert.equal(retry.phone, "0901234567");
  assert.equal(retry.error, null);
});
