"use client";
import { useEffect, useState } from "react";
import type { Settings } from "@/lib/db/types";

type ModelOption = { id: string; label: string };

export default function SettingsForm({ initial }: { initial: Settings }) {
  const [s, setS] = useState<Settings>(initial);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [models, setModels] = useState<{ anthropic: ModelOption[]; openai: ModelOption[] } | null>(null);
  const [modelsLoading, setModelsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/models", { cache: "no-store" });
        if (!r.ok) return;
        const json = await r.json();
        if (!cancelled) setModels({ anthropic: json.anthropic ?? [], openai: json.openai ?? [] });
      } finally {
        if (!cancelled) setModelsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function save() {
    setSaving(true); setMsg(null);
    const r = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        llm_provider: s.llm_provider,
        anthropic_model: s.anthropic_model,
        openai_model: s.openai_model,
        auto_mode: s.auto_mode,
        countdown_seconds: s.countdown_seconds,
        system_prompt: s.system_prompt,
      }),
    });
    setSaving(false);
    setMsg(r.ok ? "已保存。" : `保存失败：${r.status}`);
  }

  const inputCss = "border rounded px-2 py-1 bg-white dark:bg-neutral-900 border-neutral-300 dark:border-neutral-700 text-sm";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <input
          id="auto"
          type="checkbox"
          checked={s.auto_mode}
          onChange={(e) => setS({ ...s, auto_mode: e.target.checked })}
        />
        <label htmlFor="auto" className="text-sm">全自动模式（倒数结束后自动发送）</label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm flex flex-col gap-1">
          <span>倒数秒数</span>
          <input
            type="number"
            min={3}
            max={600}
            className={inputCss}
            value={s.countdown_seconds}
            onChange={(e) => setS({ ...s, countdown_seconds: Number(e.target.value) })}
          />
        </label>
        <label className="text-sm flex flex-col gap-1">
          <span>当前使用的模型提供商</span>
          <select
            className={inputCss}
            value={s.llm_provider}
            onChange={(e) => setS({ ...s, llm_provider: e.target.value as Settings["llm_provider"] })}
          >
            <option value="anthropic">Anthropic (Claude)</option>
            <option value="openai">OpenAI (GPT)</option>
          </select>
        </label>

        <ModelSelect
          label="Anthropic 模型"
          value={s.anthropic_model}
          options={models?.anthropic ?? []}
          loading={modelsLoading}
          provider="anthropic"
          onChange={(v) => setS({ ...s, anthropic_model: v })}
          inputCss={inputCss}
        />
        <ModelSelect
          label="OpenAI 模型"
          value={s.openai_model}
          options={models?.openai ?? []}
          loading={modelsLoading}
          provider="openai"
          onChange={(v) => setS({ ...s, openai_model: v })}
          inputCss={inputCss}
        />
      </div>

      <label className="text-sm flex flex-col gap-1">
        <span>系统提示词（System prompt）</span>
        <textarea
          rows={6}
          className={inputCss + " font-mono text-xs"}
          value={s.system_prompt}
          onChange={(e) => setS({ ...s, system_prompt: e.target.value })}
        />
      </label>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm rounded px-3 py-1.5"
        >
          {saving ? "保存中…" : "保存"}
        </button>
        {msg && <span className="text-sm text-neutral-500">{msg}</span>}
      </div>

      <p className="text-xs text-neutral-500 pt-4 border-t border-neutral-200 dark:border-neutral-800">
        API 密钥（Anthropic / OpenAI）、Hostex 访问令牌等从 .env.local 环境变量读取。修改后请重启 dev server。
        上方模型列表会从已设置 key 的提供商实时拉取。
      </p>
    </div>
  );
}

function ModelSelect({
  label,
  value,
  options,
  loading,
  provider,
  onChange,
  inputCss,
}: {
  label: string;
  value: string;
  options: ModelOption[];
  loading: boolean;
  provider: "anthropic" | "openai";
  onChange: (v: string) => void;
  inputCss: string;
}) {
  // Allow free-text fallback when the API list is empty (no key set, or
  // request failed) or when the saved value isn't in the returned list yet
  // (e.g. you typed a future model id).
  const haveOption = options.some((o) => o.id === value);
  const useFreeText = !loading && options.length === 0;

  return (
    <label className="text-sm flex flex-col gap-1">
      <span className="flex items-center gap-2">
        {label}
        {loading && <span className="text-[10px] text-neutral-400">加载中…</span>}
        {!loading && options.length === 0 && (
          <span className="text-[10px] text-amber-600" title={`请在 .env.local 中设置 ${provider.toUpperCase()}_API_KEY`}>
            未设置 {provider} 密钥
          </span>
        )}
      </span>
      {useFreeText ? (
        <input
          className={inputCss}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={provider === "anthropic" ? "claude-sonnet-4-6" : "gpt-4o"}
        />
      ) : (
        <select
          className={inputCss}
          value={haveOption ? value : "__custom__"}
          onChange={(e) => {
            if (e.target.value === "__custom__") return;
            onChange(e.target.value);
          }}
        >
          {!haveOption && value && (
            <option value="__custom__" disabled>
              {value}（不在列表中）
            </option>
          )}
          {options.map((o) => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
      )}
    </label>
  );
}
