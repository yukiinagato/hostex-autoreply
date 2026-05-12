import { EventEmitter } from "node:events";
import type { ConversationDraft, Draft, Message } from "@/lib/db/types";

/**
 * In-process event bus for SSE. Lives for the lifetime of the Node server.
 * If you ever scale to multiple processes, replace with Redis pub/sub or similar.
 */

type Events = {
  // per-conversation:
  [k: `message:${string}`]: [Message];
  [k: `draft:${string}`]: [Draft];
  [k: `convdraft:${string}`]: [ConversationDraft];
  // global:
  conversations: [];
};

class TypedEmitter extends EventEmitter {
  emitTyped<K extends keyof Events>(event: K, ...args: Events[K]): boolean {
    return this.emit(event as string, ...(args as unknown[]));
  }
  onTyped<K extends keyof Events>(event: K, listener: (...args: Events[K]) => void): this {
    return this.on(event as string, listener as (...args: unknown[]) => void);
  }
  offTyped<K extends keyof Events>(event: K, listener: (...args: Events[K]) => void): this {
    return this.off(event as string, listener as (...args: unknown[]) => void);
  }
}

const g = globalThis as unknown as { __hxar_emitter?: TypedEmitter };
const bus = g.__hxar_emitter ?? (g.__hxar_emitter = new TypedEmitter());
bus.setMaxListeners(100);
export const events = bus;

export function emitMessageInserted(conversationId: string, m: Message) {
  bus.emitTyped(`message:${conversationId}`, m);
}
export function emitDraftChanged(conversationId: string, d: Draft) {
  bus.emitTyped(`draft:${conversationId}`, d);
}
export function emitConversationDraftChanged(conversationId: string, s: ConversationDraft) {
  bus.emitTyped(`convdraft:${conversationId}`, s);
}
export function emitConversationsChanged() {
  bus.emitTyped("conversations");
}
