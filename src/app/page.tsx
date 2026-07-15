// Single-route SPA entry point. The address bar stays at `/` for the whole app;
// this server component will load the notes list at boot and mount the client
// shell (Phase B). For now it is a placeholder while the foundation is built.
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-16">
      <p className="hud-label">notes // foundation</p>
      <h1 className="font-mono text-lg text-muted-strong">
        wiring the data layer
      </h1>
    </main>
  );
}
