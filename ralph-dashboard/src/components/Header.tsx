export function Header() {
  return (
    <header className="bg-claude-dark text-white py-4 px-6 shadow-lg">
      <div className="max-w-7xl mx-auto flex items-center gap-3">
        <div className="text-3xl">🔄</div>
        <div>
          <h1 className="text-2xl font-bold">Ralph Dashboard</h1>
          <p className="text-claude-cream/70 text-sm">
            Monitor and manage Ralph Wiggum loops
          </p>
        </div>
      </div>
    </header>
  );
}
