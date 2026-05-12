import { notFound } from "next/navigation";
import { getConversation, getPendingDraft, getSettings } from "@/lib/db/queries";
import { findAdjacentReservations } from "@/lib/db/reservations-cache";
import { loadConversationContext } from "@/lib/context-loader";
import { syncConversationFromHostex } from "@/lib/hostex/sync";
import Thread from "@/components/Thread";
import DraftPanel from "@/components/DraftPanel";
import InfoPanel from "@/components/InfoPanel";
import BackToBackWarning from "@/components/BackToBackWarning";

export const dynamic = "force-dynamic";

export default async function ConvPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Fire-and-forget resync. We do NOT await so that server-render isn't
  // blocked on a Hostex API roundtrip every time you switch conversations.
  // Any new messages discovered by the background sync will be pushed to the
  // open page via SSE (Thread + DraftPanel both subscribe).
  const stored = await getConversation(id);
  if (stored) {
    void syncConversationFromHostex(stored.hostex_id).catch((err) =>
      console.error("[page-resync] failed", err),
    );
  }

  const [ctx, draft, settings] = await Promise.all([
    loadConversationContext(id),
    getPendingDraft(id),
    getSettings(),
  ]);
  if (!ctx) notFound();

  const conv = ctx.conversation;
  const llmPreview = `${ctx.propertyBlock}\n\n${ctx.reservationBlock}`;

  const adjacents = conv.property_hostex_id
    ? findAdjacentReservations(
        conv.property_hostex_id,
        ctx.reservation?.check_in_date ?? conv.check_in_date,
        ctx.reservation?.check_out_date ?? conv.check_out_date,
        (ctx.reservation as { reservation_code?: string } | null)?.reservation_code ?? conv.reservation_hostex_id,
      )
    : { previous: null, next: null };

  return (
    <div
      className="h-full overflow-y-auto lg:overflow-hidden grid grid-cols-1 lg:grid-cols-[1fr_22rem] gap-3 sm:gap-4 p-3 sm:p-4 max-w-[1600px] mx-auto"
    >
      <div className="flex flex-col gap-3 sm:gap-4 min-w-0 lg:min-h-0 lg:overflow-hidden">
        <header className="shrink-0">
          <h1 className="font-semibold text-base sm:text-lg break-words">
            {conv.guest_name ?? conv.hostex_id}
          </h1>
          <p className="text-[11px] sm:text-xs text-neutral-500 break-all">
            对话 #{conv.hostex_id}
            {conv.property_hostex_id ? ` · 房源 ${conv.property_hostex_id}` : ""}
            {conv.reservation_hostex_id ? ` · 订单 ${conv.reservation_hostex_id}` : ""}
          </p>
        </header>
        {(adjacents.previous || adjacents.next) && (
          <div className="shrink-0">
            <BackToBackWarning
              conversationId={conv.id}
              initialMessages={ctx.messages}
              previous={adjacents.previous}
              next={adjacents.next}
              currentCheckIn={ctx.reservation?.check_in_date ?? conv.check_in_date ?? null}
              currentCheckOut={ctx.reservation?.check_out_date ?? conv.check_out_date ?? null}
            />
          </div>
        )}
        {/* Thread wrapper: bounded on mobile so DraftPanel stays reachable;
            flex-1 on desktop so it stretches to fill the column. */}
        <div className="shrink-0 max-h-[45dvh] lg:max-h-none lg:flex-1 lg:min-h-0">
          <Thread conversationId={conv.id} initialMessages={ctx.messages} />
        </div>
        <div className="shrink-0">
          <DraftPanel
            conversationId={conv.id}
            initialDraft={draft}
            countdownSeconds={settings.countdown_seconds}
            autoMode={settings.auto_mode}
          />
        </div>
      </div>
      <aside className="min-w-0 lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain lg:pr-1">
        <InfoPanel
          conversation={conv}
          property={ctx.property}
          reservation={ctx.reservation}
          systemContextPreview={llmPreview}
        />
      </aside>
    </div>
  );
}
