import { NextResponse } from "next/server";
import { z } from "zod";
import {
  analyzeJourney,
  journeyEventTypes,
  type JourneyEvent,
} from "@/features/journey/engine";
import { createClient } from "@/lib/supabase/server";

const eventSchema = z.object({
  type: z.enum(journeyEventTypes),
  occurredAt: z.string().datetime(),
  productId: z.string().max(120).optional(),
  productName: z.string().max(500).optional(),
  category: z.string().max(100).optional(),
  query: z.string().max(1_000).optional(),
  metadata: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
    .optional(),
});

const requestSchema = z.object({
  sessionId: z.string().uuid(),
  event: eventSchema,
  events: z.array(eventSchema).max(30),
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Sự kiện hành trình chưa hợp lệ." },
      { status: 400 },
    );
  }

  const { sessionId, event, events } = parsed.data;
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("customer_journey_events").insert({
      session_id: sessionId,
      event_type: event.type,
      product_id: event.productId ?? null,
      product_name: event.productName ?? null,
      category: event.category ?? null,
      search_query: event.query ?? null,
      metadata: event.metadata ?? {},
      occurred_at: event.occurredAt,
    });
    if (error) {
      console.warn("Journey event persistence unavailable.", error.message);
    }
  } catch (error) {
    console.warn(
      "Journey event persistence unavailable.",
      error instanceof Error ? error.message : "Unknown error",
    );
  }

  return NextResponse.json({
    insight: analyzeJourney(events as JourneyEvent[]),
  });
}

