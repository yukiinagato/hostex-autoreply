import { NextResponse } from "next/server";
import { z } from "zod";
import sharp from "sharp";
import { currentUser } from "@/lib/auth";
import { getConversation, getDraft, insertMessage, updateDraft } from "@/lib/db/queries";
import { sendMessage } from "@/lib/hostex/conversations";

export const runtime = "nodejs";

const Body = z.object({
  text: z.string().max(4000).optional().default(""),
  source: z.enum(["primary", "alternative", "edited", "auto"]).default("edited"),
  // data URL like "data:image/png;base64,...." OR raw base64 of an image
  image: z.string().max(20_000_000).optional(),
});

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // post-conversion JPEG cap

async function convertToJpegBase64(input: string): Promise<string> {
  let raw = input;
  const m = input.match(/^data:[\w/+-]+;base64,(.*)$/i);
  if (m) raw = m[1];
  const buf = Buffer.from(raw, "base64");
  if (buf.length === 0) throw new Error("empty image data");

  const jpeg = await sharp(buf)
    .rotate() // honor EXIF orientation
    .resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();
  if (jpeg.length > MAX_IMAGE_BYTES) {
    // Re-encode at lower quality if still too big
    const smaller = await sharp(buf)
      .rotate()
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 70 })
      .toBuffer();
    return smaller.toString("base64");
  }
  return jpeg.toString("base64");
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  if (!parsed.data.text && !parsed.data.image) {
    return NextResponse.json({ error: "需要文字或图片至少其一" }, { status: 400 });
  }

  const draft = await getDraft(id);
  if (!draft) return NextResponse.json({ error: "draft not found" }, { status: 404 });
  if (draft.status !== "pending") {
    return NextResponse.json({ error: "draft not pending", status: draft.status }, { status: 409 });
  }
  const conv = await getConversation(draft.conversation_id);
  if (!conv) return NextResponse.json({ error: "conversation gone" }, { status: 404 });

  // Compose final outbound text (with per-user suffix)
  const suffix = user.message_suffix.trim();
  let text = parsed.data.text ?? "";
  if (text && suffix) text = `${text.trimEnd()}\n${suffix}`;

  // Convert image if present
  let jpegBase64: string | undefined;
  if (parsed.data.image) {
    try {
      jpegBase64 = await convertToJpegBase64(parsed.data.image);
    } catch (err) {
      return NextResponse.json({ error: `图片处理失败：${(err as Error).message}` }, { status: 400 });
    }
  }

  const hostexResp = await sendMessage(conv.hostex_id, {
    text: text || undefined,
    jpegBase64,
  });
  console.log("[send] hostex response:", JSON.stringify(hostexResp).slice(0, 300));

  // Local optimistic insert. For image-only sends we still log a row so the
  // host sees their own send immediately; attachment_url is left null because
  // we don't have the Hostex CDN URL until the webhook echoes back. (The
  // sync.ts reconciliation will fill in hostex_msg_id and the echo will
  // arrive with the real image URL as its own row — minor visual dup that
  // resolves within seconds.)
  if (text) {
    await insertMessage({
      conversation_id: conv.id,
      sender: "host",
      content: text,
      sent_via: parsed.data.source === "auto" ? "ai-auto" : "ai-manual",
    });
  }
  const updated = await updateDraft(draft.id, { status: "sent", auto_send_at: null });

  return NextResponse.json({ ok: true, draft: updated });
}
