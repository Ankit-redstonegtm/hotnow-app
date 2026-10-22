export default function SetupPage() {
  return <main className="min-h-dvh flex items-center justify-center px-6 py-12">
    <div className="card p-8 max-w-2xl w-full">
      <span className="chip">HotNow local setup</span>
      <h1 className="text-3xl font-semibold mt-5">Connect your cloud services</h1>
      <p className="mt-4">Your local frontend and backend are running together. Connect a Supabase cloud project to enable accounts and saved company workspaces.</p>
      <ol className="list-decimal pl-5 space-y-3 mt-6">
        <li>Create a project at <a className="underline" href="https://supabase.com/dashboard">Supabase</a>.</li>
        <li>Run <code>supabase/migrations/001_hotnow.sql</code> in its SQL Editor, then expose the <code>hotnow</code> schema in Data API settings.</li>
        <li>Fill in <code>.env.local</code>: Supabase project URL, publishable key, and server secret key.</li>
        <li>Add Parallel AI credentials for research and discovery. Add Blitz credentials for contacts and emails.</li>
        <li>Restart the local server and open <a className="underline" href="/signup">Create account</a>.</li>
      </ol>
      <p className="mt-6 text-sm" style={{ color: "var(--muted)" }}>The full account setup guide is LOCAL_SETUP.md in the project folder. Keep secret keys in .env.local.</p>
    </div>
  </main>;
}
