// Edge Function: budget-check
// Invoked once daily by pg_cron + pg_net. For every user with budgets (or
// enough history for insights) it aggregates this cycle's CONFIRMED expense
// spend, evaluates thresholds / pace / insights, drops anything already sent
// this cycle, and delivers AT MOST ONE push per user.
//
// Every DB/network touch is behind `deps` so the tests run with no network.
//
// NOTE: this file contains ONLY the pure handler (`handleBudgetCheck`) and its
// types. The production `Deno.serve` wiring, Supabase client construction, and
// real dependency implementations are Task 7's job, not this one.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { cycleFor, type Cycle } from "../_shared/budgetCycles.ts";
import {
  detectInsights,
  evaluateBudget,
  type AlertDescriptor,
  type BudgetRow,
  type CategoryHistory,
} from "../_shared/budgetEval.ts";

export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface ActiveUser {
  userId: string;
  monthStartDay: number;
  locale: string;
}

export interface SentAlert {
  budget_id: string | null;
  kind: string;
  cycle_key: string;
  category_slug: string | null;
}

export interface AlertRow {
  user_id: string;
  budget_id: string | null;
  kind: string;
  cycle_key: string;
  category_slug: string | null;
  meta: Record<string, unknown>;
}

export interface BudgetCheckDeps {
  now: () => Date;
  listActiveUsers: () => Promise<ActiveUser[]>;
  listBudgets: (userId: string) => Promise<BudgetRow[]>;
  getCycleSpend: (
    userId: string,
    start: Date,
    end: Date,
  ) => Promise<{ overall: number; byCategory: Record<string, number> }>;
  getCategoryHistory: (userId: string, cycle: Cycle) => Promise<CategoryHistory[]>;
  listSentAlerts: (userId: string, cycleKeys: string[]) => Promise<SentAlert[]>;
  recordAlerts: (userId: string, rows: AlertRow[]) => Promise<void>;
  getPushTokens: (userId: string) => Promise<string[]>;
  sendPush: (messages: ExpoPushMessage[]) => Promise<void>;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Identity of an alert for dedup purposes — mirrors the DB unique index. */
function dedupKey(a: { budget_id?: string | null; budgetId?: string | null; kind: string; cycle_key?: string; cycleKey?: string; category_slug?: string | null; categorySlug?: string | null }): string {
  const budget = a.budget_id ?? a.budgetId ?? "";
  const cycle = a.cycle_key ?? a.cycleKey ?? "";
  const cat = a.category_slug ?? a.categorySlug ?? "";
  return `${budget}|${a.kind}|${cycle}|${cat}`;
}

/** Short human line per alert; the push body joins these with " · ". */
export function alertLine(a: AlertDescriptor, label: string): string {
  const m = a.meta as Record<string, number>;
  switch (a.kind) {
    case "exceeded": return `${label} over by E£${m.over}`;
    case "reached": return `${label} at 100%`;
    case "approaching": return `${label} ${m.pct}%`;
    case "pace": return `${label} on pace +E£${m.over}`;
    case "insight_spike": return `${label} up ${m.pctAbove}%`;
    case "insight_frequency": return `${label} ${m.count}x this week`;
    default: return label;
  }
}

export async function handleBudgetCheck(
  req: Request,
  deps: BudgetCheckDeps,
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed. Use POST." }, 405);
  }

  const now = deps.now();
  const users = await deps.listActiveUsers();
  let notified = 0;

  for (const user of users) {
    // One user's failure must never abort the whole run.
    try {
      const budgets = await deps.listBudgets(user.userId);
      const monthly = cycleFor("monthly", now, user.monthStartDay);
      const weekly = cycleFor("weekly", now, user.monthStartDay);

      // Spend per cycle kind — fetched once each, not per budget.
      const monthlySpend = await deps.getCycleSpend(user.userId, monthly.start, monthly.end);
      const weeklySpend = budgets.some((b) => b.period === "weekly")
        ? await deps.getCycleSpend(user.userId, weekly.start, weekly.end)
        : { overall: 0, byCategory: {} as Record<string, number> };

      const descriptors: Array<AlertDescriptor & { cycleKey: string }> = [];

      for (const b of budgets) {
        const cycle = b.period === "weekly" ? weekly : monthly;
        const spendSet = b.period === "weekly" ? weeklySpend : monthlySpend;
        const spend = b.scope === "overall"
          ? spendSet.overall
          : spendSet.byCategory[b.category_slug ?? ""] ?? 0;
        const d = evaluateBudget(b, spend, cycle);
        if (d) descriptors.push({ ...d, cycleKey: cycle.key });
      }

      const history = await deps.getCategoryHistory(user.userId, monthly);
      for (const d of detectInsights(history, monthly)) {
        descriptors.push({ ...d, cycleKey: monthly.key });
      }

      // Drop anything already sent for this cycle. Fetched even when there
      // are no fresh descriptors, and tokens fetched once up front, because
      // the weekly recap below must still run (and still needs both) when
      // no threshold alert fired this cycle.
      const sent = await deps.listSentAlerts(user.userId, [monthly.key, weekly.key]);
      const seen = new Set(sent.map(dedupKey));
      const fresh = descriptors.filter((d) => !seen.has(dedupKey(d)));
      const tokensForRecap = await deps.getPushTokens(user.userId);

      if (fresh.length > 0) {
        const alertRows: AlertRow[] = fresh.map((d) => ({
          user_id: user.userId,
          budget_id: d.budgetId,
          kind: d.kind,
          cycle_key: d.cycleKey,
          category_slug: d.categorySlug,
          meta: d.meta,
        }));

        if (tokensForRecap.length === 0) {
          // Nothing can be delivered — record so the dedup filter still applies.
          await deps.recordAlerts(user.userId, alertRows);
        } else {
          // ONE push per user: join the top few lines, noting any hidden overflow.
          const shown = fresh.slice(0, 3);
          const hidden = fresh.length - shown.length;
          const body = shown
            .map((d) => alertLine(d, d.categorySlug ?? "Overall"))
            .join(" · ") + (hidden > 0 ? ` +${hidden} more` : "");

          // Send BEFORE recording: for a once-daily job, a duplicate
          // notification (if recording fails after a successful send) is far
          // less harmful than an alert that silently never gets delivered
          // because it was already marked as sent before the push actually
          // went out.
          await deps.sendPush(
            tokensForRecap.map((to) => ({
              to,
              title: "Budget check",
              body,
              data: { url: "/budgets" },
            })),
          );
          await deps.recordAlerts(user.userId, alertRows);
          notified++;
        }
      }

      // --- Weekly recap: a standing digest on the first run of a new week. ---
      // Sent independently of thresholds (it is a status report, not an
      // alarm) as a SEPARATE push from the one above, and deduped by the
      // weekly cycle key via the same `budget_alerts` ledger (kind: "recap",
      // budget_id/category_slug: null), so it fires at most once per week.
      //
      // Gated to the first 24h of the weekly cycle (normally Saturday) so it
      // reads as a start-of-week digest rather than firing whenever a user
      // happens to first run the check that week. Accepted tradeoff: if the
      // daily job is down through that whole window, the recap is skipped
      // for that week entirely (the dedup ledger prevents it firing late).
      const isWeekStart = now.getTime() - weekly.start.getTime() < 86_400_000;
      if (isWeekStart && budgets.length > 0) {
        const recapKey = dedupKey({ budgetId: null, kind: "recap", cycleKey: weekly.key, categorySlug: null });
        const alreadySent = seen.has(recapKey);
        if (!alreadySent) {
          // Full set of lines, highest percentage-of-cap first (most relevant
          // to the user) — this complete list is what gets RECORDED below.
          const lines = budgets
            .map((b) => {
              const set = b.period === "weekly" ? weeklySpend : monthlySpend;
              const spend = b.scope === "overall"
                ? set.overall
                : set.byCategory[b.category_slug ?? ""] ?? 0;
              const pct = b.amount > 0 ? Math.round((spend / b.amount) * 100) : 0;
              return { label: b.category_slug ?? "Overall", pct };
            })
            .sort((a, b) => b.pct - a.pct)
            .map((s) => `${s.label} ${s.pct}%`);

          // Cap the PUSH BODY only (same rationale as the alert path above: a
          // user with many budgets would otherwise get a push body the OS
          // truncates unreadably). The recorded meta below keeps every line.
          const shown = lines.slice(0, 4);
          const hidden = lines.length - shown.length;
          const body = shown.join(" · ") + (hidden > 0 ? ` +${hidden} more` : "");

          // Send BEFORE recording, same rationale as the alert push above.
          if (tokensForRecap.length > 0) {
            await deps.sendPush(tokensForRecap.map((to) => ({
              to,
              title: "Weekly recap",
              body,
              data: { url: "/budgets" },
            })));
          }
          await deps.recordAlerts(user.userId, [{
            user_id: user.userId,
            budget_id: null,
            kind: "recap",
            cycle_key: weekly.key,
            category_slug: null,
            meta: { lines },
          }]);
        }
      }
    } catch (_e) {
      continue;
    }
  }

  return json({ ok: true, users: users.length, notified }, 200);
}

// --- Production wiring (skipped under test, which imports the handler only) ---
if (import.meta.main) {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  // Fetch every row of a query in pages of 1000 (PostgREST's default row cap),
  // looping until a page comes back short. Avoids silently truncating a heavy
  // user's transactions to the first page.
  async function fetchAllPages<T>(
    build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  ): Promise<T[]> {
    const pageSize = 1000;
    const all: T[] = [];
    let offset = 0;
    for (;;) {
      const { data, error } = await build(offset, offset + pageSize - 1);
      if (error) throw new Error(error.message);
      const page = data ?? [];
      all.push(...page);
      if (page.length < pageSize) break;
      offset += pageSize;
    }
    return all;
  }

  const deps: BudgetCheckDeps = {
    now: () => new Date(),

    async listActiveUsers() {
      // Users holding at least one budget. Insight-only users are out of scope
      // for v1 delivery: without a budget there is no opt-in signal to notify.
      //
      // There is no FK between budgets and profiles (both independently
      // reference auth.users), so PostgREST cannot embed profiles!inner off
      // budgets — that previously failed with PGRST200 and (since the error
      // was discarded) silently produced zero active users. Do it as two
      // plain queries instead, joined in JS.
      const { data: budgetRows, error: budgetsError } = await supabase
        .from("budgets")
        .select("user_id");
      if (budgetsError) throw new Error(budgetsError.message);
      const ids = [...new Set((budgetRows ?? []).map((r) => r.user_id as string))];
      if (ids.length === 0) return [];

      const { data: profileRows, error: profilesError } = await supabase
        .from("profiles")
        .select("id, month_start_day, locale")
        .in("id", ids);
      if (profilesError) throw new Error(profilesError.message);

      const profiles = new Map(
        (profileRows ?? []).map((p) => [
          p.id as string,
          p as { month_start_day?: number; locale?: string },
        ]),
      );
      return ids.map((id) => {
        const p = profiles.get(id);
        return {
          userId: id,
          monthStartDay: p?.month_start_day ?? 1,
          locale: p?.locale ?? "en",
        };
      });
    },

    async listBudgets(userId) {
      const { data } = await supabase
        .from("budgets")
        .select("id, scope, category_slug, period, amount, warn_pct")
        .eq("user_id", userId);
      return (data ?? []).map((b) => ({ ...b, amount: Number(b.amount) })) as BudgetRow[];
    },

    async getCycleSpend(userId, start, end) {
      const rows = await fetchAllPages<{ amount: number; category_slug: string }>((from, to) =>
        supabase
          .from("transactions")
          .select("amount, category_slug")
          .eq("user_id", userId)
          .eq("status", "confirmed")
          .eq("type", "expense")
          .gte("occurred_at", start.toISOString())
          .lt("occurred_at", end.toISOString())
          .range(from, to)
      );
      let overall = 0;
      const byCategory: Record<string, number> = {};
      for (const t of rows) {
        const amt = Number(t.amount) || 0;
        overall += amt;
        byCategory[t.category_slug] = (byCategory[t.category_slug] ?? 0) + amt;
      }
      return { overall, byCategory };
    },

    async getCategoryHistory(userId, cycle) {
      // Trailing 3 months before this cycle started, for the baseline average.
      const histStart = new Date(cycle.start);
      histStart.setUTCMonth(histStart.getUTCMonth() - 3);
      const rows = await fetchAllPages<{ amount: number; category_slug: string; occurred_at: string }>(
        (from, to) =>
          supabase
            .from("transactions")
            .select("amount, category_slug, occurred_at")
            .eq("user_id", userId)
            .eq("status", "confirmed")
            .eq("type", "expense")
            .gte("occurred_at", histStart.toISOString())
            .lt("occurred_at", cycle.end.toISOString())
            .range(from, to),
      );

      // Anchor the trailing-7-day "frequency" window to NOW, not cycle.end:
      // for a monthly cycle, cycle.end is the EXCLUSIVE end (start of next
      // month) — a future date — which put weekStart in the last week of the
      // month instead of the trailing week from today, leaving weekCount at 0
      // for most of the month.
      const now = new Date();
      const weekStart = new Date(now.getTime() - 7 * 86_400_000);
      const acc = new Map<string, { cycleSpend: number; histSpend: number; weekCount: number; histCount: number }>();
      for (const t of rows) {
        const at = new Date(t.occurred_at);
        const amt = Number(t.amount) || 0;
        const e = acc.get(t.category_slug) ?? { cycleSpend: 0, histSpend: 0, weekCount: 0, histCount: 0 };
        if (at >= cycle.start) {
          e.cycleSpend += amt;
        } else {
          e.histSpend += amt;
          e.histCount++;
        }
        if (at >= weekStart) e.weekCount++;
        acc.set(t.category_slug, e);
      }
      return [...acc.entries()].map(([categorySlug, e]) => ({
        categorySlug,
        cycleSpend: e.cycleSpend,
        avg3mMonthly: e.histSpend / 3,
        weekCount: e.weekCount,
        avgWeekCount: e.histCount / 13, // ~13 weeks in 3 months
      }));
    },

    async listSentAlerts(userId, cycleKeys) {
      const { data } = await supabase
        .from("budget_alerts")
        .select("budget_id, kind, cycle_key, category_slug")
        .eq("user_id", userId)
        .in("cycle_key", cycleKeys);
      return (data ?? []) as SentAlert[];
    },

    async recordAlerts(_userId, rows) {
      // Plain insert, not upsert: budget_alerts_dedup_idx is an EXPRESSION
      // index (coalesce(...) on budget_id/category_slug), and PostgREST's
      // onConflict only accepts column names, so it can't target it — an
      // upsert here silently targets the PRIMARY KEY (a fresh uuid per row)
      // instead and never actually collides. With a plain insert, a genuine
      // duplicate raises 23505 against the real dedup index; since the push
      // was already sent by the time we get here, that IS the desired
      // outcome (already recorded for this cycle), so treat it as success.
      const { error } = await supabase.from("budget_alerts").insert(rows);
      if (error && error.code !== "23505") throw new Error(error.message);
    },

    async getPushTokens(userId) {
      const { data } = await supabase
        .from("push_tokens")
        .select("token")
        .eq("user_id", userId);
      return (data ?? []).map((r: { token: string }) => r.token);
    },

    async sendPush(messages) {
      await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(messages),
      });
    },
  };

  Deno.serve((req) => handleBudgetCheck(req, deps));
}
