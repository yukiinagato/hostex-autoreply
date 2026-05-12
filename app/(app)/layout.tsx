import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { listConversations } from "@/lib/db/queries";
import { kickStaleConversationSync } from "@/lib/hostex/background-sync";
import AppShell from "@/components/AppShell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAuthenticated())) redirect("/login");
  const conversations = await listConversations();
  kickStaleConversationSync();
  return <AppShell conversations={conversations}>{children}</AppShell>;
}
