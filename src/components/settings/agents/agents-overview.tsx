export function AgentsOverview() {
  const agents = [
    {
      id: 'main',
      name: 'Main Agent',
      description: 'Primary assistant for the user workspace.',
      status: 'active',
      telegramBots: 0,
      runtimeSync: 'Not configured yet',
      isDefault: true,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Agents</h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
          Manage your user agents and connect channels like Telegram. Each agent
          can have its own messaging entrypoint and runtime configuration.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {agents.map((agent) => (
          <div
            key={agent.id}
            className="rounded-2xl border bg-card p-6 shadow-sm"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold">{agent.name}</h2>
                  {agent.isDefault ? (
                    <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                      Default
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {agent.description}
                </p>
              </div>
              <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600">
                {agent.status}
              </span>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-xl border p-3">
                <p className="text-xs text-muted-foreground">Telegram Bots</p>
                <p className="mt-1 text-xl font-semibold">{agent.telegramBots}</p>
              </div>
              <div className="rounded-xl border p-3">
                <p className="text-xs text-muted-foreground">Runtime Sync</p>
                <p className="mt-1 text-sm font-medium">{agent.runtimeSync}</p>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground opacity-80"
                disabled
              >
                Configure Telegram
              </button>
              <button
                type="button"
                className="rounded-lg border px-4 py-2 text-sm font-medium text-muted-foreground opacity-80"
                disabled
              >
                Manage Agent
              </button>
            </div>

            <p className="mt-4 text-xs text-muted-foreground">
              Step 4 skeleton: Telegram binding UI and runtime sync actions will
              be connected in the next steps.
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
