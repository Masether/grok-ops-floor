import { Link, createFileRoute } from "@tanstack/react-router";
import { AGENTS } from "@/lib/agents";
import { Button } from "@/components/ui/button";
import { AgentGlyph } from "@/components/floor/glyphs";

const REPO = "https://github.com/Masether/grok-ops-floor";
const PROFILE = "https://github.com/Masether";

export const Route = createFileRoute("/site")({
  head: () => ({
    meta: [
      { title: "ShellOut Bot — live Kraken desk" },
      {
        name: "description",
        content:
          "ShellOut Bot is a live Kraken trading desk. $200 budget. Not financial advice.",
      },
    ],
  }),
  component: SitePage,
});

function SitePage() {
  return (
    <div className="min-h-dvh bg-bg text-fg">
      <SiteNav />
      <main>
        <Hero />
        <WhatItDoes />
        <LayoutWalk />
        <Desks />
        <Bio />
        <Contact />
      </main>
      <SiteFooter />
    </div>
  );
}

function SiteNav() {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-bg/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
        <a href="#top" className="flex min-w-0 items-center gap-2.5">
          <Mark />
          <span className="font-display text-base font-semibold tracking-[0.1em] uppercase">
            ShellOut Bot
          </span>
        </a>
        <nav className="ml-auto flex items-center gap-2">
          <Button asChild size="sm" variant="ghost" className="hidden sm:inline-flex">
            <a href="#what">What</a>
          </Button>
          <Button asChild size="sm" variant="outline">
            <a href={REPO} target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
          </Button>
          <Button asChild size="sm">
            <Link to="/">Open the desk</Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section id="top" className="border-b border-border">
      <div className="mx-auto max-w-3xl px-4 py-14 sm:py-20">
        <p className="font-display text-2xs tracking-[0.22em] text-accent uppercase">
          Live Kraken · $200 budget
        </p>
        <h1 className="font-display mt-3 text-5xl leading-[0.92] font-semibold tracking-[0.04em] uppercase sm:text-6xl">
          ShellOut Bot
        </h1>
        <p className="mt-4 max-w-xl text-lg leading-snug text-muted sm:text-xl">
          Live Kraken desk. $200 budget. Not financial advice.
        </p>
        <div className="mt-8 flex flex-wrap gap-2.5">
          <Button asChild size="lg">
            <Link to="/">Open the desk</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <a href={REPO} target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
          </Button>
        </div>
        <p className="mt-6 max-w-xl text-sm leading-relaxed text-subtle">
          Twelve desks read the tape, size the ticket, and journal fills. Not financial advice. You
          can lose money.
        </p>
      </div>
    </section>
  );
}

function WhatItDoes() {
  const points = [
    {
      k: "01",
      t: "Paper first",
      d: "Live Kraken prices, fake cash. Auto-trade on. Fills say PAPER FILL. No venue cash moves until you go live.",
    },
    {
      k: "02",
      t: "Goal, capital, risk",
      d: "Set a profit target, starting capital, and a risk level (steady / balanced / push). The planner sizes tickets. It does not promise the goal.",
    },
    {
      k: "03",
      t: "Auto-run session",
      d: "Pick 15m, 1h, 4h, 8h, or until you stop. The floor runs the shift; the kill switch is always on the bar.",
    },
    {
      k: "04",
      t: "Charts bubble",
      d: "Candles, RSI, EMA, MACD on the names on the book. Open it from the header when you want the tape, not a second screen.",
    },
    {
      k: "05",
      t: "Desk P&L",
      d: "Equity, day P&L, open tickets, and the blotter live in the desk bubble. Watch the book without leaving the floor.",
    },
    {
      k: "06",
      t: "Live is gated",
      d: "Live only after a human check, venue keys that test clean, and Arm. Withdrawal permission stays off. Paper is the default.",
    },
  ];
  return (
    <section id="what" className="border-b border-border">
      <div className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
        <Kicker>What it does</Kicker>
        <h2 className="font-display mt-2 text-3xl font-semibold tracking-wide uppercase">
          A rehearsal desk. Then, if you choose, a live one.
        </h2>
        <ul className="mt-8 grid gap-3 sm:grid-cols-2">
          {points.map((p) => (
            <li
              key={p.k}
              className="rounded-md bg-surface px-4 py-4 shadow-[0_0_0_1px_var(--color-border)]"
            >
              <div className="font-display text-micro tracking-[0.18em] text-subtle uppercase">
                {p.k}
              </div>
              <h3 className="font-display mt-1 text-lg font-semibold tracking-wide uppercase">
                {p.t}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{p.d}</p>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-sm leading-relaxed text-subtle">
          Not financial advice. Memes can go to zero. Live can lose real USD. There is no guaranteed
          return.
        </p>
      </div>
    </section>
  );
}

function LayoutWalk() {
  const steps = [
    {
      n: "01",
      title: "Launch",
      caption: "Goal, capital, risk, session. Hit the floor.",
      node: <LaunchSketch />,
    },
    {
      n: "02",
      title: "Floor",
      caption: "Twelve desks on the orbit. The tape and the wire underneath.",
      node: <FloorSketch />,
    },
    {
      n: "03",
      title: "Charts bubble",
      caption: "The book, candles, and indicators without leaving the desk.",
      node: <ChartsSketch />,
    },
    {
      n: "04",
      title: "Desk bubble",
      caption: "Equity, day P&L, tickets, blotter.",
      node: <DeskSketch />,
    },
    {
      n: "05",
      title: "Settings / Live",
      caption: "Human check → venue keys → Test → Live → Arm.",
      node: <LiveSketch />,
    },
  ];
  return (
    <section id="layout" className="border-b border-border">
      <div className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
        <Kicker>Layout</Kicker>
        <h2 className="font-display mt-2 text-3xl font-semibold tracking-wide uppercase">
          Launch → Floor → Charts → Desk → Live
        </h2>
        <ol className="mt-8 grid gap-4">
          {steps.map((s) => (
            <li
              key={s.n}
              className="grid gap-3 rounded-md bg-surface p-3 shadow-[0_0_0_1px_var(--color-border)] sm:grid-cols-[minmax(0,1fr)_11rem] sm:items-center"
            >
              <div className="px-1 py-1">
                <div className="font-display text-micro tracking-[0.18em] text-subtle uppercase">
                  {s.n} · {s.title}
                </div>
                <p className="mt-1 text-sm leading-relaxed text-muted">{s.caption}</p>
              </div>
              <div className="min-h-[7.5rem] overflow-hidden rounded-sm bg-bg-1 shadow-[0_0_0_1px_var(--color-border)]">
                {s.node}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Desks() {
  return (
    <section id="desks" className="border-b border-border">
      <div className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
        <Kicker>Twelve desks</Kicker>
        <h2 className="font-display mt-2 text-3xl font-semibold tracking-wide uppercase">
          Each one has a job
        </h2>
        <ul className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {AGENTS.map((a) => (
            <li
              key={a.id}
              className="flex items-start gap-2.5 rounded-sm bg-surface px-3 py-3 shadow-[0_0_0_1px_var(--color-border)]"
            >
              <span className="mt-0.5 shrink-0">
                <AgentGlyph shape={a.shape} color={a.color} size={18} />
              </span>
              <div className="min-w-0">
                <div className="font-display text-xs font-semibold tracking-[0.12em] uppercase">
                  {a.name}
                </div>
                <p className="mt-0.5 text-2xs leading-snug text-muted">{a.role}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Bio() {
  return (
    <section id="bio" className="border-b border-border">
      <div className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
        <Kicker>Bio</Kicker>
        <h2 className="font-display mt-2 text-3xl font-semibold tracking-wide uppercase">
          Built by Masether
        </h2>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-muted">
          Young developer from the Caribbean with a dream and a mission. Free and open to work with
          others.
        </p>
        <p className="mt-4 text-sm text-subtle">
          GitHub:{" "}
          <a
            href={PROFILE}
            target="_blank"
            rel="noopener noreferrer"
            className="text-fg underline decoration-border-strong underline-offset-4 hover:text-info"
          >
            Masether
          </a>
          . Ideas and improvements via GitHub.
        </p>
      </div>
    </section>
  );
}

function Contact() {
  return (
    <section id="contact" className="border-b border-border">
      <div className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
        <Kicker>Contact / ideas</Kicker>
        <h2 className="font-display mt-2 text-3xl font-semibold tracking-wide uppercase">
          Got ideas or improvements?
        </h2>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-muted">
          Open an issue or reach Masether on GitHub. The repo is private — issues may be owner-only,
          so the profile is the open door.
        </p>
        <div className="mt-6 flex flex-wrap gap-2.5">
          <Button asChild>
            <a href={PROFILE} target="_blank" rel="noopener noreferrer">
              github.com/Masether
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href={REPO} target="_blank" rel="noopener noreferrer">
              grok-ops-floor
            </a>
          </Button>
        </div>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="mx-auto max-w-3xl px-4 py-10">
      <p className="text-sm leading-relaxed text-subtle">
        Not financial advice. Private project. You can lose money.
      </p>
      <p className="mt-3 font-display text-2xs tracking-[0.16em] text-subtle uppercase">
        © Masether 2026
      </p>
    </footer>
  );
}

function Kicker({ children }: { children: string }) {
  return <p className="font-display text-2xs tracking-[0.2em] text-accent uppercase">{children}</p>;
}

function Mark() {
  return (
    <span className="grid size-7 place-items-center rounded-sm bg-fg text-bg" aria-hidden>
      <svg viewBox="0 0 16 16" className="size-3.5" fill="currentColor">
        <path d="M1.2 1.2h3.2l4.4 6.1 4.4-6.1h3.2L9.6 8.4 16 16h-3.3L8.8 10.6 4.4 16H1.2l6.4-7.6z" />
      </svg>
    </span>
  );
}

function LaunchSketch() {
  return (
    <div className="flex h-full flex-col justify-center gap-1.5 p-3">
      <SketchLine label="Goal" value="target" />
      <SketchLine label="Capital" value="$200 live sleeve" />
      <SketchLine label="Risk" value="steady · balanced · push" />
      <SketchLine label="Session" value="15m → until stop" />
    </div>
  );
}

function FloorSketch() {
  return (
    <div className="relative flex h-full items-center justify-center p-3">
      <div className="grid grid-cols-4 gap-1.5">
        {AGENTS.map((a) => (
          <span
            key={a.id}
            className="size-2.5 rounded-full"
            style={{ background: a.color }}
            title={a.name}
          />
        ))}
      </div>
    </div>
  );
}

function ChartsSketch() {
  return (
    <svg viewBox="0 0 176 120" className="h-full w-full" aria-hidden>
      <rect width="176" height="120" fill="#08090f" />
      <polyline
        fill="none"
        stroke="#4db8ff"
        strokeWidth="1.4"
        points="8,78 22,70 36,74 50,52 64,58 78,40 92,46 106,34 120,42 134,28 148,36 168,22"
      />
      <polyline
        fill="none"
        stroke="#3dffc8"
        strokeWidth="1"
        opacity="0.7"
        points="8,86 22,82 36,84 50,76 64,78 78,70 92,72 106,66 120,68 134,62 148,64 168,58"
      />
      <line x1="8" y1="96" x2="168" y2="96" stroke="rgba(255,255,255,0.08)" />
    </svg>
  );
}

function DeskSketch() {
  return (
    <div className="flex h-full flex-col justify-center gap-2 p-3">
      <SketchLine label="Equity" value="desk" />
      <SketchLine label="Day P&L" value="+ / −" />
      <SketchLine label="Open" value="tickets" />
      <SketchLine label="Blotter" value="fills" />
    </div>
  );
}

function LiveSketch() {
  const steps = ["Human", "Keys", "Test", "Live", "Arm"];
  return (
    <div className="flex h-full flex-col justify-center gap-1.5 p-3">
      {steps.map((s, i) => (
        <div key={s} className="flex items-center gap-2">
          <span className="stat-num w-4 text-micro text-subtle">{String(i + 1)}</span>
          <span className="font-display text-2xs tracking-[0.14em] uppercase">{s}</span>
        </div>
      ))}
    </div>
  );
}

function SketchLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="font-display text-micro tracking-[0.14em] text-subtle uppercase">
        {label}
      </span>
      <span className="stat-num truncate text-2xs text-muted">{value}</span>
    </div>
  );
}
