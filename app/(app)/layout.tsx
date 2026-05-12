import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { listConversations } from "@/lib/db/queries";
import { kickStaleConversationSync } from "@/lib/hostex/background-sync";
import AppShell from "@/components/AppShell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const conversations = await listConversations();
  kickStaleConversationSync();
  return (
    <AppShell conversations={conversations} user={user}>
      {children}
    </AppShell>
  );
}
