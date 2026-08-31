"use client";

import Image from "next/image";
import Link from "next/link";
import {
  Bot,
  Check,
  CheckCircle2,
  ExternalLink,
  Package,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ProductSearchResult } from "@/features/catalog/schemas";
import type { ChatResponse } from "@/features/chat/schemas";
import {
  type JourneyEvent,
  type JourneyEventType,
} from "@/features/journey/engine";
import styles from "./page.module.css";

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  products?: ProductSearchResult[];
  comparison?: ChatResponse["comparison"];
  consultationProfile?: ChatResponse["consultationProfile"];
};

const welcome: Message = {
  id: "welcome",
  role: "assistant",
  text: "Chào bạn, mình là Marty. Hãy cho mình biết bạn đang cần sản phẩm gì, ngân sách khoảng bao nhiêu và dùng cho ai. Mình sẽ hỏi thêm nếu cần rồi mới gợi ý tối đa 3 lựa chọn phù hợp.",
};

const vnd = (value: number) =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);

function ProductImage({
  product,
  size = 72,
}: {
  product: Pick<ProductSearchResult, "name" | "imageUrl">;
  size?: number;
}) {
  return product.imageUrl ? (
    <Image
      src={product.imageUrl}
      alt={product.name}
      width={size}
      height={size}
      unoptimized
    />
  ) : (
    <span className={styles.imageFallback}>
      <Package />
    </span>
  );
}

function productSpecification(
  product: ProductSearchResult,
  key: string,
): string | number | boolean | null {
  const value = product.specifications[key];
  return typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
    ? value
    : null;
}

function productDescription(product: ProductSearchResult) {
  const description = product.shortDescription.trim();
  const repeatedTitle = `${product.name}.`;
  return description.startsWith(repeatedTitle)
    ? description.slice(repeatedTitle.length).trim()
    : description;
}

function ProductPrice({ product }: { product: ProductSearchResult }) {
  const referencePrice = product.priceBeforePromotion ?? product.originalPrice;
  const hasPromotion =
    (typeof product.discountPercent === "number" && product.discountPercent > 0) ||
    (referencePrice !== null && referencePrice > product.price);
  return (
    <div className={styles.productPrice}>
      <strong>{vnd(product.price)}</strong>
      {hasPromotion && referencePrice && referencePrice > product.price && (
        <del>{vnd(referencePrice)}</del>
      )}
      {hasPromotion && typeof product.discountPercent === "number" && (
        <span className={styles.promotionBadge}>
          -{Math.round(product.discountPercent)}%
        </span>
      )}
    </div>
  );
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([welcome]);
  const [draft, setDraft] = useState("");
  const [sessionId, setSessionId] = useState<string>();
  const [consultationState, setConsultationState] =
    useState<ChatResponse["sessionState"]>();
  const [sending, setSending] = useState(false);
  const [detail, setDetail] = useState<ProductSearchResult | null>(null);
  const [comparison, setComparison] =
    useState<ChatResponse["comparison"]>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const journeyEventsRef = useRef<JourneyEvent[]>([]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  async function trackJourney(
    type: JourneyEventType,
    details: Omit<JourneyEvent, "type" | "occurredAt"> = {},
    resolvedSessionId = sessionId,
  ) {
    if (!resolvedSessionId) return;
    const event: JourneyEvent = {
      type,
      occurredAt: new Date().toISOString(),
      ...details,
    };
    const events = [...journeyEventsRef.current, event].slice(-30);
    journeyEventsRef.current = events;

    try {
      const response = await fetch("/api/journey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: resolvedSessionId,
          event,
          events,
        }),
      });
      if (!response.ok) return;
      await response.json();
    } catch {
      // Local analysis remains available if persistence is temporarily offline.
    }
  }

  async function send(text = draft) {
    const content = text.trim();
    if (!content || sending) return;

    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", text: content },
    ]);
    setDraft("");
    setSending(true);

    try {
      const response = await fetch("/api/v2/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: content,
          sessionId,
          sessionState: consultationState,
          history: messages.slice(-12).map((message) => ({
            role: message.role,
            content: message.text,
            productIds: message.products?.map((product) => product.id),
            consultationProfile: message.consultationProfile,
          })),
        }),
      });
      const payload = (await response.json()) as ChatResponse & {
        error?: string;
      };
      if (!response.ok)
        throw new Error(payload.error || "Không thể gửi tin nhắn.");

      setSessionId(payload.sessionId);
      setConsultationState(payload.sessionState);
      void trackJourney(
        "search",
        {
          query: content,
          category: payload.products[0]?.category,
          metadata: { resultCount: payload.products.length },
        },
        payload.sessionId,
      );
      for (const product of payload.products) {
        void trackJourney(
          "product_impression",
          {
            productId: product.id,
            productName: product.name,
            category: product.category,
          },
          payload.sessionId,
        );
      }
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: payload.text,
          products: payload.products,
          comparison: payload.comparison,
          consultationProfile: payload.consultationProfile,
        },
      ]);
      if (payload.customerSaved) {
        void trackJourney("lead_submit", {
          category: payload.products[0]?.category,
          metadata: {
            interestedProductCount:
              payload.sessionState?.customerCapture.interestedProductIds
                .length ?? 0,
            source: "chatbot",
          },
        });
      }
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text:
            error instanceof Error && error.message
              ? error.message
              : "Marty chưa kết nối được kho hàng. Bạn thử lại giúp mình nhé.",
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <main className={styles.app}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>
            <Sparkles size={19} />
          </span>
          <div>
            <b>MARTY</b>
            <small>Trợ lý chốt đơn AI</small>
          </div>
        </div>
        <div className={styles.topActions}>
          <span className={styles.online}>
            <i /> Đang trực tuyến
          </span>
          <Link href="/admin">
            <UsersRound size={16} /> Quản lý khách hàng
          </Link>
        </div>
      </header>

      <div className={styles.workspace}>
        <section className={styles.chat}>
          <header className={styles.chatHead}>
            <div className={styles.assistantIdentity}>
              <span className={styles.botAvatar}>
                <Bot size={20} />
              </span>
              <div>
                <h1>Tư vấn cùng Marty</h1>
                <p>Hiểu nhu cầu trước, gợi ý đúng sản phẩm sau</p>
              </div>
            </div>
            <button
              className={styles.reset}
              onClick={() => {
                setMessages([welcome]);
                setSessionId(undefined);
              }}
            >
              <RotateCcw size={15} /> Cuộc trò chuyện mới
            </button>
          </header>

          <div className={styles.stream} aria-live="polite">
            {messages.map((message) => (
              <div key={message.id} className={styles.messageGroup}>
                <div
                  className={`${styles.message} ${
                    message.role === "user" ? styles.userMessage : ""
                  }`}
                >
                  {message.role === "assistant" && (
                    <span className={styles.messageAvatar}>M</span>
                  )}
                  <p>{message.text}</p>
                </div>

                {!!message.products?.length && (
                  <div className={styles.recommendations}>
                    <div className={styles.recommendationLabel}>
                      <Check size={14} />
                      Phù hợp với nhu cầu vừa trao đổi
                    </div>
                    <div className={styles.productGrid}>
                      {message.products.map((product) => (
                        <article className={styles.productCard} key={product.id}>
                          <div className={styles.productVisual}>
                            <ProductImage product={product} size={120} />
                            {product.isFeatured && <b>Bán chạy</b>}
                            {product.monthlySold != null && product.monthlySold > 0 && (
                              <em className={styles.purchaseCount}>
                                Đã mua {new Intl.NumberFormat("vi-VN").format(product.monthlySold)} lượt/tháng
                              </em>
                            )}
                          </div>
                          <div className={styles.productContent}>
                            <small>
                              {product.brand || product.category}
                              <i />
                              {product.inStock ? "Còn hàng" : "Hết hàng"}
                            </small>
                            <h2>{product.name}</h2>
                            <p>{product.reason}</p>
                            <ProductPrice product={product} />
                            <div className={styles.cardActions}>
                              <button
                                onClick={() => {
                                  setDetail(product);
                                  void trackJourney("product_click", {
                                    productId: product.id,
                                    productName: product.name,
                                    category: product.category,
                                  });
                                }}
                              >
                                Chi tiết
                              </button>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                    <div className={styles.resultActions}>
                      {message.products.length >= 2 && (
                        <button
                          onClick={() => {
                            setComparison(
                              message.comparison || {
                                title: "So sánh sản phẩm",
                                productIds: message.products!.map(
                                  (product) => product.id,
                                ),
                                rows: [
                                  {
                                    label: "Giá bán",
                                    values: message.products!.map((product) =>
                                      vnd(product.price),
                                    ),
                                  },
                                  {
                                    label: "Tình trạng",
                                    values: message.products!.map((product) =>
                                      product.inStock ? "Còn hàng" : "Hết hàng",
                                    ),
                                  },
                                ],
                                verdict:
                                  "Hãy chọn theo nhu cầu sử dụng và ngân sách thực tế.",
                              },
                            );
                            void trackJourney("compare", {
                              category: message.products![0]?.category,
                              metadata: {
                                productCount: message.products!.length,
                              },
                            });
                          }}
                        >
                          So sánh các lựa chọn
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
            {sending && (
              <div className={styles.typing}>
                <i />
                <i />
                <i /> Marty đang tìm lựa chọn phù hợp…
              </div>
            )}
            <div ref={endRef} />
          </div>

          <div className={styles.composer}>
            {consultationState?.customerCapture.status !== "collecting" && (
              <div className={styles.quickActions}>
              <button
                onClick={() =>
                  setDraft(
                    "Tôi cần tìm sản phẩm phù hợp, hãy hỏi thêm về nhu cầu của tôi.",
                  )
                }
              >
                <Sparkles size={14} /> Tìm sản phẩm
              </button>
              <button
                onClick={() =>
                  setDraft("Hãy giúp tôi so sánh các sản phẩm phù hợp.")
                }
              >
                So sánh lựa chọn
              </button>
              </div>
            )}
            <form
              onSubmit={(event) => {
                event.preventDefault();
                send();
              }}
            >
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    send();
                  }
                }}
                placeholder={
                  consultationState?.customerCapture.status === "collecting"
                    ? "Nhập họ tên, số điện thoại và địa chỉ giao hàng trong một tin nhắn…"
                    : "Khách hàng đang tìm sản phẩm gì?"
                }
                aria-label="Tin nhắn tư vấn"
                rows={1}
              />
              <button
                disabled={!draft.trim() || sending}
                aria-label="Gửi tin nhắn"
              >
                <Send size={17} />
              </button>
            </form>
            <small>
              Marty chỉ gợi ý khi đã hiểu đủ nhu cầu và sử dụng dữ liệu sản phẩm
              trong hệ thống.
            </small>
          </div>
        </section>

      </div>

      <Dialog
        open={!!detail}
        onOpenChange={(open) => !open && setDetail(null)}
      >
        <DialogContent className={styles.productDetailDialog}>
          <DialogHeader>
            <DialogTitle>{detail?.name}</DialogTitle>
            <DialogDescription>
              Thông tin sản phẩm và nguồn tham khảo chính hãng.
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <div className={styles.detailBody}>
              <div className={styles.detailVisual}>
                <ProductImage product={detail} size={180} />
              </div>
              <div className={styles.detailSummary}>
                <b>{detail.brand || detail.category}</b>
                <ProductPrice product={detail} />
                <small>
                  {detail.inStock
                    ? detail.stockQuantity === null
                      ? "Đang còn hàng"
                      : `Còn ${detail.stockQuantity} sản phẩm`
                    : "Tạm hết hàng"}
                </small>
                {detail.monthlySold != null && detail.monthlySold > 0 && (
                  <span className={styles.detailPopularity}>
                    Được mua {new Intl.NumberFormat("vi-VN").format(detail.monthlySold)} lượt/tháng
                  </span>
                )}
              </div>
              <section className={styles.detailDescription}>
                <h3>Mô tả sản phẩm</h3>
                <p>
                  {productDescription(detail) ||
                    "Sản phẩm này chưa có mô tả chi tiết."}
                </p>
              </section>
              {typeof productSpecification(
                detail,
                "descriptionSourceUrl",
              ) === "string" && (
                <a
                  className={styles.detailSource}
                  href={String(
                    productSpecification(detail, "descriptionSourceUrl"),
                  )}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ShieldCheck />
                  <span>
                    <b>
                      {productSpecification(
                        detail,
                        "descriptionSourceType",
                      ) === "official_product"
                        ? "Nguồn sản phẩm chính hãng"
                        : "Nguồn thương hiệu chính hãng"}
                    </b>
                    <small>
                      {productSpecification(
                        detail,
                        "descriptionConfidence",
                      ) !== null
                        ? `Độ tin cậy ${Math.round(
                            Number(
                              productSpecification(
                                detail,
                                "descriptionConfidence",
                              ),
                            ) * 100,
                          )}%`
                        : "Đã đối chiếu nguồn"}
                    </small>
                  </span>
                  <ExternalLink />
                </a>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!comparison}
        onOpenChange={(open) => !open && setComparison(null)}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{comparison?.title}</DialogTitle>
            <DialogDescription>
              So sánh từ giá và dữ liệu sản phẩm đang có.
            </DialogDescription>
          </DialogHeader>
          <div className={styles.compareTable}>
            {comparison?.rows.map((row) => (
              <div key={row.label}>
                <b>{row.label}</b>
                {row.values.map((value, index) => (
                  <span key={`${row.label}-${index}`}>{value}</span>
                ))}
              </div>
            ))}
          </div>
          <p className={styles.verdict}>
            <CheckCircle2 /> {comparison?.verdict}
          </p>
        </DialogContent>
      </Dialog>
    </main>
  );
}
