type ModulePageProps = {
  eyebrow: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
};

export function ModulePage({ eyebrow, title, actions, children }: ModulePageProps) {
  return (
    <main className="mx-auto w-full max-w-7xl p-6 lg:p-8">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-700">{eyebrow}</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight lg:text-4xl">{title}</h1>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <section className="mt-6">{children ?? <div className="card text-slate-500">Module workspace is ready for operational components.</div>}</section>
    </main>
  );
}
