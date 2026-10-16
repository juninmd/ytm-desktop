export function Eq({ paused = false }: { paused?: boolean }) {
  return (
    <span className="eq text-accent" data-paused={paused ? "true" : "false"} aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}
