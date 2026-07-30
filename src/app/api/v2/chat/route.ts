import { after, NextResponse } from "next/server";
import { ZodError } from "zod";
import { runSalesAgentGraph } from "@/features/chat/sales-agent-graph";
import {
  chatRequestSchema,
  chatResponseSchema,
} from "@/features/chat/schemas";
import {
  loadConversationHistory,
  loadConsultationSessionState,
  saveConversationTurn,
  saveConsultationSessionState,
} from "@/features/chat/repository";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const parsed = chatRequestSchema.parse(await request.json());
    const sessionId = parsed.sessionId ?? crypto.randomUUID();
    const [storedHistory, persistedState] = await Promise.all([
      parsed.sessionId && parsed.history.length === 0
        ? loadConversationHistory(parsed.sessionId)
        : Promise.resolve([]),
      parsed.sessionId
        ? loadConsultationSessionState(parsed.sessionId)
        : Promise.resolve(undefined),
    ]);
    const input = storedHistory.length
      ? { ...parsed, sessionId, history: storedHistory }
      : { ...parsed, sessionId };
    const hasServerState =
      persistedState &&
      (persistedState.activeProductIds.length > 0 ||
        Object.keys(persistedState.profile).length > 0 ||
        persistedState.lastIntent !== null);
    const graphResult = await runSalesAgentGraph({
      request: input,
      persistedState: hasServerState
        ? persistedState
        : parsed.sessionState,
    });
    const response = chatResponseSchema.parse({
      ...graphResult.response,
      sessionState: graphResult.nextState,
    });
    after(async () => {
      await Promise.all([
        saveConversationTurn(
          response.sessionId,
          input.message,
          response,
          graphResult.nextState,
        ),
        saveConsultationSessionState(
          response.sessionId,
          graphResult.nextState,
        ),
      ]);
    });
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Dữ liệu hội thoại chưa hợp lệ.", details: error.issues },
        { status: 400 },
      );
    }
    console.error("Chat orchestration failed.", error);
    return NextResponse.json(
      { error: "Marty đang bận. Vui lòng thử lại sau ít phút." },
      { status: 500 },
    );
  }
}
