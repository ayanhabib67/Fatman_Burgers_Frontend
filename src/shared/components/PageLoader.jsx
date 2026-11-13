export default function PageLoader({ label = 'Loading module...' }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-[var(--color-muted)]">
      <div className="loader-orbit" aria-hidden="true" />
      <p className="text-sm">{label}</p>
    </div>
  );
}
