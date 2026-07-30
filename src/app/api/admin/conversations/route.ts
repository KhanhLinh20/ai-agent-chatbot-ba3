import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type MessageRow = {
  id: number;
  conversation_id?: number;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type ConversationRow = {
  id: number;
  session_id: string;
  customer_name: string | null;
  customer_phone: string | null;
  status: string;
  summary: string | null;
  created_at: string;
  updated_at: string;
};

function toTranscript(row: Record<string, unknown>) {
  const rawTranscript = Array.isArray(row.transcript) ? row.transcript : [];
  return {
    id: Number(row.conversation_id),
    sessionId: String(row.session_id),
    customerName:
      typeof row.customer_name === "string" ? row.customer_name : null,
    customerPhone:
      typeof row.customer_phone === "string" ? row.customer_phone : null,
    status: String(row.status ?? "active"),
    summary: typeof row.summary === "string" ? row.summary : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    messageCount: Number(row.message_count ?? rawTranscript.length),
    lastMessage:
      typeof row.last_message === "string" ? row.last_message : null,
    messages: rawTranscript.map((message) => {
      const item = message as Record<string, unknown>;
      return {
        id: Number(item.id),
        role: String(item.role),
        content: String(item.content ?? ""),
        metadata:
          item.metadata && typeof item.metadata === "object"
            ? item.metadata
            : {},
        createdAt: String(item.created_at),
      };
    }),
  };
}

export async function GET() {
  try {
    const adminClient = createAdminClient();
    const supabase = adminClient ?? (await createClient());
    const rpc = await supabase.rpc("get_admin_conversation_transcripts", {
      p_limit: 100,
    });
    if (!rpc.error && Array.isArray(rpc.data)) {
      return NextResponse.json({
        mode: "supabase",
        conversations: rpc.data.map((row) =>
          toTranscript(row as Record<string, unknown>),
        ),
      });
    }

    // The fallback keeps the admin usable before migration 013 is deployed.
    const conversations = await supabase
      .from("conversations")
      .select(
        "id, session_id, customer_name, customer_phone, status, summary, created_at, updated_at",
      )
      .order("updated_at", { ascending: false })
      .limit(100);
    if (conversations.error) {
      if (!adminClient) {
        return NextResponse.json(
          {
            error:
              "Trang quản trị chưa có quyền đọc hội thoại. Hãy cấu hình SUPABASE_SERVICE_ROLE_KEY trên server.",
            configurationRequired: true,
            conversations: [],
          },
          { status: 503 },
        );
      }
      throw conversations.error;
    }

    const rows = (conversations.data ?? []) as ConversationRow[];
    const ids = rows.map((row) => row.id);
    const messages = ids.length
      ? await supabase
          .from("messages")
          .select("id, conversation_id, role, content, metadata, created_at")
          .in("conversation_id", ids)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
      : { data: [], error: null };
    if (messages.error) throw messages.error;

    const messagesByConversation = new Map<number, MessageRow[]>();
    for (const message of (messages.data ?? []) as MessageRow[]) {
      const conversationId = Number(message.conversation_id);
      const list = messagesByConversation.get(conversationId) ?? [];
      list.push(message);
      messagesByConversation.set(conversationId, list);
    }

    return NextResponse.json({
      mode: "supabase",
      conversations: rows.map((conversation) => {
        const transcript = messagesByConversation.get(conversation.id) ?? [];
        return {
          id: conversation.id,
          sessionId: conversation.session_id,
          customerName: conversation.customer_name,
          customerPhone: conversation.customer_phone,
          status: conversation.status,
          summary: conversation.summary,
          createdAt: conversation.created_at,
          updatedAt: conversation.updated_at,
          messageCount: transcript.length,
          lastMessage: transcript.at(-1)?.content ?? null,
          messages: transcript.map((message) => ({
            id: message.id,
            role: message.role,
            content: message.content,
            metadata: message.metadata ?? {},
            createdAt: message.created_at,
          })),
        };
      }),
    });
  } catch (error) {
    console.error("Admin conversation transcript query failed.", error);
    return NextResponse.json(
      {
        error: "Không thể tải lịch sử hội thoại.",
        conversations: [],
      },
      { status: 500 },
    );
  }
}
