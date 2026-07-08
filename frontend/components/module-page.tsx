type ModulePageProps = {
  eyebrow: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
};

export function ModulePage({ eyebrow, title, description, actions, children }: ModulePageProps) {
  return (
    <main className="mx-auto w-full max-w-[1500px] px-5 py-7 sm:px-7 lg:px-10 lg:py-9">
      <div className="mb-7 flex flex-col justify-between gap-5 border-b border-slate-200/80 pb-6 sm:flex-row sm:items-end">
        <div className="max-w-4xl">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-blue-700">{eyebrow}</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 lg:text-4xl">{title}</h1>
          {description && <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-slate-500">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <section>{children ?? <div className="card text-slate-500">Module workspace is ready for operational components.</div>}</section>
    </main>
  );
}
