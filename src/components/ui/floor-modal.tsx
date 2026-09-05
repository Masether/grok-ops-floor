import { useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/**
 * Opaque modal on document.body.
 * Safari treats `position:fixed` inside overflow/filter parents as a
 * backdrop-filter group, so Tailwind `bg-surface-3` on the desk looked like glass.
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
    <div className="floor-modal-root" role="presentation">
      <div className="floor-modal-dim" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={cn("floor-modal-panel", panelClassName)}
        style={{
          backgroundColor: "#181b28",
          backgroundImage: "none",
          color: "#e8edf5",
          opacity: 1,
          isolation: "isolate",
          WebkitBackdropFilter: "none",
          backdropFilter: "none",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="relative z-[1] flex min-h-0 min-w-0 flex-1 flex-col"
          style={{ backgroundColor: "#181b28", opacity: 1 }}
        >
          {children}
        </div>
      </div>
    </div>,
    mount,
  );
}
