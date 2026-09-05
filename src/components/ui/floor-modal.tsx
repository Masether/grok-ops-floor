import { useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/**
 * Opaque modal on document.body.
 * Safari can glass fixed panels over the orbit canvas when any ancestor
 * (or a semi-transparent dim) creates a filter/opacity group. This modal
 * uses a fully opaque scrim + inline solid fills — no alpha, no backdrop-filter,
 * no reliance on CSS-file classes for the paint that must stay solid.
 */
export function FloorModal({
  open,
  onClose,
  labelledBy,
  panelClassName,
  children,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  panelClassName?: string;
  children: ReactNode;
}) {
  const [mount, setMount] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    setMount(document.body);
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open || !mount) return null;

  return createPortal(
    <div
      className="floor-modal-root"
      role="presentation"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483000,
        display: "grid",
        placeItems: "center",
        padding: 16,
        // Fully opaque — never rgba / opacity. Floor must not show through.
        background: "#05060a",
        WebkitBackdropFilter: "none",
        backdropFilter: "none",
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={cn("floor-modal-panel", panelClassName)}
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          width: "100%",
          maxWidth: panelClassName?.includes("max-w-5xl")
            ? "64rem"
            : panelClassName?.includes("max-w-lg")
              ? "32rem"
              : "42rem",
          maxHeight: "92dvh",
          flexDirection: "column",
          overflow: "hidden",
          borderRadius: 16,
          background: "#181b28",
          backgroundColor: "#181b28",
          color: "#e8edf5",
          opacity: 1,
          WebkitBackdropFilter: "none",
          backdropFilter: "none",
          boxShadow: "0 0 0 1px rgb(255 255 255 / 0.14), 0 24px 80px rgb(0 0 0 / 0.85)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    mount,
  );
}
