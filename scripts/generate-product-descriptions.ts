import { Client } from "pg";
import { z } from "zod";

import {
  generateProductDescription,
  PRODUCT_DESCRIPTION_GENERATION_VERSION,
} from "../src/features/catalog/generated-description";

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  DB_PASSWORD: z.string().min(1),
  SUPABASE_DB_HOST: z.string().min(1).optional(),
});

const productSchema = z.object({
  item_id: z.string(),
  product_name: z.string().min(1),
  brand: z.string().nullable(),
});

const BATCH_SIZE = 100;

function isDryRun() {
  return process.argv.includes("--dry-run");
}

async function main() {
  const env = envSchema.parse(process.env);
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
      "select item_id::text, product_name, brand from public.products order by item_id",
    );
    const products = z.array(productSchema).parse(result.rows);
    const generated = products.map((product) => ({
      ...product,
      description: generateProductDescription({
        productName: product.product_name,
        brand: product.brand,
      }),
    }));

    console.log(`Prepared descriptions: ${generated.length}`);
    console.log(
      JSON.stringify(
        generated.slice(0, 3).map(({ item_id, description }) => ({
          item_id,
          description,
        })),
        null,
        2,
      ),
    );

    if (isDryRun()) {
      console.log("Dry run completed. No database rows were changed.");
      return;
    }

    await client.query("begin");
    for (let offset = 0; offset < generated.length; offset += BATCH_SIZE) {
      const batch = generated.slice(offset, offset + BATCH_SIZE);
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
          batch.map((product) => product.item_id),
          batch.map((product) => product.description),
          PRODUCT_DESCRIPTION_GENERATION_VERSION,
        ],
      );
    }
    await client.query("commit");
    console.log(
      `Overwrote descriptions and invalidated embeddings: ${generated.length}`,
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
