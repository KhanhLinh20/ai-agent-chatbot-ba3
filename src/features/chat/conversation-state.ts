import type { ConsultationProfile } from "@/features/chat/consultation-profile";
import { missingConsultationField } from "@/features/chat/consultation-profile";

export type ConversationState =
  | "DISCOVERING"
  | "QUALIFIED"
  | "RECOMMENDING"
  | "COMPARING"
  | "CLOSING";

export function resolveConversationState(input: {
  profile: ConsultationProfile;
  intent: string;
  hasProductContext: boolean;
  shouldCollectLead?: boolean;
}): ConversationState {
  if (input.shouldCollectLead || input.intent === "checkout") return "CLOSING";
  if (input.intent === "compare") return "COMPARING";
  if (input.hasProductContext) return "RECOMMENDING";
  if (missingConsultationField(input.profile)) return "DISCOVERING";
  return "QUALIFIED";
}

