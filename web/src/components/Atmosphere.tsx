// Ambient atmosphere layer: off-center gold glow + masked dot-grid + fine grain.
// Sits behind everything (-z-10). Turns flat near-black into a lit, textured room.
// Sources: radial ambient light (silphiumdesign.com), grainy gradients (css-tricks.com),
// masked dot backgrounds (ibelick.com).

const NOISE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E";

export function Atmosphere() {
  return (
    <div aria-hidden className="atmosphere pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* gold ambient glow, off-center top */}
      <div
        className="absolute left-1/2 top-[-28vh] h-[70vh] w-[85vw] -translate-x-1/2"
        style={{ background: "radial-gradient(closest-side, rgba(242,179,60,0.13), transparent)" }}
      />
      {/* faint violet counter-glow, bottom-left */}
      <div
        className="absolute bottom-[-25%] left-[-12%] h-[55vh] w-[55vw]"
        style={{ background: "radial-gradient(closest-side, rgba(169,112,255,0.07), transparent)" }}
      />
      {/* masked dot grid */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
          maskImage: "radial-gradient(ellipse 95% 65% at 50% 0%, #000 22%, transparent 78%)",
          WebkitMaskImage: "radial-gradient(ellipse 95% 65% at 50% 0%, #000 22%, transparent 78%)",
        }}
      />
      {/* fine grain (Raycast move) */}
      <div
        className="absolute inset-0 opacity-[0.04] mix-blend-overlay"
        style={{ backgroundImage: `url("${NOISE}")` }}
      />
    </div>
  );
}
