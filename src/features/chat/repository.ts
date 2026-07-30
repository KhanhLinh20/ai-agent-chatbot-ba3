import { createClient } from "@/lib/supabase/server";
import type {
  ChatHistoryItem,
  ChatResponse,
  LeadInput,
} from "@/features/chat/schemas";
import {
  consultationSessionStateSchema,
  emptySessionState,
  type ConsultationSessionState,
} from "@/features/chat/session-state";

type ConversationRecord = { id: number };

async function getConversationId(sessionId: string) {
  const supabase = await createClient();
  const existing = await supabase
    .from("conversations")
    .select("id")
    .eq("session_id", sessionId)
    .maybeSingle();

  if (existing.data) return (existing.data as ConversationRecord).id;

  const created = await supabase
    .from("conversations")
    .insert({ session_id: sessionId })
    .select("id")
    .single();
  if (created.error) throw created.error;
  return (created.data as ConversationRecord).id;
}

export async function saveConversationTurn(
  sessionId: string,
  userMessage: string,
  response: ChatResponse,
  sessionState?: ConsultationSessionState,
) {
  try {
    const supabase = await createClient();
    const metadata = {
      intent: response.intent,
      product_ids: response.products.map((product) => product.id),
      retrieval_mode: response.retrievalMode,
      conversation_state: response.conversationState,
      consultation_profile: response.consultationProfile,
      sales_intent: response.salesIntent,
      purchase_stage: response.purchaseStage,
      consultation_session_state: sessionState,
    };
    const rpc = await supabase.rpc("append_conversation_turn", {
      p_session_id: sessionId,
      p_user_content: userMessage,
      p_assistant_content: response.text,
      p_assistant_metadata: metadata,
    });
    if (!rpc.error) return;

    const conversationId = await getConversationId(sessionId);
    const { error } = await supabase.from("messages").insert([
      { conversation_id: conversationId, role: "user", content: userMessage },
      {
        conversation_id: conversationId,
        role: "assistant",
        content: response.text,
        metadata,
      },
    ]);
    if (error) throw error;
  } catch (error) {
    console.warn(
      "Conversation persistence unavailable.",
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}

export async function loadConversationHistory(
  sessionId: string,
): Promise<ChatHistoryItem[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_conversation_history", {
      p_session_id: sessionId,
      p_limit: 12,
    });
    if (error || !Array.isArray(data)) return [];

    return data.flatMap((row) => {
      if (
        (row.role !== "user" && row.role !== "assistant") ||
        typeof row.content !== "string"
      ) {
        return [];
      }
      const metadata =
        row.metadata && typeof row.metadata === "object"
          ? (row.metadata as Record<string, unknown>)
          : {};
      const rawProductIds = metadata.product_ids;
      const rawProfile = metadata.consultation_profile;
      const productIds = Array.isArray(rawProductIds)
        ? rawProductIds.map(String).slice(0, 3)
        : undefined;
      const consultationProfile =
        rawProfile && typeof rawProfile === "object"
          ? (rawProfile as ChatHistoryItem["consultationProfile"])
          : undefined;
      return [
        {
          role: row.role,
          content: row.content,
          productIds,
          consultationProfile,
        },
      ];
    });
  } catch {
    return [];
  }
}

export async function loadConsultationSessionState(
  sessionId: string,
): Promise<ConsultationSessionState> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(
      "get_consultation_session_state",
      { p_session_id: sessionId },
    );
    if (!error && data !== null) {
      return consultationSessionStateSchema.parse(data);
    }

    // Migration 007 may not be deployed yet. The same state is also copied to
    // assistant-message metadata so an active consultation remains durable.
    const history = await supabase.rpc("get_conversation_history", {
      p_session_id: sessionId,
      p_limit: 12,
    });
    if (!history.error && Array.isArray(history.data)) {
      for (let index = history.data.length - 1; index >= 0; index -= 1) {
        const metadata = history.data[index]?.metadata;
        if (!metadata || typeof metadata !== "object") continue;
        const candidate = (metadata as Record<string, unknown>)
          .consultation_session_state;
        const parsed = consultationSessionStateSchema.safeParse(candidate);
        if (parsed.success) return parsed.data;
      }
    }
    return emptySessionState();
  } catch {
    return emptySessionState();
  }
}

export async function saveConsultationSessionState(
  sessionId: string,
  state: ConsultationSessionState,
) {
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("upsert_consultation_session_state", {
      p_session_id: sessionId,
      p_state: consultationSessionStateSchema.parse(state),
    });
    if (error) throw error;
  } catch (error) {
    console.warn(
      "Consultation state persistence unavailable.",
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}

export async function createLead(input: LeadInput) {
  const supabase = await createClient();
  const productIds = input.interestedProductIds
    .map(Number)
    .filter(Number.isSafeInteger);
  const automatic = await supabase.rpc("create_lead_from_chat", {
    p_session_id: input.sessionId,
    p_customer_name: input.customerName,
    p_customer_phone: input.customerPhone.replace(/[\s.-]/g, ""),
    p_customer_address: input.customerAddress ?? "",
    p_customer_need: input.customerNeed,
    p_interested_product_ids: productIds,
  });
  if (!automatic.error) {
    return {
      id: automatic.data,
      status: "qualified",
      created_at: new Date().toISOString(),
    };
  }
  if (automatic.error.code !== "PGRST202") throw automatic.error;

  const leadRecord = {
    conversation_id: null,
    customer_name: input.customerName,
    customer_phone: input.customerPhone.replace(/[\s.-]/g, ""),
    customer_address: input.customerAddress ?? null,
    customer_need: input.customerNeed,
    interested_product_ids: productIds,
  };
  let result = await supabase
    .from("leads")
    .insert(leadRecord);

  if (
    result.error &&
    ["PGRST204", "42703"].includes(result.error.code)
  ) {
    const { customer_address: _address, ...legacyRecord } = leadRecord;
    void _address;
    result = await supabase
      .from("leads")
      .insert(legacyRecord);
  }

  if (result.error) throw result.error;
  return {
    id: `session-${input.sessionId}`,
    status: "new",
    created_at: new Date().toISOString(),
  };
}

export async function createOrderFromChat(input: LeadInput) {
  const productIds = input.interestedProductIds
    .map(Number)
    .filter(Number.isSafeInteger);
  if (productIds.length !== 1 || !input.customerAddress) {
    throw new Error("Checkout requires one product and a delivery address.");
  }

  const supabase = await createClient();
  const result = await supabase.rpc("create_order_from_chat", {
    p_session_id: input.sessionId,
    p_customer_name: input.customerName,
    p_customer_phone: input.customerPhone.replace(/[\s.-]/g, ""),
    p_customer_address: input.customerAddress,
    p_product_ids: productIds,
    p_quantity: input.orderQuantity,
  });
  if (result.error) throw result.error;
  return { id: String(result.data), status: "Pending" };
}
