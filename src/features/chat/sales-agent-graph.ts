import { END, START, StateGraph, StateSchema } from "@langchain/langgraph";
import { z } from "zod/v4";
import { runChatCore } from "@/features/chat/orchestrator";
import {
  chatRequestSchema,
  chatResponseSchema,
  type ChatRequest,
  type ChatResponse,
} from "@/features/chat/schemas";
import {
  consultationSessionStateSchema,
  emptySessionState,
  mergeStateIntoRequest,
  projectSessionState,
  type ConsultationSessionState,
  type StatefulChatRequest,
} from "@/features/chat/session-state";
import {
  createLead,
  createOrderFromChat,
} from "@/features/chat/repository";
import { customerNeedSummary } from "@/features/chat/customer-capture";

const SalesAgentState = new StateSchema({
  request: chatRequestSchema,
  persistedState: consultationSessionStateSchema,
  contextualRequest: z.custom<StatefulChatRequest>(),
  response: chatResponseSchema.optional(),
  nextState: consultationSessionStateSchema.optional(),
});

const graph = new StateGraph(SalesAgentState)
  .addNode("load_context", (state) => ({
    contextualRequest: mergeStateIntoRequest(
      state.request,
      state.persistedState,
    ),
  }))
  .addNode("sales_agent", async (state) => ({
    response: await runChatCore(state.contextualRequest),
  }))
  .addNode("project_state", (state) => {
    if (!state.response) throw new Error("Sales Agent did not return a reply.");
    return {
      nextState: projectSessionState(state.persistedState, state.response),
    };
  })
  .addNode("save_customer", async (state) => {
    if (!state.response || !state.nextState) {
      throw new Error("Cannot persist customer without a projected state.");
    }
    const capture = state.nextState.customerCapture;
    if (capture.status !== "ready" || !capture.name || !capture.phone) {
      return {};
    }

    try {
      const lead = await createLead({
        sessionId: state.response.sessionId,
        customerName: capture.name,
        customerPhone: capture.phone,
        customerAddress: capture.address ?? undefined,
        customerNeed: customerNeedSummary(
          state.nextState.profile,
          state.response,
          capture,
        ),
        interestedProductIds: capture.interestedProductIds,
        orderQuantity: capture.quantity,
      });
      const isCheckout =
        capture.interestedProductIds.length === 1 &&
        state.nextState.selectedProductId ===
          capture.interestedProductIds[0] &&
        Boolean(capture.address);
      const order = isCheckout
        ? await createOrderFromChat({
            sessionId: state.response.sessionId,
            customerName: capture.name,
            customerPhone: capture.phone,
            customerAddress: capture.address ?? undefined,
            customerNeed: customerNeedSummary(
              state.nextState.profile,
              state.response,
              capture,
            ),
            interestedProductIds: capture.interestedProductIds,
            orderQuantity: capture.quantity,
          })
        : null;
      const savedCapture = {
        ...capture,
        status: "saved" as const,
        savedLeadId: String(lead.id),
        error: null,
      };
      return {
        response: {
          ...state.response,
          text: `${state.response.text} ${
            order
              ? `Đơn hàng ${order.id.slice(0, 8).toUpperCase()} đã được tạo thành công và đang chờ người bán xác nhận.`
              : "Thông tin đã được lưu thành công. Shop sẽ dùng thông tin này để tiếp tục tư vấn và xác nhận với bạn."
          }`,
          customerCapture: savedCapture,
          customerSaved: true,
        },
        nextState: {
          ...state.nextState,
          customerCapture: savedCapture,
          updatedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      const failedCapture = {
        ...capture,
        status: "save_failed" as const,
        error: "Chưa đồng bộ được với hệ thống người bán.",
      };
      console.warn(
        "Automatic customer capture persistence unavailable.",
        error instanceof Error ? error.message : "Unknown error",
      );
      return {
        response: {
          ...state.response,
          text: `${state.response.text} Marty đã giữ thông tin trong phiên này nhưng chưa đồng bộ được với hệ thống người bán. Shop sẽ cần thử lưu lại sau.`,
          customerCapture: failedCapture,
          customerSaved: false,
        },
        nextState: {
          ...state.nextState,
          customerCapture: failedCapture,
          updatedAt: new Date().toISOString(),
        },
      };
    }
  })
  .addEdge(START, "load_context")
  .addEdge("load_context", "sales_agent")
  .addEdge("sales_agent", "project_state")
  .addEdge("project_state", "save_customer")
  .addEdge("save_customer", END)
  .compile();

export async function runSalesAgentGraph(input: {
  request: ChatRequest;
  persistedState?: ConsultationSessionState;
}): Promise<{
  response: ChatResponse;
  nextState: ConsultationSessionState;
}> {
  const result = await graph.invoke({
    request: input.request,
    persistedState: input.persistedState ?? emptySessionState(),
    contextualRequest: input.request,
  });

  if (!result.response || !result.nextState) {
    throw new Error("Sales Agent graph completed without a final state.");
  }
  return { response: result.response, nextState: result.nextState };
}
