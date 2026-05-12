"use client";
import { useEffect, useRef, useState } from "react";
import { useDraftState } from "./useDraftState";

type Preset =
  | { label: string; preview: string; text: string }
  | {
      label: string;
      preview: string;
      requiresInput: {
        fieldLabel: string;
        placeholder: string;
        build: (value: string) => string;
      };
    };

const PRESETS: Preset[] = [
  {
    label: "邻居投诉噪音",
    preview: "提醒客人保持安静，22:00 后尤其注意…",
    text: "邻居反映客人发出较大声音，请客人在夜间（特别是 22:00 之后）保持安静，避免打扰其他住户。语气礼貌但明确。",
  },
  {
    label: "维修人员进入",
    preview: "向客人征求同意，让维修人员进入房间…",
    requiresInput: {
      fieldLabel: "进入原因",
      placeholder: "例如：燃气表年检 / 厨房水管漏水检修 / 空调外机维护",
      build: (reason) =>
        `我们的维护人员需要进入客人正在入住的房间。原因：${reason}。请代我向客人礼貌地征求同意，说明大致需要的时间（如未确定，请客人告知方便的时间段），并表达若不方便可以另约时间。强调对打扰致歉，语气尊重客人隐私。`,
    },
  },
  {
    label: "提醒退房时间",
    preview: "明早 11:00 前退房…",
    text: "提醒客人明天 11:00 前退房，并感谢入住。如需延迟退房，告知收费方式。",
  },
  {
    label: "询问入住体验",
    preview: "入住后问候 + 是否一切顺利…",
    text: "客人入住后简单问候，确认是否一切顺利、有没有需要协助的地方。",
  },
  {
    label: "通知设施维修",
    preview: "告知设施暂时故障 + 致歉…",
    text: "通知客人某项设施暂时故障，已安排维修，并对带来的不便致歉。",
  },
  {
    label: "提醒垃圾分类",
    preview: "下次回收日 + 垃圾袋位置…",
    text: "礼貌提醒客人垃圾袋收紧后放在门外指定位置，下次回收日是周二/周五 11:00 前。",
  },
  {
    label: "感谢入住 / 邀请下次再来",
    preview: "退房后温暖致谢…",
    text: "客人退房后简短感谢，并邀请下次再光临。语气温暖。",
  },
  {
    label: "询问是否需延住",
    preview: "询问延住意向 + 流程…",
    text: "客人退房日临近，询问是否考虑延长入住，并告知可用日期与流程（按夜计费）。",
  },
];

export default function ComposePanel({
  conversationId,
  countdownHint,
}: {
  conversationId: string;
  countdownHint?: string;
}) {
  const { state, patch, loaded } = useDraftState(conversationId);
  const prompt = state.compose_prompt;
  const presetInput = state.preset_input;

  // open state is local; auto-expand if there's any synced input on mount.
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (loaded && (state.compose_prompt || state.preset_label) && !open) setOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  const [showPresets, setShowPresets] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const presetInputRef = useRef<HTMLInputElement>(null);
  const presetsRef = useRef<HTMLDivElement>(null);

  const pendingPreset = state.preset_label
    ? (PRESETS.find((p) => p.label === state.preset_label && "requiresInput" in p) as
        | Extract<Preset, { requiresInput: unknown }>
        | undefined)
    : undefined;

  // Click outside closes presets dropdown
  useEffect(() => {
    if (!showPresets) return;
    const onClick = (e: MouseEvent) => {
      if (presetsRef.current && !presetsRef.current.contains(e.target as Node)) {
        setShowPresets(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [showPresets]);

  function applyPendingPreset() {
    if (!pendingPreset || !presetInput.trim()) return;
    patch({
      compose_prompt: pendingPreset.requiresInput.build(presetInput.trim()),
      preset_label: "",
      preset_input: "",
    });
    setTimeout(() => textareaRef.current?.focus(), 0);
  }
  function cancelPendingPreset() {
    patch({ preset_label: "", preset_input: "" });
  }

  async function generate() {
    if (!prompt.trim() || busy) return;
    setBusy(true); setError(null);
    try {
      const r = await fetch(`/api/conversations/${encodeURIComponent(conversationId)}/compose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });
      if (!r.ok) {
        const txt = await r.text();
        throw new Error(txt.slice(0, 200) || `HTTP ${r.status}`);
      }
      // Successful → clear synced inputs; new draft will arrive via SSE and
      // DraftPanel takes over rendering.
      patch({ compose_prompt: "", preset_label: "", preset_input: "" });
      setOpen(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setTimeout(() => textareaRef.current?.focus(), 0);
        }}
        style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
        className="w-full text-left border rounded border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 text-sm text-neutral-500 hover:border-blue-400 hover:text-neutral-700 dark:hover:text-neutral-300 transition"
      >
        <div className="flex items-center gap-2">
          <span className="text-base">✎</span>
          <span>暂无待处理草稿。点此让 AI 起草一条主动消息发给客人…</span>
        </div>
        {countdownHint && (
          <div className="mt-1 text-[11px] text-neutral-400">{countdownHint}</div>
        )}
      </button>
    );
  }

  return (
    <div
      className="border rounded border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 space-y-3"
      style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
    >
      <div className="flex items-center gap-2">
        <span className="font-medium text-sm">主动消息</span>
        <span className="text-[11px] text-neutral-500">告诉 AI 你想写什么，它会生成两个候选</span>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            patch({ compose_prompt: "", preset_label: "", preset_input: "" });
            setError(null);
          }}
          aria-label="取消"
          className="ml-auto text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 text-base leading-none"
        >
          ×
        </button>
      </div>

      {pendingPreset && (
        <div className="rounded border border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-950/30 p-2.5 space-y-2">
          <div className="flex items-baseline gap-2">
            <span className="text-xs font-medium">{pendingPreset.label}</span>
            <span className="text-[11px] text-neutral-500">{pendingPreset.requiresInput.fieldLabel}</span>
            <button
              type="button"
              aria-label="取消"
              onClick={cancelPendingPreset}
              className="ml-auto text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 text-base leading-none"
            >
              ×
            </button>
          </div>
          <input
            ref={presetInputRef}
            value={presetInput}
            onChange={(e) => patch({ preset_input: e.target.value })}
            placeholder={pendingPreset.requiresInput.placeholder}
            className="w-full text-sm rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-2 py-1.5"
            onKeyDown={(e) => {
              if (e.key === "Enter" && presetInput.trim()) {
                e.preventDefault();
                applyPendingPreset();
              }
            }}
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!presetInput.trim()}
              onClick={applyPendingPreset}
              className="text-xs rounded px-2.5 py-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white"
            >
              确认
            </button>
            <button
              type="button"
              onClick={cancelPendingPreset}
              className="text-xs rounded px-2.5 py-1 border border-neutral-300 dark:border-neutral-700"
            >
              取消
            </button>
            <span className="ml-auto text-[10px] text-neutral-400">回车确认</span>
          </div>
        </div>
      )}

      <textarea
        ref={textareaRef}
        value={prompt}
        onChange={(e) => patch({ compose_prompt: e.target.value })}
        rows={4}
        placeholder="例如：邻居反馈昨晚客人较吵，请提醒他们 22 点之后保持安静，语气礼貌。"
        className="w-full text-sm rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 p-2"
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            void generate();
          }
        }}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!prompt.trim() || busy}
          onClick={generate}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm rounded px-3 py-1.5"
        >
          {busy ? "生成中…" : "生成草稿"}
        </button>

        <div className="relative" ref={presetsRef}>
          <button
            type="button"
            disabled={busy}
            onClick={() => setShowPresets((v) => !v)}
            className="text-sm rounded px-3 py-1.5 border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            常用场景 ▾
          </button>
          {showPresets && (
            <div className="absolute z-30 left-0 bottom-full mb-1 w-[20rem] max-w-[80vw] rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-lg overflow-hidden">
              <ul className="max-h-72 overflow-y-auto divide-y divide-neutral-100 dark:divide-neutral-800">
                {PRESETS.map((p) => (
                  <li key={p.label}>
                    <button
                      type="button"
                      onClick={() => {
                        if ("requiresInput" in p) {
                          patch({ preset_label: p.label, preset_input: "" });
                          setShowPresets(false);
                          setTimeout(() => presetInputRef.current?.focus(), 0);
                        } else {
                          patch({ compose_prompt: p.text, preset_label: "", preset_input: "" });
                          setShowPresets(false);
                          textareaRef.current?.focus();
                        }
                      }}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-neutral-50 dark:hover:bg-neutral-800"
                    >
                      <div className="font-medium text-neutral-900 dark:text-neutral-100">
                        {p.label}
                        {"requiresInput" in p && (
                          <span className="ml-1 text-[10px] text-blue-600">需输入</span>
                        )}
                      </div>
                      <div className="text-[11px] text-neutral-500 mt-0.5 line-clamp-2">{p.preview}</div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <span className="ml-auto text-[10px] text-neutral-400 hidden sm:inline">⌘/Ctrl + Enter 生成</span>
      </div>

      {error && <p className="text-xs text-red-600 break-all">{error}</p>}
    </div>
  );
}
