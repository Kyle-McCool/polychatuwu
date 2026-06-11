// Flat base layer. The brand is deliberately flat — no glow, no grain, no dot-grid (those
// read as AI tells). This is just the solid canvas with a single, barely-there neutral top
// sheen for the faintest sense of depth. Sits behind everything (-z-10).

export function Atmosphere() {
  return (
    <div aria-hidden className="atmosphere pointer-events-none fixed inset-0 -z-10">
      <div
        className="absolute inset-x-0 top-0 h-[38vh]"
        style={{ background: "linear-gradient(to bottom, rgba(255,255,255,0.018), transparent)" }}
      />
    </div>
  );
}
