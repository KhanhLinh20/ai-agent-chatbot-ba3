import { Client } from "pg";
import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  DB_PASSWORD: z.string().min(1),
  SUPABASE_DB_HOST: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_DESCRIPTION_MODEL: z.string().min(1).optional(),
});

const productSchema = z.object({
  item_id: z.string(),
  product_name: z.string().min(1),
  brand: z.string().nullable(),
});

const generatedDescriptionSchema = z.object({
  itemId: z.string().min(1),
  description: z.string().min(20).max(1_200),
});

const responseSchema = z.object({
  descriptions: z.array(z.string().min(20).max(1_200)).min(1).max(20),
});

type Product = z.infer<typeof productSchema>;
type GeneratedDescription = z.infer<typeof generatedDescriptionSchema>;

const GENERATION_CONCURRENCY = 5;
const DATABASE_BATCH_SIZE = 100;
const GENERATION_VERSION = "creative-gpt-4.1-mini-v2-single";

function argumentValue(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(
    prefix.length,
  );
}

function dryRunLimit() {
  const raw = argumentValue("limit");
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 668) {
    throw new Error("--limit must be an integer from 1 to 668.");
  }
  if (!process.argv.includes("--dry-run")) {
    throw new Error("--limit is only allowed together with --dry-run.");
  }
  return value;
}

async function generateBatch(
  apiKey: string,
  model: string,
  products: Product[],
) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            temperature: 0.7,
            max_tokens: 6_000,
            messages: [
              {
                role: "system",
                content: [
                  "Bạn là copywriter thương mại điện tử chuyên ngành FMCG tại Việt Nam.",
                  "Hãy viết mô tả sản phẩm tự nhiên, giàu nhịp điệu và thân thiện như một nhân viên bán hàng am hiểu sản phẩm.",
                  "Mỗi mô tả dài khoảng 45-75 từ, gồm 3-4 câu, không dùng Markdown.",
                  "Mở đầu linh hoạt; tránh lặp nguyên xi toàn bộ tên sản phẩm và tránh văn mẫu kiểu 'Sản phẩm thuộc nhóm...'.",
                  "Có thể sáng tạo cách diễn đạt, bối cảnh sử dụng hoặc cách lựa chọn, nhưng mọi dữ kiện cụ thể chỉ được lấy từ productName và brand.",
                  "Không tự đặt ra thành phần, kết cấu, mùi thơm, chứng nhận, xuất xứ, công dụng sức khỏe hoặc năng lượng, đối tượng trẻ em, hương vị không có trong tên, dung tích, số lượng, giá, khuyến mãi hoặc cam kết chất lượng.",
                  "Không đổi loại sản phẩm: bánh trứng không được gọi thành bánh mì, kẹo không được gọi thành đồ uống, và tương tự.",
                  "Nếu tên liệt kê nhiều phiên bản hoặc quy cách, hãy diễn đạt là 'có lựa chọn ... hoặc ...'; không gọi là bộ/bộ sưu tập, không dùng từ 'gồm/cùng' và không cộng số lượng, trừ khi tên ghi rõ combo hoặc bộ.",
                  "Không nhắc rằng nội dung được AI tạo, không nói 'theo tên sản phẩm', không dùng câu cảnh báo giống nhau cho mọi sản phẩm.",
                  "Nếu tên chứa nội dung khuyến mãi trong ngoặc vuông như quà tặng, voucher, giao nhanh hoặc giảm giá thì bỏ qua nội dung đó.",
                  "Ưu tiên làm rõ: đây là sản phẩm gì, điểm đáng chú ý có thật trong tên, quy cách nếu có, và kiểu nhu cầu mua sắm phù hợp.",
                  "Trả về đúng một mô tả cho mỗi sản phẩm và giữ nguyên thứ tự của mảng đầu vào.",
                  "Mọi sản phẩm đầu vào đều là bản ghi hợp lệ, kể cả quà tặng, phụ kiện hoặc dinh dưỡng y học. Luôn viết mô tả cho đúng món hàng; tuyệt đối không từ chối và không nói thiếu thông tin.",
                ].join("\n"),
              },
              {
                role: "user",
                content: JSON.stringify({ products }),
              },
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "creative_product_descriptions",
                strict: true,
                schema: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    descriptions: {
                      type: "array",
                      minItems: products.length,
                      maxItems: products.length,
                      items: { type: "string" },
                    },
                  },
                  required: ["descriptions"],
                },
              },
            },
          }),
          signal: AbortSignal.timeout(90_000),
        },
      );

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `OpenAI request failed (${response.status}): ${errorBody.slice(0, 300)}`,
        );
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const parsed = responseSchema.parse(
        JSON.parse(payload.choices?.[0]?.message?.content ?? "{}"),
      );
      if (parsed.descriptions.length !== products.length) {
        throw new Error("OpenAI response did not preserve the batch length.");
      }
      if (
        parsed.descriptions.some((description) =>
          /không (?:có|tìm thấy|thuộc|thể) .*mô tả|không được mô tả/i.test(
            description,
          ),
        )
      ) {
        throw new Error("OpenAI returned a refusal instead of a description.");
      }
      return products.map((product, index) =>
        generatedDescriptionSchema.parse({
          itemId: product.item_id,
          description: parsed.descriptions[index],
        }),
      );
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1_500));
      }
    }
  }

  throw lastError;
}

async function main() {
  const env = envSchema.parse(process.env);
  const model = env.OPENAI_DESCRIPTION_MODEL ?? "gpt-4.1-mini";
  const limit = dryRunLimit();
  const projectRef = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
  const client = new Client({
    host: env.SUPABASE_DB_HOST ?? "aws-1-ap-south-1.pooler.supabase.com",
    port: 5432,
    user: `postgres.${projectRef}`,
    password: env.DB_PASSWORD,
    database: "postgres",
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  try {
    const result = await client.query(
      `
        select item_id::text, product_name, brand
        from public.products
        order by item_id
        ${limit === null ? "" : "limit $1"}
      `,
      limit === null ? [] : [limit],
    );
    const products = z.array(productSchema).parse(result.rows);
    const dryRun = process.argv.includes("--dry-run");
    const stagedResult = dryRun
      ? { rows: [] }
      : await client.query(
          `
            select item_id as "itemId", description
            from public.product_description_drafts
            where generation_version = $1
          `,
          [GENERATION_VERSION],
        );
    const generated = z
      .array(generatedDescriptionSchema)
      .parse(stagedResult.rows) as GeneratedDescription[];
    const stagedIds = new Set(generated.map((item) => item.itemId));
    const pendingProducts = products.filter(
      (product) => !stagedIds.has(product.item_id),
    );

    if (generated.length) {
      console.log(
        `Resuming from staged descriptions: ${generated.length}/${products.length}`,
      );
    }

    for (
      let offset = 0;
      offset < pendingProducts.length;
      offset += GENERATION_CONCURRENCY
    ) {
      const group = pendingProducts.slice(
        offset,
        offset + GENERATION_CONCURRENCY,
      );
      const batchDescriptions = (
        await Promise.all(
          group.map((product) =>
            generateBatch(env.OPENAI_API_KEY, model, [product]),
          ),
        )
      ).flat();
      generated.push(...batchDescriptions);

      if (!dryRun) {
        await client.query(
          `
            insert into public.product_description_drafts (
              generation_version,
              item_id,
              description
            )
            select $1, generated.item_id, generated.description
            from unnest($2::text[], $3::text[]) as generated(item_id, description)
            on conflict (generation_version, item_id)
            do update set
              description = excluded.description,
              created_at = now()
          `,
          [
            GENERATION_VERSION,
            batchDescriptions.map((item) => item.itemId),
            batchDescriptions.map((item) => item.description),
          ],
        );
      }
      console.log(
        `Generated creative descriptions: ${generated.length}/${products.length}`,
      );
    }

    console.log(
      JSON.stringify(
        generated.slice(0, 5).map(({ itemId, description }) => ({
          itemId,
          description,
        })),
        null,
        2,
      ),
    );

    if (dryRun) {
      console.log("Dry run completed. No database rows were changed.");
      return;
    }

    if (generated.length !== products.length) {
      throw new Error(
        `Cannot publish an incomplete generation (${generated.length}/${products.length}).`,
      );
    }

    await client.query("begin");
    for (
      let offset = 0;
      offset < generated.length;
      offset += DATABASE_BATCH_SIZE
    ) {
      const batch = generated.slice(offset, offset + DATABASE_BATCH_SIZE);
      await client.query(
        `
          with generated(item_id, description) as (
            select *
            from unnest($1::text[], $2::text[])
          )
          update public.products as product
          set
            description = generated.description,
            description_source_url = null,
            description_source_type = 'generated_from_name',
            description_confidence = null,
            description_collected_at = now(),
            description_verified = false,
            description_generated_at = now(),
            description_generation_version = $3,
            embedding = null,
            embedding_updated_at = null
          from generated
          where product.item_id = generated.item_id
        `,
        [
          batch.map((item) => item.itemId),
          batch.map((item) => item.description),
          GENERATION_VERSION,
        ],
      );
    }
    await client.query("commit");
    console.log(
      `Overwrote creative descriptions and invalidated embeddings: ${generated.length}`,
    );
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
