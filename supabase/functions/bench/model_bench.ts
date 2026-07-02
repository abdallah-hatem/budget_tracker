// Throwaway benchmark: score candidate Groq models against the REAL prod prompts
// (buildRequestBody / buildManyRequestBody) before swapping GROQ_MODEL.
// Run: GROQ_API_KEY=... deno run --allow-env --allow-net bench/model_bench.ts
// NOT deployed — lives under functions/bench so `supabase functions deploy` ignores it.

import { buildRequestBody, buildManyRequestBody } from "../_shared/categorize.ts";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const KEY = Deno.env.get("GROQ_API_KEY");
if (!KEY) {
  console.error("GROQ_API_KEY not set");
  Deno.exit(1);
}

// Finalists only. Dropped gpt-oss-20b / qwen3.6-27b / qwen3-32b: all returned
// HTTP 400 "Failed to validate JSON" under response_format:json_object (the mode
// all 3 prod functions rely on) — reasoning models that don't fit our config.
const MODELS = [
  "llama-3.3-70b-versatile", // baseline (decommissioned 2026-08-16)
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "openai/gpt-oss-120b",
];

type Locale = "en" | "ar";

// --- SMS (single-item) golden set: amount, direction, kind, category ---
interface SmsCase {
  id: string;
  text: string;
  locale: Locale;
  amount?: number; // expected amount when it's a real txn (skip for offer/other)
  type?: "expense" | "income";
  kind: "transaction" | "offer" | "other";
  cat?: string[]; // acceptable category slugs (loose); omit to skip
}

// Shrunk to 6 highest-signal SMS cases (free-tier TPM budget): comma-sep debit,
// space-sep amount, income direction, fuel-category edge, offer, traffic-fine.
const SMS: SmsCase[] = [
  { id: "ar-debit-comma", text: "تم خصم مبلغ 1,250.00 جنيه من حسابك رقم xxxx1234 لدى كارفور", locale: "ar", amount: 1250, type: "expense", kind: "transaction" },
  { id: "ar-space-sep", text: "عملية شراء بمبلغ 2 500 ج.م من نون", locale: "ar", amount: 2500, type: "expense", kind: "transaction" },
  { id: "ar-salary-comma", text: "تم إضافة مبلغ 15,000 EGP الى حسابك - راتب شهر يوليو", locale: "ar", amount: 15000, type: "income", kind: "transaction", cat: ["salary", "other_income", "transfer_in"] },
  { id: "en-fuel-pos", text: "POS Purchase EGP 300 at MOBIL NASR RD approved", locale: "en", amount: 300, type: "expense", kind: "transaction", cat: ["transport"] },
  { id: "en-zara-offer", text: "Enjoy 15% Moneyback on your Zara purchase, capped at EGP 1,500. T&Cs apply.", locale: "en", kind: "offer" },
  { id: "ar-fine", text: "النيابة العامة: تم تسجيل مخالفة بقيمه 200.00 اجمالي المخالفات 10420.00 - ادفع مخالفاتك", locale: "ar", kind: "other" },
];

// --- Voice/type (multi-item) golden set: splitting + amounts + direction ---
interface VoiceCase {
  id: string;
  text: string;
  locale: Locale;
  amounts: number[]; // expected amounts (as a set)
  types?: ("expense" | "income")[];
}

// 2 voice cases: 3-item split + colloquial thousands ("سبعة الاف وخمسمية" = 7500).
const VOICE: VoiceCase[] = [
  { id: "v-3items", text: "اتغديت بتمانين جنيه وشربت قهوة بخمسة وعشرين وركبت تاكسي باربعين", locale: "ar", amounts: [80, 25, 40] },
  { id: "v-thousands", text: "اشتريت تلاجة بسبعة الاف وخمسمية", locale: "ar", amounts: [7500] },
];

interface Row { model: string; call: number; jsonOk: number; amount: number; type: number; kind: number; split: number; cat: number; catN: number; ms: number; fails: string[]; }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function callModel(model: string, body: Record<string, unknown>): Promise<{ obj: any; ms: number; err?: string }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const t0 = performance.now();
    try {
      const res = await fetch(GROQ_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${KEY}`, "content-type": "application/json" },
        body: JSON.stringify({ ...body, model }),
      });
      const ms = performance.now() - t0;
      if (res.status === 429) {
        const txt = await res.text();
        const wait = parseFloat(txt.match(/try again in ([\d.]+)s/)?.[1] ?? "5");
        await sleep(Math.min(wait * 1000 + 500, 30000));
        continue; // retry
      }
      if (!res.ok) {
        const txt = await res.text();
        // Surface the failed_generation snippet for JSON-mode (400) failures.
        let detail = txt.slice(0, 100);
        try {
          const j = JSON.parse(txt);
          detail = (j.error?.failed_generation ?? j.error?.message ?? txt).slice(0, 100);
        } catch { /* keep raw */ }
        return { obj: null, ms, err: `HTTP ${res.status}: ${detail.replace(/\n/g, " ")}` };
      }
      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content ?? "";
      try {
        return { obj: JSON.parse(content), ms };
      } catch {
        return { obj: null, ms, err: `bad JSON: ${String(content).slice(0, 80)}` };
      }
    } catch (e) {
      return { obj: null, ms: performance.now() - t0, err: String(e).slice(0, 100) };
    }
  }
  return { obj: null, ms: 0, err: "rate-limited (gave up after 5 tries)" };
}

const near = (a: unknown, b: number) => typeof a === "number" && Math.abs(a - b) < 0.01;

async function run() {
  const rows: Record<string, Row> = {};
  for (const m of MODELS) rows[m] = { model: m, call: 0, jsonOk: 0, amount: 0, type: 0, kind: 0, split: 0, cat: 0, catN: 0, ms: 0, fails: [] };

  for (const m of MODELS) {
    const r = rows[m];
    // SMS
    for (const c of SMS) {
      await sleep(9000); // pace to stay under free-tier RPM
      const { obj, ms, err } = await callModel(m, buildRequestBody(c.text, c.locale, []));
      r.call++; r.ms += ms;
      if (!obj || typeof obj !== "object") { r.fails.push(`${c.id}:${err ?? "no-json"}`); continue; }
      r.jsonOk++;
      if (obj.kind === c.kind) r.kind++; else r.fails.push(`${c.id}:kind=${obj.kind}≠${c.kind}`);
      if (c.type) { if (obj.type === c.type) r.type++; else r.fails.push(`${c.id}:type=${obj.type}`); }
      if (typeof c.amount === "number") { if (near(obj.amount, c.amount)) r.amount++; else r.fails.push(`${c.id}:amt=${obj.amount}≠${c.amount}`); }
      if (c.cat) { r.catN++; if (c.cat.includes(obj.category_slug)) r.cat++; else r.fails.push(`${c.id}:cat=${obj.category_slug}`); }
    }
    // Voice
    for (const c of VOICE) {
      await sleep(9000); // pace to stay under free-tier RPM
      const { obj, ms, err } = await callModel(m, buildManyRequestBody(c.text, c.locale, []));
      r.call++; r.ms += ms;
      const txns = obj?.transactions;
      if (!Array.isArray(txns)) { r.fails.push(`${c.id}:${err ?? "no-array"}`); continue; }
      r.jsonOk++;
      if (txns.length === c.amounts.length) r.split++; else r.fails.push(`${c.id}:n=${txns.length}≠${c.amounts.length}`);
      const got = txns.map((t: any) => t.amount);
      const matched = c.amounts.filter((a) => got.some((g: number) => near(g, a))).length;
      r.amount += matched / c.amounts.length; // fractional credit
      if (c.types) { const ok = c.types.every((ty) => txns.some((t: any) => t.type === ty)); if (ok) r.type++; }
    }
  }

  // --- Report ---
  const smsAmt = SMS.filter((c) => typeof c.amount === "number").length;
  const smsType = SMS.filter((c) => c.type).length;
  const smsKind = SMS.length;
  const totalCalls = SMS.length + VOICE.length;
  console.log(`\nGolden set: ${SMS.length} SMS + ${VOICE.length} voice = ${totalCalls} cases/model\n`);
  const header = ["model", "json", "amount", "type", "kind", "split", "cat", "avg_ms"];
  console.log(header.map((h) => h.padEnd(h === "model" ? 42 : 8)).join(""));
  for (const m of MODELS) {
    const r = rows[m];
    const amtDenom = smsAmt + VOICE.length; // sms amounts + voice fractional
    const line = [
      m.padEnd(42),
      `${r.jsonOk}/${totalCalls}`.padEnd(8),
      `${r.amount.toFixed(1)}/${amtDenom}`.padEnd(8),
      `${r.type}/${smsType + VOICE.filter((v) => v.types).length}`.padEnd(8),
      `${r.kind}/${smsKind}`.padEnd(8),
      `${r.split}/${VOICE.length}`.padEnd(8),
      `${r.cat}/${r.catN}`.padEnd(8),
      `${Math.round(r.ms / r.call)}`.padEnd(8),
    ];
    console.log(line.join(""));
  }
  console.log("\n--- failures per model ---");
  for (const m of MODELS) {
    console.log(`\n${m}:`);
    console.log(rows[m].fails.length ? "  " + rows[m].fails.join("\n  ") : "  (none)");
  }
}

await run();
