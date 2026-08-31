"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowUpRight,
  BarChart3,
  Bot,
  CircleDollarSign,
  ClipboardList,
  ExternalLink,
  Eye,
  LayoutDashboard,
  MessageSquareText,
  Package,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  ShoppingCart,
  ShoppingBag,
  Target,
  Trash2,
  TrendingUp,
  Upload,
  Users,
  X,
} from "lucide-react";
import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AdminProduct } from "@/features/admin/demo-store";
import styles from "./admin.module.css";

type Tab = "dashboard" | "leads" | "orders" | "conversations" | "products";

type ConversationMessage = {
  id: number;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

type AdminConversation = {
  id: number;
  sessionId: string;
  customerName: string | null;
  customerPhone: string | null;
  status: string;
  summary: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  lastMessage: string | null;
  messages: ConversationMessage[];
};

type Overview = {
  mode: "demo" | "supabase";
  products: AdminProduct[];
  conversations: AdminConversation[];
  leads: Record<string, unknown>[];
  orders: Record<string, unknown>[];
  conversationError: string | null;
};

type OrderItem = {
  id: string;
  name: string;
  quantity: number;
  price: number;
};

function productSalePrice(product: Pick<AdminProduct, "price" | "originalPrice" | "discountPercent">) {
  if (product.discountPercent && product.discountPercent > 0 && product.originalPrice) {
    return Math.round(product.originalPrice * (1 - product.discountPercent / 100));
  }
  return product.price;
}

type RevenueDay = {
  key: string;
  label: string;
  revenue: number;
  orders: number;
};

type ProductPerformance = {
  id: string;
  name: string;
  quantity: number;
  revenue: number;
};

type BusinessMetrics = {
  revenue: number;
  orderCount: number;
  averageOrderValue: number;
  conversionRate: number;
  leadConversionRate: number;
  pendingOrders: number;
  unconvertedLeads: number;
  trend: RevenueDay[];
  topProducts: ProductPerformance[];
};

const emptyOverview: Overview = {
  mode: "demo",
  products: [],
  conversations: [],
  leads: [],
  orders: [],
  conversationError: null,
};

const tabs = [
  { id: "dashboard", label: "Tổng quan kinh doanh", icon: LayoutDashboard },
  { id: "leads", label: "Khách hàng tiềm năng", icon: Users },
  { id: "orders", label: "Đơn hàng đã chốt", icon: ClipboardList },
  { id: "conversations", label: "Lịch sử hội thoại", icon: MessageSquareText },
  { id: "products", label: "Sản phẩm", icon: Package },
] as const;

const vnd = (value: number) =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);

const dateTime = (value: string) =>
  new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));

const cell = (row: Record<string, unknown>, key: string) =>
  row[key] == null ? "—" : String(row[key]);

function orderItems(row: Record<string, unknown>): OrderItem[] {
  let value = row.items;

  if (typeof value === "string") {
    try {
      value = JSON.parse(value) as unknown;
    } catch {
      return [];
    }
  }

  const items = Array.isArray(value)
    ? value
    : value && typeof value === "object"
      ? [value]
      : [];

  return items.flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const name = String(record.name ?? record.product_name ?? "").trim();
    if (!name) return [];

    const parsedQuantity = Number(record.quantity);
    return [
      {
        id: String(record.id ?? `${name}-${index}`),
        name,
        quantity:
          Number.isSafeInteger(parsedQuantity) && parsedQuantity > 0
            ? parsedQuantity
            : 1,
        price: Number.isFinite(Number(record.price))
          ? Number(record.price)
          : 0,
      },
    ];
  });
}

function OrderItemsCell({ order }: { order: Record<string, unknown> }) {
  const items = orderItems(order);
  if (items.length === 0) return <span>—</span>;

  return (
    <ul className={styles.orderItems}>
      {items.map((item) => (
        <li key={item.id}>
          <span>{item.name}</span>
          <b>× {item.quantity}</b>
        </li>
      ))}
    </ul>
  );
}

function isoDay(value: unknown) {
  const date = new Date(String(value ?? ""));
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function dashboardMetrics(data: Overview): BusinessMetrics {
  const revenue = data.orders.reduce(
    (total, order) => total + Number(order.total_amount || 0),
    0,
  );
  const orderCount = data.orders.length;
  const averageOrderValue = orderCount ? revenue / orderCount : 0;
  const conversionRate = data.conversations.length
    ? (orderCount / data.conversations.length) * 100
    : 0;
  const leadConversionRate = data.leads.length
    ? (orderCount / data.leads.length) * 100
    : 0;
  const pendingOrders = data.orders.filter((order) =>
    /pending|chờ|new/i.test(String(order.status ?? "")),
  ).length;
  const orderPhones = new Set(
    data.orders
      .map((order) => String(order.customer_phone ?? "").replace(/\D/g, ""))
      .filter(Boolean),
  );
  const unconvertedLeads = data.leads.filter((lead) => {
    const phone = String(lead.customer_phone ?? "").replace(/\D/g, "");
    return phone && !orderPhones.has(phone);
  }).length;

  const productMap = new Map<string, ProductPerformance>();
  for (const order of data.orders) {
    for (const item of orderItems(order)) {
      const current = productMap.get(item.id) ?? {
        id: item.id,
        name: item.name,
        quantity: 0,
        revenue: 0,
      };
      current.quantity += item.quantity;
      current.revenue += item.price * item.quantity;
      productMap.set(item.id, current);
    }
  }

  const datedOrders = data.orders
    .map((order) => ({
      order,
      key: isoDay(order.created_at),
    }))
    .filter(
      (entry): entry is { order: Record<string, unknown>; key: string } =>
        entry.key !== null,
    );
  const latestKey = datedOrders
    .map((entry) => entry.key)
    .sort()
    .at(-1);
  const trend: RevenueDay[] = [];

  if (latestKey) {
    const anchor = new Date(`${latestKey}T00:00:00.000Z`);
    for (let offset = 6; offset >= 0; offset -= 1) {
      const date = new Date(anchor);
      date.setUTCDate(anchor.getUTCDate() - offset);
      const key = date.toISOString().slice(0, 10);
      const rows = datedOrders.filter((entry) => entry.key === key);
      trend.push({
        key,
        label: `${String(date.getUTCDate()).padStart(2, "0")}/${String(
          date.getUTCMonth() + 1,
        ).padStart(2, "0")}`,
        orders: rows.length,
        revenue: rows.reduce(
          (total, entry) =>
            total + Number(entry.order.total_amount || 0),
          0,
        ),
      });
    }
  }

  return {
    revenue,
    orderCount,
    averageOrderValue,
    conversionRate,
    leadConversionRate,
    pendingOrders,
    unconvertedLeads,
    trend,
    topProducts: [...productMap.values()]
      .sort(
        (left, right) =>
          right.quantity - left.quantity || right.revenue - left.revenue,
      )
      .slice(0, 5),
  };
}

function MetricCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className={styles.metricCard}>
      <span>{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        <p>{detail}</p>
      </div>
    </article>
  );
}

function BusinessDashboard({
  data,
  loading,
  onNavigate,
}: {
  data: Overview;
  loading: boolean;
  onNavigate: (tab: Tab) => void;
}) {
  const metrics = useMemo(() => dashboardMetrics(data), [data]);
  const maxRevenue = Math.max(
    ...metrics.trend.map((item) => item.revenue),
    1,
  );
  const funnel = [
    {
      label: "Hội thoại",
      value: data.conversations.length,
      detail: "Khách bắt đầu trao đổi",
    },
    {
      label: "Khách tiềm năng",
      value: data.leads.length,
      detail: `${metrics.leadConversionRate.toFixed(1)}% đã thành đơn`,
    },
    {
      label: "Đơn đã chốt",
      value: metrics.orderCount,
      detail: `${metrics.conversionRate.toFixed(1)}% trên hội thoại`,
    },
  ];
  const funnelMax = Math.max(data.conversations.length, data.leads.length, 1);

  if (loading) {
    return <div className={styles.dashboardLoading}>Đang tổng hợp dữ liệu kinh doanh…</div>;
  }

  return (
    <div className={styles.dashboard}>
      <section className={styles.metricGrid}>
        <MetricCard
          icon={<CircleDollarSign />}
          label="Doanh thu đã chốt"
          value={vnd(metrics.revenue)}
          detail={`Từ ${metrics.orderCount} đơn hàng`}
        />
        <MetricCard
          icon={<ShoppingCart />}
          label="Đơn hàng"
          value={String(metrics.orderCount)}
          detail={`${metrics.pendingOrders} đơn chờ người bán xác nhận`}
        />
        <MetricCard
          icon={<BarChart3 />}
          label="Giá trị đơn trung bình"
          value={vnd(metrics.averageOrderValue)}
          detail="Doanh thu trung bình mỗi đơn"
        />
        <MetricCard
          icon={<Target />}
          label="Tỷ lệ chốt hội thoại"
          value={`${metrics.conversionRate.toFixed(1)}%`}
          detail={`${data.conversations.length} hội thoại được ghi nhận`}
        />
      </section>

      <section className={styles.dashboardGrid}>
        <article className={`${styles.dashboardCard} ${styles.revenueCard}`}>
          <header>
            <div>
              <small>HIỆU SUẤT BÁN HÀNG</small>
              <h2>Doanh thu 7 ngày gần nhất</h2>
            </div>
            <span className={styles.liveBadge}>
              <TrendingUp /> Dữ liệu thực
            </span>
          </header>
          {metrics.trend.length === 0 ? (
            <p className={styles.dashboardEmpty}>Chưa có dữ liệu đơn hàng.</p>
          ) : (
            <div className={styles.revenueChart}>
              {metrics.trend.map((day) => (
                <div className={styles.revenueColumn} key={day.key}>
                  <div className={styles.barTrack}>
                    <span
                      style={{
                        height: `${Math.max(
                          day.revenue ? 10 : 2,
                          (day.revenue / maxRevenue) * 100,
                        )}%`,
                      }}
                      title={`${day.orders} đơn · ${vnd(day.revenue)}`}
                    />
                  </div>
                  <b>{day.revenue ? vnd(day.revenue) : "—"}</b>
                  <small>{day.label}</small>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className={styles.dashboardCard}>
          <header>
            <div>
              <small>PHỄU CHUYỂN ĐỔI</small>
              <h2>Từ trò chuyện đến đơn hàng</h2>
            </div>
          </header>
          <div className={styles.funnel}>
            {funnel.map((item, index) => (
              <div key={item.label}>
                <span>{index + 1}</span>
                <section>
                  <div>
                    <b>{item.label}</b>
                    <strong>{item.value}</strong>
                  </div>
                  <i>
                    <em
                      style={{
                        width: `${Math.max(
                          (item.value / funnelMax) * 100,
                          item.value ? 8 : 0,
                        )}%`,
                      }}
                    />
                  </i>
                  <small>{item.detail}</small>
                </section>
              </div>
            ))}
          </div>
        </article>

        <article className={styles.dashboardCard}>
          <header>
            <div>
              <small>SẢN PHẨM</small>
              <h2>Bán chạy theo đơn đã chốt</h2>
            </div>
          </header>
          {metrics.topProducts.length === 0 ? (
            <p className={styles.dashboardEmpty}>Chưa có sản phẩm phát sinh đơn.</p>
          ) : (
            <ol className={styles.topProducts}>
              {metrics.topProducts.map((product, index) => (
                <li key={product.id}>
                  <span>{index + 1}</span>
                  <div>
                    <b>{product.name}</b>
                    <small>{vnd(product.revenue)}</small>
                  </div>
                  <strong>{product.quantity} SP</strong>
                </li>
              ))}
            </ol>
          )}
        </article>

        <article className={styles.dashboardCard}>
          <header>
            <div>
              <small>VIỆC CẦN LÀM</small>
              <h2>Ưu tiên cho người bán</h2>
            </div>
          </header>
          <div className={styles.actionList}>
            <button type="button" onClick={() => onNavigate("orders")}>
              <span className={styles.actionUrgent}>
                <ClipboardList />
              </span>
              <div>
                <b>Xác nhận {metrics.pendingOrders} đơn mới</b>
                <small>Kiểm tra tồn kho và liên hệ khách sớm</small>
              </div>
              <ArrowUpRight />
            </button>
            <button type="button" onClick={() => onNavigate("leads")}>
              <span>
                <Users />
              </span>
              <div>
                <b>Chăm sóc {metrics.unconvertedLeads} khách chưa chốt</b>
                <small>Ưu tiên khách đã để lại số điện thoại</small>
              </div>
              <ArrowUpRight />
            </button>
            <button type="button" onClick={() => onNavigate("conversations")}>
              <span>
                <MessageSquareText />
              </span>
              <div>
                <b>Xem lại hội thoại chưa chuyển đổi</b>
                <small>Tìm câu hỏi hoặc phản đối thường gặp</small>
              </div>
              <ArrowUpRight />
            </button>
          </div>
        </article>
      </section>
    </div>
  );
}

async function fetchAdminData(): Promise<Overview> {
  const [overviewResponse, ordersResponse, conversationsResponse] =
    await Promise.all([
      fetch("/api/admin/overview", { cache: "no-store" }),
      fetch("/api/orders", { cache: "no-store" }),
      fetch("/api/admin/conversations", { cache: "no-store" }),
    ]);
  const overview = (await overviewResponse.json()) as Omit<
    Overview,
    "orders" | "conversations"
  >;
  const orders = ordersResponse.ok ? await ordersResponse.json() : [];
  const transcriptPayload = await conversationsResponse.json().catch(() => ({
    conversations: [],
    error: "Không thể tải lịch sử hội thoại.",
  }));

  return {
    ...overview,
    orders: Array.isArray(orders) ? orders : [],
    conversations: Array.isArray(transcriptPayload.conversations)
      ? transcriptPayload.conversations
      : [],
    conversationError:
      typeof transcriptPayload.error === "string"
        ? transcriptPayload.error
        : null,
  };
}

export default function AdminPage() {
  const [data, setData] = useState<Overview>(emptyOverview);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<AdminProduct | null | "new">(null);
  const [viewingProduct, setViewingProduct] = useState<AdminProduct | null>(
    null,
  );
  const [viewingConversation, setViewingConversation] =
    useState<AdminConversation | null>(null);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fetchAdminData());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetchAdminData()
      .then((overview) => {
        if (active) setData(overview);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const filteredProducts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return data.products.filter((product) =>
      `${product.name} ${product.brand} ${product.category}`
        .toLowerCase()
        .includes(normalized),
    );
  }, [data.products, query]);

  const filteredConversations = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return data.conversations;
    return data.conversations.filter((conversation) =>
      [
        conversation.sessionId,
        conversation.customerName,
        conversation.customerPhone,
        conversation.lastMessage,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [data.conversations, query]);

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    let imageUrl = form.get("imageUrl") || null;
    const imageFile = form.get("imageFile");

    if (imageFile instanceof File && imageFile.size > 0) {
      const uploadForm = new FormData();
      uploadForm.set("file", imageFile);
      const upload = await fetch("/api/admin/upload", {
        method: "POST",
        body: uploadForm,
      });
      const uploadResult = await upload.json();
      if (!upload.ok) {
        setNotice(uploadResult.error || "Không thể tải ảnh.");
        return;
      }
      imageUrl = uploadResult.url;
    }

    const payload = {
      id: editing === "new" || !editing ? undefined : editing.id,
      name: form.get("name"),
      category: form.get("category"),
      brand: form.get("brand"),
      price: form.get("price"),
      monthlySold: form.get("monthlySold") || 0,
      originalPrice: form.get("originalPrice") || null,
      priceBeforePromotion: form.get("priceBeforePromotion") || null,
      discountPercent: form.get("discountPercent") || null,
      voucherDiscount: form.get("voucherDiscount") || null,
      stockQuantity: form.get("stock"),
      imageUrl,
      isActive: true,
    };
    const response = await fetch("/api/admin/products", {
      method: editing === "new" ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    setNotice(
      response.ok
        ? `Đã lưu sản phẩm ở chế độ ${result.mode}.`
        : result.error,
    );
    if (response.ok) {
      setEditing(null);
      await load();
    }
  }

  async function removeProduct(product: AdminProduct) {
    if (!window.confirm(`Xóa “${product.name}”?`)) return;
    const response = await fetch("/api/admin/products", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(product),
    });
    const result = await response.json();
    setNotice(response.ok ? "Đã xóa sản phẩm." : result.error);
    if (response.ok) await load();
  }

  async function importCsv(file: File) {
    const text = await file.text();
    const [headerLine, ...lines] = text.split(/\r?\n/).filter(Boolean);
    const headers = headerLine.split(",").map((value) => value.trim());
    const rows = lines.map((line) => {
      const values = line.split(",").map((value) => value.trim());
      return Object.fromEntries(
        headers.map((header, index) => [header, values[index] ?? ""]),
      );
    });
    const response = await fetch("/api/admin/products/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rows),
    });
    const result = await response.json();
    setNotice(
      response.ok ? `Đã nhập ${result.imported} sản phẩm.` : result.error,
    );
    if (response.ok) await load();
  }

  const title =
    tab === "dashboard"
      ? "Tổng quan kinh doanh"
      : tab === "products"
      ? "Quản lý sản phẩm"
      : tab === "conversations"
        ? "Lịch sử hội thoại"
        : tab === "leads"
          ? "Khách hàng tiềm năng"
          : "Đơn hàng đã chốt";

  return (
    <main className={styles.admin}>
      <aside className={styles.sidebar}>
        <Link href="/" className={styles.brand}>
          <span>
            <ShoppingBag />
          </span>
          <b>Marty Admin</b>
        </Link>
        <nav>
          {tabs.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setTab(item.id);
                setQuery("");
              }}
              className={tab === item.id ? styles.active : ""}
            >
              <item.icon />
              {item.label}
            </button>
          ))}
        </nav>
        <div className={styles.adminUser}>
          <span>A</span>
          <div>
            <b>Admin Demo</b>
            <small>Quản trị viên</small>
          </div>
        </div>
      </aside>

      <section className={styles.workspace}>
        <header>
          <div>
            <Bot />
            <span>AI Sales Console</span>
          </div>
          <Link href="/">Mở chatbot</Link>
        </header>

        <div className={styles.content}>
          <div className={styles.titleRow}>
            <div>
              <small>MARTY / {tab.toUpperCase()}</small>
              <h1>{title}</h1>
              <p>
                {data.mode === "supabase"
                  ? "Đang kết nối Supabase"
                  : "Chế độ demo — dữ liệu chưa được đồng bộ lên Supabase"}
              </p>
            </div>
            {tab === "products" && (
              <div>
                <Button
                  variant="outline"
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload /> Nhập CSV
                </Button>
                <input
                  ref={fileRef}
                  hidden
                  type="file"
                  accept=".csv"
                  onChange={(event) =>
                    event.target.files?.[0] &&
                    importCsv(event.target.files[0])
                  }
                />
                <Button
                  onClick={() => setEditing("new")}
                  className="bg-emerald-700 hover:bg-emerald-800"
                >
                  <Plus /> Thêm sản phẩm
                </Button>
              </div>
            )}
          </div>

          {tab !== "dashboard" && (
            <div className={styles.stats}>
              <article>
                <span>
                  <Users />
                </span>
                <div>
                  <small>Khách tiềm năng</small>
                  <b>{data.leads.length}</b>
                </div>
              </article>
              <article>
                <span>
                  <ClipboardList />
                </span>
                <div>
                  <small>Đơn đã chốt</small>
                  <b>{data.orders.length}</b>
                </div>
              </article>
              <article>
                <span>
                  <MessageSquareText />
                </span>
                <div>
                  <small>Hội thoại</small>
                  <b>{data.conversations.length}</b>
                </div>
              </article>
            </div>
          )}

          {notice && (
            <div className={styles.notice}>
              {notice}
              <button onClick={() => setNotice("")}>
                <X />
              </button>
            </div>
          )}

          {tab === "dashboard" && (
            <BusinessDashboard
              data={data}
              loading={loading}
              onNavigate={setTab}
            />
          )}

          {tab === "products" && (
            <section className={styles.panel}>
              <div className={styles.toolbar}>
                <label>
                  <Search />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Tìm kiếm sản phẩm"
                  />
                </label>
                <span>{filteredProducts.length} kết quả</span>
              </div>
              {loading ? (
                <div className={styles.loading}>Đang tải dữ liệu…</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sản phẩm</TableHead>
                      <TableHead>Danh mục</TableHead>
                      <TableHead>Giá bán</TableHead>
                      <TableHead>Khuyến mãi</TableHead>
                      <TableHead>Lượt mua/tháng</TableHead>
                      <TableHead>Tồn kho</TableHead>
                      <TableHead>Trạng thái</TableHead>
                      <TableHead>Thao tác</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProducts.slice(0, 50).map((product) => (
                      <TableRow key={product.id}>
                        <TableCell>
                          <div className={styles.productName}>
                            {product.imageUrl ? (
                              <Image
                                src={product.imageUrl}
                                alt=""
                                width={42}
                                height={42}
                                unoptimized
                              />
                            ) : (
                              <Package />
                            )}
                            <div>
                              <b>{product.name}</b>
                              <small>{product.brand}</small>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{product.category}</TableCell>
                        <TableCell>
                          <div className={styles.priceCell}>
                            <b>{vnd(productSalePrice(product))}</b>
                            {product.originalPrice && product.originalPrice > productSalePrice(product) && <del>{vnd(product.originalPrice)}</del>}
                          </div>
                        </TableCell>
                        <TableCell>
                          {product.discountPercent ? <span className={styles.promotionBadge}>-{product.discountPercent}%</span> : "—"}
                        </TableCell>
                        <TableCell>{product.monthlySold ? new Intl.NumberFormat("vi-VN").format(product.monthlySold) : "—"}</TableCell>
                        <TableCell>{product.stockQuantity}</TableCell>
                        <TableCell>
                          <span
                            className={
                              product.stockQuantity > 0
                                ? styles.available
                                : styles.soldOut
                            }
                          >
                            {product.stockQuantity > 0
                              ? "Đang bán"
                              : "Hết hàng"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className={styles.actions}>
                            <button
                              onClick={() => setViewingProduct(product)}
                              aria-label="Xem chi tiết"
                              title="Xem chi tiết"
                            >
                              <Eye />
                            </button>
                            <button
                              onClick={() => setEditing(product)}
                              aria-label="Sửa"
                              title="Sửa"
                            >
                              <Pencil />
                            </button>
                            <button
                              onClick={() => removeProduct(product)}
                              aria-label="Xóa"
                              title="Xóa"
                            >
                              <Trash2 />
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </section>
          )}

          {tab === "conversations" && (
            <section className={styles.panel}>
              {data.conversationError && (
                <div className={styles.notice}>
                  {data.conversationError}
                </div>
              )}
              <div className={styles.toolbar}>
                <label>
                  <Search />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Tìm session, khách hàng hoặc nội dung"
                  />
                </label>
                <span>{filteredConversations.length} hội thoại</span>
              </div>
              {loading ? (
                <div className={styles.loading}>Đang tải hội thoại…</div>
              ) : filteredConversations.length === 0 ? (
                <EmptyState
                  icon={<MessageSquareText />}
                  title="Chưa có hội thoại"
                  description="Mọi tin nhắn của khách hàng và Marty sẽ được lưu theo session và hiển thị tại đây."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Session</TableHead>
                      <TableHead>Khách hàng</TableHead>
                      <TableHead>Tin nhắn</TableHead>
                      <TableHead>Nội dung gần nhất</TableHead>
                      <TableHead>Cập nhật</TableHead>
                      <TableHead>Thao tác</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredConversations.map((conversation) => (
                      <TableRow key={conversation.id}>
                        <TableCell>
                          <button
                            className={styles.sessionButton}
                            onClick={() =>
                              setViewingConversation(conversation)
                            }
                          >
                            {conversation.sessionId.slice(0, 8)}…
                          </button>
                          <small className={styles.sessionStatus}>
                            {conversation.status}
                          </small>
                        </TableCell>
                        <TableCell>
                          <div className={styles.customerCell}>
                            <b>
                              {conversation.customerName || "Khách ẩn danh"}
                            </b>
                            <small>
                              {conversation.customerPhone || "Chưa có SĐT"}
                            </small>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className={styles.messageCount}>
                            {conversation.messageCount}
                          </span>
                        </TableCell>
                        <TableCell>
                          <p className={styles.lastMessage}>
                            {conversation.lastMessage || "Chưa có tin nhắn"}
                          </p>
                        </TableCell>
                        <TableCell>
                          {dateTime(conversation.updatedAt)}
                        </TableCell>
                        <TableCell>
                          <div className={styles.actions}>
                            <button
                              onClick={() =>
                                setViewingConversation(conversation)
                              }
                              aria-label="Xem toàn bộ hội thoại"
                              title="Xem toàn bộ hội thoại"
                            >
                              <Eye />
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </section>
          )}

          {tab === "leads" && (
            <section className={styles.panel}>
              {data.leads.length === 0 ? (
                <EmptyState
                  icon={<Users />}
                  title="Chưa có khách hàng tiềm năng"
                  description="Thông tin khách được chatbot thu thập sẽ xuất hiện tại đây."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Khách hàng</TableHead>
                      <TableHead>Điện thoại</TableHead>
                      <TableHead>Địa chỉ</TableHead>
                      <TableHead>Nhu cầu</TableHead>
                      <TableHead>Trạng thái</TableHead>
                      <TableHead>Ngày tạo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.leads.map((row, index) => (
                      <TableRow key={`${cell(row, "id")}-${index}`}>
                        <TableCell>{cell(row, "customer_name")}</TableCell>
                        <TableCell>{cell(row, "customer_phone")}</TableCell>
                        <TableCell className="max-w-sm whitespace-normal">
                          {cell(row, "customer_address")}
                        </TableCell>
                        <TableCell className="max-w-sm whitespace-normal">
                          {cell(row, "customer_need")}
                        </TableCell>
                        <TableCell>{cell(row, "status")}</TableCell>
                        <TableCell>{cell(row, "created_at")}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </section>
          )}

          {tab === "orders" && (
            <section className={styles.panel}>
              {data.orders.length === 0 ? (
                <EmptyState
                  icon={<ClipboardList />}
                  title="Chưa có đơn hàng"
                  description="Các đơn đã xác nhận sẽ xuất hiện tại đây."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mã đơn</TableHead>
                      <TableHead>Khách hàng</TableHead>
                      <TableHead>Điện thoại</TableHead>
                      <TableHead>Địa chỉ</TableHead>
                      <TableHead>Sản phẩm đã chốt</TableHead>
                      <TableHead>Tổng tiền</TableHead>
                      <TableHead>Trạng thái</TableHead>
                      <TableHead>Ngày tạo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.orders.map((row, index) => (
                      <TableRow key={`${cell(row, "order_id")}-${index}`}>
                        <TableCell>{cell(row, "order_id")}</TableCell>
                        <TableCell>{cell(row, "customer_name")}</TableCell>
                        <TableCell>{cell(row, "customer_phone")}</TableCell>
                        <TableCell className="max-w-sm whitespace-normal">
                          {cell(row, "customer_address")}
                        </TableCell>
                        <TableCell>
                          <OrderItemsCell order={row} />
                        </TableCell>
                        <TableCell>
                          {vnd(Number(row.total_amount || 0))}
                        </TableCell>
                        <TableCell>{cell(row, "status")}</TableCell>
                        <TableCell>{cell(row, "created_at")}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </section>
          )}
        </div>
      </section>

      <Dialog
        open={viewingConversation !== null}
        onOpenChange={(open) => !open && setViewingConversation(null)}
      >
        <DialogContent className={styles.conversationDialog}>
          <DialogHeader>
            <DialogTitle>Toàn bộ hội thoại</DialogTitle>
            <DialogDescription>
              Session {viewingConversation?.sessionId}
            </DialogDescription>
          </DialogHeader>
          {viewingConversation && (
            <>
              <div className={styles.conversationMeta}>
                <span>
                  <b>{viewingConversation.messageCount}</b> tin nhắn
                </span>
                <span>
                  Cập nhật {dateTime(viewingConversation.updatedAt)}
                </span>
                <span>{viewingConversation.status}</span>
              </div>
              <div className={styles.transcript}>
                {viewingConversation.messages.map((message) => (
                  <article
                    key={message.id}
                    className={`${styles.transcriptMessage} ${
                      message.role === "user"
                        ? styles.transcriptUser
                        : styles.transcriptAssistant
                    }`}
                  >
                    <header>
                      <b>
                        {message.role === "user"
                          ? "Khách hàng"
                          : message.role === "assistant"
                            ? "Marty"
                            : message.role}
                      </b>
                      <time>{dateTime(message.createdAt)}</time>
                    </header>
                    <p>{message.content}</p>
                  </article>
                ))}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={viewingProduct !== null}
        onOpenChange={(open) => !open && setViewingProduct(null)}
      >
        <DialogContent className={styles.productDetailDialog}>
          <DialogHeader>
            <DialogTitle>{viewingProduct?.name}</DialogTitle>
            <DialogDescription>
              Thông tin chi tiết được đồng bộ từ danh mục sản phẩm.
            </DialogDescription>
          </DialogHeader>
          {viewingProduct && (
            <div className={styles.productDetail}>
              <div className={styles.detailTop}>
                {viewingProduct.imageUrl ? (
                  <Image
                    src={viewingProduct.imageUrl}
                    alt={viewingProduct.name}
                    width={180}
                    height={180}
                    unoptimized
                  />
                ) : (
                  <span>
                    <Package />
                  </span>
                )}
                <div>
                  <b>{viewingProduct.brand}</b>
                  <div className={styles.priceCell}>
                    <strong>{vnd(productSalePrice(viewingProduct))}</strong>
                    {viewingProduct.originalPrice && viewingProduct.originalPrice > productSalePrice(viewingProduct) && <del>{vnd(viewingProduct.originalPrice)}</del>}
                    {viewingProduct.discountPercent ? <span className={styles.promotionBadge}>-{viewingProduct.discountPercent}%</span> : null}
                  </div>
                  <small>
                    {viewingProduct.category} ·{" "}
                    {viewingProduct.stockQuantity > 0
                      ? `Còn ${viewingProduct.stockQuantity} sản phẩm`
                      : "Hết hàng"}
                  </small>
                  {viewingProduct.monthlySold ? (
                    <small>Đã mua {new Intl.NumberFormat("vi-VN").format(viewingProduct.monthlySold)} lượt/tháng</small>
                  ) : null}
                </div>
              </div>
              <section>
                <h3>Mô tả sản phẩm</h3>
                <p>
                  {viewingProduct.description ||
                    "Sản phẩm này chưa có mô tả chi tiết."}
                </p>
              </section>
              {viewingProduct.descriptionSourceUrl && (
                <a
                  href={viewingProduct.descriptionSourceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ShieldCheck />
                  <span>
                    <b>Nguồn tham khảo sản phẩm</b>
                    <small>
                      {viewingProduct.descriptionConfidence != null
                        ? `Độ tin cậy ${Math.round(
                            viewingProduct.descriptionConfidence * 100,
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
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing === "new"
                ? "Thêm sản phẩm"
                : "Cập nhật sản phẩm"}
            </DialogTitle>
            <DialogDescription>
              Embedding cần được tạo lại sau khi sửa nội dung sản phẩm.
            </DialogDescription>
          </DialogHeader>
          <form className={styles.productForm} onSubmit={saveProduct}>
            <label>
              Tên sản phẩm
              <Input
                name="name"
                required
                defaultValue={
                  editing === "new" || !editing ? "" : editing.name
                }
              />
            </label>
            <div>
              <label>
                Danh mục
                <Input
                  name="category"
                  required
                  defaultValue={
                    editing === "new" || !editing
                      ? "do-uong"
                      : editing.category
                  }
                />
              </label>
              <label>
                Thương hiệu
                <Input
                  name="brand"
                  required
                  defaultValue={
                    editing === "new" || !editing ? "" : editing.brand
                  }
                />
              </label>
            </div>
            <div>
              <label>
                Giá bán
                <Input
                  name="price"
                  type="number"
                  min="0"
                  required
                  defaultValue={
                    editing === "new" || !editing ? 0 : editing.price
                  }
                />
              </label>
              <label>
                Giá gốc (trước khuyến mãi)
                <Input name="originalPrice" type="number" min="0" defaultValue={editing === "new" || !editing ? "" : editing.originalPrice ?? ""} />
              </label>
              <label>
                Phần trăm khuyến mãi (%)
                <Input name="discountPercent" type="number" min="0" max="100" step="0.01" defaultValue={editing === "new" || !editing ? "" : editing.discountPercent ?? ""} />
              </label>
              <label>
                Số lượt mua/tháng
                <Input name="monthlySold" type="number" min="0" step="1" defaultValue={editing === "new" || !editing ? 0 : editing.monthlySold ?? 0} />
              </label>
              <label>
                Tồn kho
                <Input
                  name="stock"
                  type="number"
                  min="0"
                  required
                  defaultValue={
                    editing === "new" || !editing
                      ? 0
                      : editing.stockQuantity
                  }
                />
              </label>
            </div>
            <label>
              URL hình ảnh
              <Input
                name="imageUrl"
                type="url"
                defaultValue={
                  editing === "new" || !editing
                    ? ""
                    : editing.imageUrl ?? ""
                }
              />
            </label>
            <label>
              Hoặc tải ảnh lên Supabase
              <Input
                name="imageFile"
                type="file"
                accept="image/jpeg,image/png,image/webp"
              />
            </label>
            <Button className="bg-emerald-700 hover:bg-emerald-800">
              Lưu sản phẩm
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className={styles.empty}>
      <span>{icon}</span>
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  );
}
