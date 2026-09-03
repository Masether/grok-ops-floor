import { createServerFn } from "@tanstack/react-start";

export const secondRead = createServerFn({ method: "POST" })
  .validator(
    (input: {
      pair: string;
      price: number;
      changePct: number;
      rsi: number;
      reason: string;
      kind: string;
      equity: number;
      exposure: number;
    }) => input,
  )
  .handler(async ({ data }) => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return { ok: false as const, error: "Second read is offline" };

    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-4.5",
        max_tokens: 220,
        temperature: 0.4,
        messages: [
          {
            role: "system",
            content:
              "You are SENTINEL on a crypto ops floor. Give a terse second-read on a Kraken spot signal. 4 short lines max. No hype. State approve, size-down, or reject.",
          },
          {
            role: "user",
            content: JSON.stringify(data),
          },
        ],
      }),
    });
    if (!res.ok) return { ok: false as const, error: `xAI ${res.status}` };
    const body = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return { ok: true as const, text: body.choices?.[0]?.message?.content ?? "" };
  });

export const askBrain = createServerFn({ method: "POST" })
  .validator((input: { prompt: string; context: string }) => input)
  .handler(async ({ data }) => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return { ok: false as const, error: "offline" };

    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-4.5",
        max_tokens: 140,
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content:
              "You are the ShellOut Bot brain. Rapid desk chat. 2-4 short lines. Use the stored pattern memory. No hype. Not financial advice. Live Kraken desk.",
          },
          { role: "user", content: `${data.context}\n\nQ: ${data.prompt}` },
        ],
      }),
    });
    if (!res.ok) return { ok: false as const, error: `xAI ${res.status}` };
    const body = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return { ok: true as const, text: body.choices?.[0]?.message?.content ?? "" };
  });
