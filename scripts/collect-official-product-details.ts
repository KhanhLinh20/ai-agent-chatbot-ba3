import { createClient } from "@supabase/supabase-js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import fallbackData from "../src/lib/shopee_fallback.json";

type Product = (typeof fallbackData.products)[number];

type OfficialDocument = {
  url: string;
  title: string;
  description: string;
  text: string;
  sourceType: "official_product" | "official_brand";
};

type EnrichmentRow = {
  item_id: string;
  description: string | null;
  description_source_url: string | null;
  description_source_type: "official_product" | "official_brand" | null;
  description_confidence: number | null;
  description_collected_at: string;
  description_verified: boolean;
};

type Source = {
  name: string;
  brands: string[];
  sitemap?: string;
  seeds?: string[];
  productUrlPattern?: RegExp;
  fallbackUrl: string;
  fallbackDescription: string;
  maxPages: number;
};

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
});

const sources: Source[] = [
  {
    name: "Nestlé Việt Nam",
    brands: [
      "milo",
      "nescafe",
      "nestea",
      "maggi",
      "nestle",
      "nutren junior",
      "peptamen",
      "boost",
      "vital proteins",
    ],
    sitemap: "https://www.nestle.com.vn/sitemap.xml",
    seeds: [
      "https://www.milo.com.vn/",
      "https://www.nescafe.com/vn/ca-phe-cua-chung-toi",
      "https://www.maggi.com.vn/",
    ],
    productUrlPattern:
      /san-pham|product|milo|nescafe|nestea|maggi|nutren|peptamen|boost|vital-proteins/i,
    fallbackUrl: "https://www.nestle.com.vn/vi/brands",
    fallbackDescription:
      "Sản phẩm thuộc danh mục thương hiệu chính thức của Nestlé Việt Nam. Quy cách và phiên bản cụ thể được xác định theo tên sản phẩm.",
    maxPages: 180,
  },
  {
    name: "Nescafé Việt Nam",
    brands: ["nescafe"],
    sitemap: "https://www.nescafe.com/vn/sitemap.xml",
    productUrlPattern: /ca-phe-cua-chung-toi|san-pham|product|3in1|cafe-viet|gold|red-cup/i,
    fallbackUrl: "https://www.nescafe.com/vn/ca-phe-cua-chung-toi",
    fallbackDescription:
      "Sản phẩm cà phê thuộc danh mục NESCAFÉ Việt Nam; hương vị và quy cách được xác định theo tên phiên bản.",
    maxPages: 100,
  },
  {
    name: "Mondelez Kinh Đô",
    brands: ["afc", "oreo", "slide", "lu", "cosy", "kinh do"],
    sitemap: "https://www.mondelezinternational.com/sitemap.xml",
    seeds: ["https://www.mondelezinternational.com/Our-Brands/"],
    productUrlPattern: /brand|oreo|lu|kinh-do|cosy|afc/i,
    fallbackUrl: "https://www.mondelezinternational.com/Our-Brands/",
    fallbackDescription:
      "Sản phẩm thuộc danh mục thương hiệu của Mondelez; loại bánh, hương vị và quy cách được xác định theo tên sản phẩm.",
    maxPages: 80,
  },
  {
    name: "Mars",
    brands: [
      "cool air",
      "snickers",
      "doublemint",
      "m&m's",
      "skittles",
    ],
    sitemap: "https://www.mars.com/sitemap.xml",
    seeds: ["https://www.mars.com/our-brands"],
    productUrlPattern: /brand|snickers|doublemint|m-m|skittles|cool-air/i,
    fallbackUrl: "https://www.mars.com/our-brands",
    fallbackDescription:
      "Sản phẩm thuộc danh mục thương hiệu của Mars Wrigley; hương vị, loại kẹo và quy cách được xác định theo tên sản phẩm.",
    maxPages: 80,
  },
  {
    name: "Richy",
    brands: ["richy", "crown"],
    sitemap: "https://richy.com.vn/sitemap.xml",
    seeds: [
      "https://richy.com.vn/banh-kho.html",
      "https://richy.com.vn/banh-tuoi.html",
      "https://richy.com.vn/hang-nhap-khau.html",
    ],
    productUrlPattern: /san-pham|banh-|keo-|karo|jinju|oatmeal|kenju|peppie|wismo|fresta|festa/i,
    fallbackUrl: "https://richy.com.vn/san-pham.html",
    fallbackDescription:
      "Sản phẩm thuộc danh mục bánh kẹo của Richy; dòng bánh, hương vị và quy cách cụ thể được xác định theo tên sản phẩm.",
    maxPages: 150,
  },
  {
    name: "Bibica",
    brands: ["bibica"],
    sitemap: "https://www.bibica.com.vn/sitemap.xml",
    seeds: [
      "https://www.bibica.com.vn/san-pham-bibica",
      "https://www.bibica.com.vn/san-pham-moi",
    ],
    productUrlPattern:
      /san-pham|banh|keo|hura|goody|quasure|zoo|ahha|migita|cheery|gooka|olive/i,
    fallbackUrl: "https://www.bibica.com.vn/san-pham-bibica",
    fallbackDescription:
      "Sản phẩm thuộc danh mục bánh kẹo chính thức của Bibica; dòng sản phẩm, hương vị và quy cách được xác định theo tên.",
    maxPages: 180,
  },
  {
    name: "Orion Vina",
    brands: ["orion"],
    seeds: ["https://orion.vn/", "https://orion.vn/san-pham/"],
    productUrlPattern:
      /san-pham|chocopie|custas|ostar|swing|marine|cest-bon|tonnies|toonies|miz|an-/i,
    fallbackUrl: "https://orion.vn/",
    fallbackDescription:
      "Sản phẩm thuộc danh mục bánh và snack của Orion Vina; dòng sản phẩm, hương vị và quy cách được xác định theo tên.",
    maxPages: 100,
  },
  {
    name: "Perfetti Van Melle",
    brands: ["alpenliebe", "mentos", "chupa chups", "big babol"],
    seeds: [
      "https://www.perfettivanmelle.com/internal/vietnam/index.html",
      "https://www.perfettivanmelle.com/our-brands/overview/",
    ],
    productUrlPattern: /brand|mentos|chupa|alpenliebe|big-babol|vietnam/i,
    fallbackUrl:
      "https://www.perfettivanmelle.com/internal/vietnam/index.html",
    fallbackDescription:
      "Sản phẩm thuộc danh mục thương hiệu của Perfetti Van Melle Việt Nam; loại kẹo, hương vị và quy cách được xác định theo tên sản phẩm.",
    maxPages: 60,
  },
  {
    name: "Hải Hà",
    brands: ["haihaco", "chipchip"],
    seeds: [
      "https://www.haihaco.com.vn/vi/",
      "https://www.haihaco.com.vn/vi/nhan-hang-banh",
      "https://www.haihaco.com.vn/vi/nhan-hang-keo",
    ],
    productUrlPattern: /san-pham|nhan-hang|banh|keo|gabi|sokiss|longpie|kami|coolte/i,
    fallbackUrl: "https://www.haihaco.com.vn/vi/",
    fallbackDescription:
      "Sản phẩm thuộc danh mục bánh kẹo chính thức của Hải Hà; loại sản phẩm, hương vị và quy cách được xác định theo tên.",
    maxPages: 100,
  },
];

const stopWords = new Set(
  "combo hop bich goi chai thung loc tui hu cay thanh vien phien ban chinh hang moi live qua tang khong ban san pham thuong hieu gram gam kg ml x cai chiec giao nhanh don mua tong bao bi san hang ngay han hsd".split(
    " ",
  ),
);

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/đ/g, "d")
    .toLowerCase()
    .replace(/&amp;/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokens(value: string) {
  return new Set(
    normalize(value)
      .split(" ")
      .filter((token) => token.length >= 3 && !stopWords.has(token)),
  );
}

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCharCode(Number.parseInt(code, 16)),
    )
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function cleanText(value: string) {
  return decodeHtml(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function meta(html: string, key: string) {
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:name|property)=["']${key}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${key}["'][^>]*>`,
      "i",
    ),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return cleanText(match[1]);
  }
  return "";
}

function pageFromHtml(url: string, html: string): OfficialDocument | null {
  const title =
    meta(html, "og:title") || cleanText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  const description =
    meta(html, "description") || meta(html, "og:description");
  const text = cleanText(html).slice(0, 8_000);
  if (!title || text.length < 80) return null;
  return {
    url,
    title,
    description: description || text.slice(0, 500),
    text,
    sourceType: "official_product",
  };
}

async function fetchText(url: string, timeoutMs = 12_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; ProductCatalogResearch/1.0; +local-project)",
        accept: "text/html,application/xhtml+xml,application/xml",
      },
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function xmlUrls(xml: string) {
  return [...xml.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)].map((match) =>
    decodeHtml(match[1].trim()),
  );
}

async function sitemapUrls(root: string, depth = 0): Promise<string[]> {
  const xml = await fetchText(root);
  const urls = xmlUrls(xml);
  if (depth >= 2) return urls.filter((url) => !url.endsWith(".xml"));
  const nested = urls.filter((url) => url.endsWith(".xml"));
  const pages = urls.filter((url) => !url.endsWith(".xml"));
  const nestedResults = await Promise.allSettled(
    nested.slice(0, 20).map((sitemap) => sitemapUrls(sitemap, depth + 1)),
  );
  for (const result of nestedResults) {
    if (result.status === "fulfilled") pages.push(...result.value);
  }
  return pages;
}

function linksFromHtml(baseUrl: string, html: string) {
  const base = new URL(baseUrl);
  const links = new Set<string>();
  for (const match of html.matchAll(/href=["']([^"'#]+)["']/gi)) {
    try {
      const url = new URL(decodeHtml(match[1]), base);
      if (url.origin === base.origin && /^https?:$/.test(url.protocol)) {
        url.hash = "";
        links.add(url.toString());
      }
    } catch {
      // Ignore malformed navigation links.
    }
  }
  return [...links];
}

async function discoverSeedLinks(source: Source) {
  const discovered = new Set<string>(source.seeds ?? []);
  const results = await Promise.allSettled(
    (source.seeds ?? []).map(async (seed) => ({
      seed,
      html: await fetchText(seed),
    })),
  );
  for (const result of results) {
    if (result.status === "fulfilled") {
      for (const link of linksFromHtml(result.value.seed, result.value.html)) {
        if (source.productUrlPattern?.test(link)) discovered.add(link);
      }
    }
  }
  return [...discovered];
}

async function collectDocuments(source: Source) {
  console.log(`[${source.name}] discovering official pages`);
  const urls = new Set<string>(await discoverSeedLinks(source));
  if (source.sitemap) {
    try {
      for (const url of await sitemapUrls(source.sitemap)) {
        if (source.productUrlPattern?.test(url)) urls.add(url);
      }
    } catch (error) {
      console.warn(`[${source.name}] sitemap unavailable: ${String(error)}`);
    }
  }

  const candidates = [...urls]
    .filter(
      (url) =>
        !/danh-sach|the-le|khuyen-mai|tuyen-dung|privacy|chinh-sach|lien-he/i.test(
          url,
        ),
    )
    .slice(0, source.maxPages);
  const documents: OfficialDocument[] = [];
  const concurrency = 5;

  for (let offset = 0; offset < candidates.length; offset += concurrency) {
    const batch = candidates.slice(offset, offset + concurrency);
    const results = await Promise.allSettled(
      batch.map(async (url) => pageFromHtml(url, await fetchText(url))),
    );
    for (const result of results) {
      if (result.status === "fulfilled" && result.value) {
        documents.push(result.value);
      }
    }
    if (offset % 25 === 0) {
      console.log(
        `[${source.name}] ${Math.min(offset + concurrency, candidates.length)}/${candidates.length}`,
      );
    }
  }

  documents.push({
    url: source.fallbackUrl,
    title: source.name,
    description: source.fallbackDescription,
    text: source.fallbackDescription,
    sourceType: "official_brand",
  });
  return documents;
}

function sourceForProduct(product: Product) {
  const brand = normalize(product.brand || product.product_name);
  const brandSource = sources.find((source) =>
    source.brands.some((candidate) => brand.includes(normalize(candidate))),
  );
  if (brandSource) return brandSource;

  const sourceNameByShopId: Record<string, string> = {
    "108166524": "Nestlé Việt Nam",
    "1145316676": "Nestlé Việt Nam",
    "140360136": "Mondelez Kinh Đô",
    "1546895026": "Mars",
    "173513432": "Richy",
    "213989179": "Bibica",
    "289646907": "Orion Vina",
    "430972539": "Perfetti Van Melle",
    "438905996": "Richy",
    "464391416": "Hải Hà",
  };
  const sourceName = sourceNameByShopId[String(product.shop_id)];
  return sources.find((source) => source.name === sourceName);
}

function documentScore(product: Product, document: OfficialDocument) {
  if (document.sourceType === "official_brand") return 0.16;
  const normalizedProduct = normalize(product.product_name);
  const normalizedDocumentIdentity = normalize(
    `${new URL(document.url).pathname} ${document.title}`,
  );
  const familyRules: Array<[RegExp, RegExp]> = [
    [/\byegam\b/, /\byegam\b/],
    [/\bgoute\b/, /\bgoute\b/],
    [/\bchocopie\b/, /\bchocopie\b/],
    [/\bcustas\b/, /\bcustas\b/],
    [/\bostar\b|\bo star\b/, /\bostar\b|\bo star\b/],
    [/\bswing\b/, /\bswing\b/],
    [/\bmarine boy\b/, /\bmarine boy\b/],
    [/\bcest bon\b/, /\bcest bon\b/],
    [/\btoonies\b|\btonnies\b/, /\btoonies\b|\btonnies\b/],
    [/\bkaro\b/, /\bkaro\b/],
    [/\bjinju\b/, /\bjinju\b|\bbanh gao\b/],
    [/\boatmeal\b|\byen mach\b/, /\boatmeal\b|\byen mach\b/],
    [/\bjamy\b/, /\bjamy\b/],
    [/\bhura\b/, /\bhura\b/],
    [/\bquasure\b/, /\bquasure\b/],
    [/\bzoo\b/, /\bzoo\b/],
    [/\bcheery\b/, /\bcheery\b/],
    [/\bmigita\b/, /\bmigita\b/],
    [/\bkami\b/, /\bkami\b/],
    [/\bgabi\b/, /\bgabi\b/],
    [/\bsokiss\b/, /\bsokiss\b/],
    [/\blongpie\b/, /\blongpie\b/],
  ];
  const familyRule = familyRules.find(([productPattern]) =>
    productPattern.test(normalizedProduct),
  );
  if (familyRule && !familyRule[1].test(normalizedDocumentIdentity)) return 0;
  if (
    /banh-cha-bong-karo/.test(document.url) &&
    !/(cha bong|pho mai|soi ga|trung tuoi|karo gau)/.test(normalizedProduct)
  ) {
    return 0;
  }
  const productTokens = tokens(`${product.brand ?? ""} ${product.product_name}`);
  const urlTokens = tokens(new URL(document.url).pathname);
  const genericUrlTokens = new Set([
    "banh",
    "keo",
    "san",
    "pham",
    "thong",
    "tin",
    "orion",
    "bibica",
    "richy",
    "haihaco",
    "mars",
    "mondelez",
    "chinh",
    "hang",
    "gioi",
    "thieu",
    "mat",
    "thuong",
    "hieu",
    "nuong",
  ]);
  const distinctiveUrlMatches = [...urlTokens].filter(
    (token) => !genericUrlTokens.has(token) && productTokens.has(token),
  );
  const categoryPageMatch =
    (/banh-gao/.test(document.url) && /banh gao|jinju/.test(normalizedProduct)) ||
    (/banh-yen-mach/.test(document.url) &&
      /yen mach|oatmeal/.test(normalizedProduct));
  if (!distinctiveUrlMatches.length && !categoryPageMatch) return 0;
  const titleTokens = tokens(document.title);
  const pageTokens = tokens(`${document.title} ${document.description}`);
  if (!productTokens.size) return 0;

  let titleMatches = 0;
  let pageMatches = 0;
  for (const token of productTokens) {
    if (titleTokens.has(token)) titleMatches += 1;
    if (pageTokens.has(token)) pageMatches += 1;
  }
  return (
    (titleMatches / productTokens.size) * 0.72 +
    (pageMatches / productTokens.size) * 0.28
  );
}

function compactDescription(product: Product, document: OfficialDocument) {
  let sourceSummary = document.description
    .replace(/\s+/g, " ")
    .replace(/\s*[\-|–]\s*(Nestlé|Bibica|Richy|Orion).*$/i, "")
    .trim()
    .slice(0, 650);
  if (document.sourceType === "official_product") {
    const titleTokens = tokens(document.title);
    const descriptionTokens = tokens(sourceSummary);
    const relevantTitleTokens = [...titleTokens].filter(
      (token) => !["official", "website", "vietnam"].includes(token),
    );
    const overlap = relevantTitleTokens.filter((token) =>
      descriptionTokens.has(token),
    ).length;
    if (
      relevantTitleTokens.length > 2 &&
      overlap / relevantTitleTokens.length < 0.45
    ) {
      sourceSummary = `Trang chính hãng xác nhận sản phẩm thuộc dòng ${document.title}.`;
    }
  }
  return `${product.product_name}. ${sourceSummary}`.slice(0, 1_000);
}

async function syncToSupabase(enrichment: EnrichmentRow[]) {
  const env = envSchema.parse(process.env);
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    console.log("Supabase environment is absent; generated local enrichment only.");
    return;
  }

  const supabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const batchSize = 20;
  for (let offset = 0; offset < enrichment.length; offset += batchSize) {
    const batch = enrichment.slice(offset, offset + batchSize);
    const results = await Promise.all(
      batch.map(async ({ item_id, ...fields }) => {
        const { error } = await supabase
          .from("products")
          .update(fields)
          .eq("item_id", item_id);
        return error;
      }),
    );
    const error = results.find(Boolean);
    if (error) {
      throw new Error(`Supabase update failed. ${error.message}`);
    }
    console.log(
      `Updated ${Math.min(offset + batchSize, enrichment.length)}/${enrichment.length}`,
    );
  }
}

async function main() {
  if (process.argv.includes("--sync-only")) {
    const enrichment = JSON.parse(
      await readFile("data/official-product-enrichment.json", "utf8"),
    ) as EnrichmentRow[];
    await syncToSupabase(enrichment);
    return;
  }

  const documentsBySource = new Map<string, OfficialDocument[]>();
  for (const source of sources) {
    const documents = await collectDocuments(source);
    documentsBySource.set(source.name, documents);
    console.log(`[${source.name}] collected ${documents.length} official pages`);
  }

  const collectedAt = new Date().toISOString();
  const enrichment: EnrichmentRow[] = fallbackData.products.map((product) => {
    const source = sourceForProduct(product);
    if (!source) {
      return {
        item_id: String(product.item_id),
        description: null,
        description_source_url: null,
        description_source_type: null,
        description_confidence: null,
        description_collected_at: collectedAt,
        description_verified: false,
      };
    }

    const documents = documentsBySource.get(source.name) ?? [];
    const ranked = documents
      .map((document) => ({
        document,
        score: documentScore(product, document),
      }))
      .sort((a, b) => b.score - a.score);
    const selected =
      ranked.find(
        ({ document, score }) =>
          document.sourceType === "official_product" && score >= 0.32,
      ) ?? ranked.find(({ document }) => document.sourceType === "official_brand");
    if (!selected) throw new Error(`No source document for ${source.name}`);

    const isProductMatch = selected.document.sourceType === "official_product";
    return {
      item_id: String(product.item_id),
      description: compactDescription(product, selected.document),
      description_source_url: selected.document.url,
      description_source_type: selected.document.sourceType,
      description_confidence: Number(
        (isProductMatch
          ? Math.min(0.96, 0.58 + selected.score * 0.4)
          : 0.45
        ).toFixed(3),
      ),
      description_collected_at: collectedAt,
      description_verified: false,
    };
  });

  await mkdir("data", { recursive: true });
  await writeFile(
    "data/official-product-enrichment.json",
    `${JSON.stringify(enrichment, null, 2)}\n`,
    "utf8",
  );

  const stats = enrichment.reduce<Record<string, number>>((accumulator, row) => {
    const key = row.description_source_type ?? "unmatched";
    accumulator[key] = (accumulator[key] ?? 0) + 1;
    return accumulator;
  }, {});
  console.log(JSON.stringify({ total: enrichment.length, ...stats }));

  await syncToSupabase(enrichment);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
