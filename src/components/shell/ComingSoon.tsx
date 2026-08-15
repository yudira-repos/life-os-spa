export function ComingSoon({ moduleName, tagline }: { moduleName: string; tagline: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-24 text-center">
      <p className="text-4xl">🚧</p>
      <p className="text-lg font-semibold">{moduleName} is coming soon.</p>
      <p className="text-sm text-neutral-400">{tagline}</p>
      <p className="text-xs text-neutral-600">
        It&apos;s already registered as a module — this route, its icon, and
        its entitlement all exist — the real workflows just aren&apos;t built yet.
      </p>
    </div>
  );
}
