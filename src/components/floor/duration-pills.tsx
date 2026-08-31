import { Button } from "@/components/ui/button";
import { SESSION_PRESETS } from "@/lib/session";

export function DurationPills({
  value,
  onChange,
}: {
  value: number;
  onChange: (minutes: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {SESSION_PRESETS.map((p) => (
        <Button
          key={p.minutes}
          type="button"
          size="micro"
          variant={value === p.minutes ? "default" : "outline"}
          onClick={() => onChange(p.minutes)}
        >
          {p.label}
        </Button>
      ))}
    </div>
  );
}
