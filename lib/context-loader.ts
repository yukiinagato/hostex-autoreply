import { getConversation, getPropertyByHostexId, listMessages } from "@/lib/db/queries";
import { getReservation as hostexGetReservation, type HostexReservation } from "@/lib/hostex/reservations";
import { formatPropertyContext } from "@/lib/hostex/properties";
import { formatReservationContext } from "@/lib/hostex/reservations";
import type { Conversation, Message, Property } from "@/lib/db/types";

export type ConversationContext = {
  conversation: Conversation;
  messages: Message[];
  property: Property | null;
  /** As-fetched reservation from Hostex (may be null if endpoint fails or no reservation linked). */
  reservation: HostexReservation | null;
  /** Pre-formatted markdown blocks for the LLM. */
  propertyBlock: string;
  reservationBlock: string;
};

/**
 * One source of truth for "everything we know about this conversation".
 * Used by both the conversation UI and the LLM draft-engine, so the host can
 * see exactly the same context the AI is reasoning over.
 */
export async function loadConversationContext(conversationId: string): Promise<ConversationContext | null> {
  const conversation = await getConversation(conversationId);
  if (!conversation) return null;

  const [messages, property, reservation] = await Promise.all([
    listMessages(conversationId, 30),
    conversation.property_hostex_id
      ? getPropertyByHostexId(conversation.property_hostex_id)
      : Promise.resolve(null),
    conversation.reservation_hostex_id
      ? hostexGetReservation(conversation.reservation_hostex_id).catch(() => null)
      : Promise.resolve(null),
  ]);

  const propertyForFmt = property
    ? ({
        id: property.hostex_id,
        name: property.name ?? undefined,
        ...property.details_json,
      } as Record<string, unknown> & { id: string | number })
    : null;

  let propertyBlock = formatPropertyContext(propertyForFmt);
  // Append host-authored notes for this property. Marked clearly so the model
  // weighs them as authoritative overrides over generic property facts.
  if (property?.custom_context && property.custom_context.trim()) {
    propertyBlock += `\n\n## Host notes (authoritative; override generic facts when in conflict)\n${property.custom_context.trim()}`;
  }

  return {
    conversation,
    messages,
    property,
    reservation,
    propertyBlock,
    reservationBlock: formatReservationContext(reservation),
  };
}
