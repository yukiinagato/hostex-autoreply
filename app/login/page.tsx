export default function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  return (
    <div className="max-w-sm mx-auto pt-24 px-4">
      <h1 className="text-xl font-semibold mb-4">登录</h1>
      <ErrorMsg searchParams={searchParams} />
      <form method="post" action="/api/auth/login" className="flex flex-col gap-3">
        <input
          name="username"
          type="text"
          autoFocus
          placeholder="用户名"
          autoComplete="username"
          className="border rounded px-3 py-2 bg-white dark:bg-neutral-900 border-neutral-300 dark:border-neutral-700"
        />
        <input
          name="password"
          type="password"
          placeholder="密码"
          autoComplete="current-password"
          className="border rounded px-3 py-2 bg-white dark:bg-neutral-900 border-neutral-300 dark:border-neutral-700"
        />
        <button className="bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 rounded px-3 py-2 font-medium">
          登录
        </button>
      </form>
    </div>
  );
}

async function ErrorMsg({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  if (!sp.error) return null;
  return <p className="text-sm text-red-600 mb-3">用户名或密码错误。</p>;
}
