'use client';

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold">You're offline</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          First 2 Apply needs a network connection to load this page. Your last-synced jobs are still
          available from the home screen.
        </p>
        <button
          type="button"
          onClick={() => location.reload()}
          className="bg-primary text-primary-foreground mt-6 rounded-md px-4 py-2 text-sm"
        >
          Retry
        </button>
        <p className="text-muted-foreground mt-8 text-xs">
          Stuck?{' '}
          <a href="/sw-reset" className="underline">
            Reset the app
          </a>
          .
        </p>
      </div>
    </main>
  );
}
