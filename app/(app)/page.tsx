export default function HomePage() {
  return (
    <div className="h-full grid place-items-center text-center text-sm text-neutral-500 px-6">
      <div>
        <div className="text-3xl mb-3">💬</div>
        <p className="font-medium text-neutral-700 dark:text-neutral-300">请从左侧选择一个对话。</p>
        <p className="mt-1">当 Hostex Webhook 推送新消息时，对话会自动出现在列表中。</p>
      </div>
    </div>
  );
}
