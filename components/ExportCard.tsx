"use client";
import { useState } from "react";

export default function ExportCard() {
  const [busy, setBusy] = useState<"db" | "json" | null>(null);

  async function download(format: "db" | "json") {
    if (busy) return;
    setBusy(format);
    try {
      // Trigger via anchor click — lets the browser stream the response directly
      // to disk with the correct filename from Content-Disposition.
      const a = document.createElement("a");
      a.href = `/api/admin/export?format=${format}&t=${Date.now()}`;
      a.rel = "noopener";
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally {
      setTimeout(() => setBusy(null), 500);
    }
  }

  return (
    <section className="border rounded border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
      <header className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-800">
        <div className="text-sm font-medium">数据导出</div>
        <div className="text-[11px] text-neutral-500">
          下载本地数据库的完整备份，可用于迁移到另一台设备 / 服务器。
        </div>
      </header>
      <div className="p-3 space-y-3 text-xs">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => download("db")}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded px-3 py-1.5"
          >
            {busy === "db" ? "准备中…" : "下载 SQLite 数据库 (.db)"}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => download("json")}
            className="rounded px-3 py-1.5 border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            {busy === "json" ? "准备中…" : "导出全部数据 (JSON)"}
          </button>
        </div>

        <div className="text-[11px] text-neutral-500 space-y-1.5 pt-2 border-t border-neutral-200 dark:border-neutral-800">
          <p className="font-medium text-neutral-700 dark:text-neutral-300">迁移到另一台设备 / 服务器：</p>
          <ol className="list-decimal list-inside space-y-0.5">
            <li>下载 <code className="bg-neutral-100 dark:bg-neutral-800 px-1 rounded">.db</code> 文件。</li>
            <li>在目标机器上停止 dev server（<code className="bg-neutral-100 dark:bg-neutral-800 px-1 rounded">Ctrl+C</code>）。</li>
            <li>把下载的文件放到目标项目的 <code className="bg-neutral-100 dark:bg-neutral-800 px-1 rounded">data/app.db</code>（覆盖原文件）。</li>
            <li>重新启动 dev server，所有对话、订单缓存、房源备注都会带过去。</li>
          </ol>
          <p className="pt-1">
            JSON 文件是结构化备份，方便人工查看、跨语言导入或备份到云端。
            注意：包含完整对话历史、客户姓名 / 电话 / 邮箱，请妥善保管。
          </p>
        </div>
      </div>
    </section>
  );
}
