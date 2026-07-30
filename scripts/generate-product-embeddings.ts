import { Client } from "pg";
import { z } from "zod";

import { buildLegacyProductEmbeddingText } from "../src/features/catalog/product-text";
import { OpenAIEmbeddingProvider } from "../src/lib/ai/openai-embedding-provider";

const scriptEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  DB_PASSWORD: z.string().min(1),
  SUPABASE_DB_HOST: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_EMBEDDING_MODEL: z.string().min(1).optional(),
});

const productSchema = z.object({
  item_id: z.union([z.number(), z.string()]),
  product_name: z.string(),
  brand: z.string().nullable(),
  description: z.string().nullable(),
});

async function main() {
  const env = scriptEnvSchema.parse(process.env);
  const projectRef = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
  const client = new Client({
    host: env.SUPABASE_DB_HOST ?? "aws-1-ap-south-1.pooler.supabase.com",
    port: 5432,
    user: `postgres.${projectRef}`,
    password: env.DB_PASSWORD,
    database: "postgres",
    ssl: { rejectUnauthorized: false },
  });
  const embeddings = new OpenAIEmbeddingProvider(
    env.OPENAI_API_KEY,
    env.OPENAI_EMBEDDING_MODEL,
  );
  let processed = 0;

  await client.connect();
  try {
    while (true) {
      const result = await client.query(
        `
          select item_id, product_name, brand, description
          from public.products
          where embedding is null
          order by item_id
          limit 50
        `,
      );
      const products = z.array(productSchema).parse(result.rows);
      if (!products.length) break;

      const vectors = await embeddings.embedMany(
        products.map(buildLegacyProductEmbeddingText),
      );

      await client.query(
        `
          with generated(item_id, embedding) as (
            select *
            from unnest($1::text[], $2::text[])
          )
          update public.products as product
          set
            embedding = generated.embedding::extensions.vector,
            embedding_updated_at = now()
          from generated
          where product.item_id = generated.item_id
        `,
        [
          products.map((product) => String(product.item_id)),
          vectors.map((vector) => JSON.stringify(vector)),
        ],
      );

      processed += products.length;
      console.log(`Generated embeddings: ${processed}`);
    }
  } finally {
    await client.end();
  }

  console.log(`Done. Total products updated: ${processed}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
