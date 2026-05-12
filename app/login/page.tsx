export default function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  return (
    <div className="min-h-dvh grid place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 grid place-items-center text-white text-2xl shadow-lg mb-3">
            💬
          </div>
          <h1 className="text-xl font-semibold">Hostex 自动回复</h1>
          <p className="text-xs text-neutral-500 mt-1">登录以继续</p>
        </div>
        <ErrorMsg searchParams={searchParams} />
        <form method="post" action="/api/auth/login" className="flex flex-col gap-3 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-4 shadow-sm">
          <label className="text-xs flex flex-col gap-1">
            <span className="text-neutral-500">用户名</span>
            <input
              name="username"
              type="text"
              autoFocus
              autoComplete="username"
              placeholder="例如：admin"
              className="input"
            />
          </label>
          <label className="text-xs flex flex-col gap-1">
            <span className="text-neutral-500">密码</span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="输入密码"
              className="input"
            />
          </label>
          <button className="btn-primary mt-2 py-2.5">登录</button>
        </form>
        <p className="text-[11px] text-neutral-400 text-center mt-4">
          自托管多用户工具 · 数据保存在你自己的服务器
        </p>
      </div>
    </div>
  );
}

async function ErrorMsg({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  if (!sp.error) return null;
  return (
    <div className="mb-3 rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-sm text-red-700 dark:text-red-300">
      用户名或密码错误。
    </div>
  );
}
