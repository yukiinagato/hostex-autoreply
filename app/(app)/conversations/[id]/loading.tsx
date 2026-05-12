export default function Loading() {
  return (
    <div className="h-full overflow-hidden grid grid-cols-1 lg:grid-cols-[1fr_22rem] gap-3 sm:gap-4 p-3 sm:p-4 max-w-[1600px] mx-auto animate-pulse">
      <div className="grid gap-3 sm:gap-4 min-w-0">
        <div>
          <div className="h-5 w-40 rounded bg-neutral-200 dark:bg-neutral-800 mb-2" />
          <div className="h-3 w-64 rounded bg-neutral-200 dark:bg-neutral-800" />
        </div>
        <div className="h-[45dvh] sm:h-[50vh] rounded border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900" />
        <div className="h-40 rounded border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900" />
      </div>
      <aside className="space-y-4 min-w-0">
        <div className="h-32 rounded border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900" />
        <div className="h-32 rounded border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900" />
      </aside>
    </div>
  );
}
