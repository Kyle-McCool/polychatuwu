import { useRef } from "react";

/** Thin draggable divider for resizing a panel column. Reports incremental dx. */
export function ResizeHandle({ side, onDelta }: { side: "left" | "right"; onDelta: (dx: number) => void }) {
  const last = useRef(0);
  function down(e: React.PointerEvent) {
    e.preventDefault();
    last.current = e.clientX;
    const move = (ev: PointerEvent) => {
      onDelta(ev.clientX - last.current);
      last.current = ev.clientX;
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }
  return (
    <div
      onPointerDown={down}
      title="Drag to resize"
      className={`absolute top-0 z-20 h-full w-1.5 cursor-col-resize bg-transparent transition hover:bg-accent/40 ${
        side === "left" ? "right-0" : "left-0"
      }`}
    />
  );
}
