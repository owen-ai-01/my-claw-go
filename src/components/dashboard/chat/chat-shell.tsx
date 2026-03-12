export function ChatShell() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Chat</h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
          Your MyClawGo chat will open here once your personal runtime is created.
        </p>
      </div>

      <div className="rounded-2xl border bg-card p-8 shadow-sm">
        <div className="mx-auto flex max-w-xl flex-col items-center text-center">
          <div className="mb-4 rounded-full border px-3 py-1 text-xs text-muted-foreground">
            Step 1 skeleton
          </div>
          <h2 className="text-xl font-semibold">Create your MyClawGo</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            Create your private OpenClaw cloud workspace first. After it is ready,
            you will enter chat directly without the long first-message setup flow.
          </p>
          <button
            type="button"
            disabled
            className="mt-6 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground opacity-80"
          >
            Create My MyClawGo
          </button>
          <p className="mt-4 text-xs text-muted-foreground">
            The real create flow and ready-state detection will be connected in the next steps.
          </p>
        </div>
      </div>
    </div>
  );
}
