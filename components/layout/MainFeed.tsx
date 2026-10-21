interface MainFeedProps {
  className?: string;
}

// Static shell; task cards arrive with the data layer. No client state needed here.
export function MainFeed({ className = '' }: MainFeedProps) {
  return (
    <main className={`min-h-0 flex-1 flex-col overflow-y-auto p-4 lg:p-6 ${className}`}>
      <h1 className="text-xl font-semibold">Today</h1>
      <p className="mt-1 text-sm text-muted">Your execution feed will appear here.</p>
      <div className="mt-6 rounded-lg border border-dashed border-border p-6 text-sm text-muted">
        No tasks yet.
      </div>
    </main>
  );
}
