import { useEffect, useState, type ComponentType, type CSSProperties } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { defaultDeskMods, saveDeskMods } from "@/lib/desk-mods";

export const Route = createFileRoute("/")({
  component: Boot,
});

const page: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 40,
  display: "grid",
  placeItems: "center",
  background: "#05060a",
  color: "#e8edf5",
  fontFamily: "system-ui, sans-serif",
  padding: 24,
};

function Boot() {
  const [Shell, setShell] = useState<ComponentType | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    saveDeskMods(defaultDeskMods());
    let on = true;
    void import("@/components/floor/ops-shell")
      .then((m) => {
        if (on) setShell(() => m.OpsShell);
      })
      .catch((e) => {
        setErr(e instanceof Error ? e.message : "Floor failed to load");
      });
    return () => {
      on = false;
    };
  }, []);

  if (Shell) return <Shell />;

  return (
    <div style={page}>
      <div style={{ textAlign: "center", maxWidth: 360 }}>
        <p style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>MaSether desk</p>
        <p style={{ fontSize: 14, color: "#c5cadd", marginTop: 10 }}>
          {err ?? "Heat · all Kraken memes · follow the spike."}
        </p>
        {err ? (
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              marginTop: 16,
              minHeight: 44,
              padding: "0 18px",
              border: "none",
              borderRadius: 8,
              background: "#ff4d6a",
              color: "#05060a",
              fontWeight: 700,
            }}
          >
            Reload
          </button>
        ) : null}
      </div>
    </div>
  );
}
