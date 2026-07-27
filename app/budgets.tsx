import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Screen, Card, AppText, Money, CategoryAvatar, PressableScale, EmptyState } from '@/src/ui';
import { useSession } from '@/src/features/auth/SessionProvider';
import { MonthStartProvider } from '@/src/features/dashboard/MonthStartProvider';
import { useBudgets } from '@/src/features/budgets/useBudgets';
import { createBudget, deleteBudget, updateBudget } from '@/src/features/budgets/api';
import { expenseCategories } from '@/src/lib/categories';
import { categoryLabel } from '@/src/features/transactions/display';
import { t, isRTL } from '@/src/lib/i18n';
import { FONT } from '@/src/lib/font';
import type { Locale } from '@/src/types';
import type { Budget, BudgetPeriod, BudgetProgress, BudgetScope } from '@/src/features/budgets/types';

const SURFACE = '#14191A';
const OVERLAY = '#1C2322';
const INK = '#F4F7F5';
const INK2 = '#A8B2AF';
const INK3 = '#6B7672';
const ACCENT = '#2BD98E';
const DANGER = '#FF5C6C';

const TONE_COLOR: Record<BudgetProgress['tone'], string> = {
  ok: '#2BD98E',
  warn: '#F5B841',
  over: '#FF5C6C',
};

export default function BudgetsScreen() {
  // Mount the month-start provider locally: it only wraps the (tabs) group, and
  // this route lives on the root stack — so we'd otherwise get the default day.
  return (
    <MonthStartProvider>
      <BudgetsContent />
    </MonthStartProvider>
  );
}

function BudgetsContent() {
  const router = useRouter();
  const { profile } = useSession();
  const locale: Locale = profile?.locale ?? 'en';
  const rtl = isRTL(locale);
  const rowDir = rtl ? 'row-reverse' : 'row';
  const align: 'left' | 'right' = rtl ? 'right' : 'left';

  const { progress, loading, refresh } = useBudgets();

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [scope, setScope] = useState<BudgetScope>('overall');
  const allExpenseCategories = expenseCategories();
  const [categorySlug, setCategorySlug] = useState(allExpenseCategories[0]?.slug ?? 'food');
  const [period, setPeriod] = useState<BudgetPeriod>('monthly');
  const [amount, setAmount] = useState('');
  const [warnPct, setWarnPct] = useState('80');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const amountValue = parseFloat(amount);
  const canSave = Number.isFinite(amountValue) && amountValue > 0;

  // Duplicate-budget conflicts raise Postgres 23505 (unique violation) on
  // `budgets_unique_target_idx` — translate that into a friendly message
  // rather than surfacing the raw error (or silently no-op'ing).
  function friendlySaveError(e: unknown): string {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('duplicate key') || msg.includes('23505')) {
      return t('budgets.error.duplicate', locale);
    }
    return t('budgets.error.save_failed', locale);
  }

  function openForm() {
    setEditingId(null);
    setScope('overall');
    setCategorySlug(allExpenseCategories[0]?.slug ?? 'food');
    setPeriod('monthly');
    setAmount('');
    setWarnPct('80');
    setFormError(null);
    setFormOpen(true);
  }
  function openEdit(budget: Budget) {
    setEditingId(budget.id);
    setScope(budget.scope);
    setCategorySlug(budget.category_slug ?? allExpenseCategories[0]?.slug ?? 'food');
    setPeriod(budget.period);
    setAmount(String(budget.amount));
    setWarnPct(String(budget.warn_pct));
    setFormError(null);
    setFormOpen(true);
  }
  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setScope('overall');
    setCategorySlug(allExpenseCategories[0]?.slug ?? 'food');
    setPeriod('monthly');
    setAmount('');
    setWarnPct('80');
    setFormError(null);
  }

  async function onSave() {
    if (!canSave) return;
    setFormError(null);
    setSaving(true);
    try {
      const warn = Math.min(99, Math.max(1, parseInt(warnPct, 10) || 80));
      const patch = {
        scope,
        category_slug: scope === 'category' ? categorySlug : null,
        period,
        amount: amountValue,
        warn_pct: warn,
      };
      if (editingId) {
        await updateBudget(editingId, patch);
      } else {
        await createBudget(patch);
      }
      closeForm();
      await refresh();
    } catch (e) {
      setFormError(friendlySaveError(e));
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(id: string) {
    setFormError(null);
    setDeletingId(id);
    try {
      await deleteBudget(id);
      await refresh();
    } catch {
      setFormError(t('budgets.error.delete_failed', locale));
    } finally {
      setDeletingId(null);
    }
  }

  const showLoader = loading && progress.length === 0;

  return (
    <Screen scroll padded>
      <View style={{ direction: rtl ? 'rtl' : 'ltr' }}>
        {/* Header */}
        <View
          style={{
            flexDirection: rowDir,
            alignItems: 'center',
            gap: 8,
            paddingTop: 6,
            paddingBottom: 10,
          }}
        >
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              backgroundColor: SURFACE,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <MaterialCommunityIcons name={rtl ? 'chevron-right' : 'chevron-left'} size={26} color={INK} />
          </Pressable>
          <AppText weight="bold" style={{ fontSize: 26, color: INK }}>
            {t('budgets.title', locale)}
          </AppText>
        </View>

        <AppText
          style={{ fontSize: 13.5, color: INK2, lineHeight: 20, textAlign: align, marginBottom: 18 }}
        >
          {t('budgets.subtitle', locale)}
        </AppText>

        {/* Budget list */}
        {showLoader ? (
          <View style={{ paddingVertical: 60, alignItems: 'center' }}>
            <ActivityIndicator color={ACCENT} />
          </View>
        ) : progress.length === 0 ? (
          <View style={{ paddingTop: 20, paddingBottom: 8 }}>
            <EmptyState emoji="🐷" title={t('budgets.empty', locale)} />
          </View>
        ) : (
          <Card>
            <View style={{ gap: 18 }}>
              {progress.map((p) => (
                <BudgetRow
                  key={p.budget.id}
                  progress={p}
                  locale={locale}
                  rtl={rtl}
                  deleting={deletingId === p.budget.id}
                  onDelete={() => onDelete(p.budget.id)}
                  onEdit={() => openEdit(p.budget)}
                />
              ))}
            </View>
          </Card>
        )}

        {/* Add form */}
        <View style={{ marginTop: 16 }}>
          {formError ? (
            <Text
              testID="budget-form-error"
              style={{
                fontFamily: FONT.jakartaMd,
                fontSize: 13,
                color: DANGER,
                textAlign: align,
                marginBottom: 10,
              }}
            >
              {formError}
            </Text>
          ) : null}
          {formOpen ? (
            <Card>
              <View style={{ gap: 12 }}>
                {/* Scope toggle */}
                <Text style={labelStyle(align)}>{t('budgets.scope', locale)}</Text>
                <View style={{ flexDirection: rowDir, gap: 8 }}>
                  <TogglePill
                    testID="budget-scope-overall"
                    label={t('budgets.overall', locale)}
                    active={scope === 'overall'}
                    onPress={() => {
                      setScope('overall');
                      setFormError(null);
                    }}
                  />
                  <TogglePill
                    testID="budget-scope-category"
                    label={t('budgets.category', locale)}
                    active={scope === 'category'}
                    onPress={() => {
                      setScope('category');
                      setFormError(null);
                    }}
                  />
                </View>

                {/* Category chips — only when scope is 'category' */}
                {scope === 'category' && (
                  <ScrollView
                    horizontal
                    keyboardShouldPersistTaps="handled"
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 8, flexDirection: rowDir, paddingVertical: 2 }}
                  >
                    {allExpenseCategories.map((c) => {
                      const active = categorySlug === c.slug;
                      return (
                        <PressableScale
                          key={c.slug}
                          testID={`budget-cat-${c.slug}`}
                          onPress={() => {
                            setCategorySlug(c.slug);
                            setFormError(null);
                          }}
                          style={{
                            flexDirection: rowDir,
                            alignItems: 'center',
                            gap: 6,
                            paddingHorizontal: 10,
                            paddingVertical: 6,
                            borderRadius: 999,
                            backgroundColor: active ? 'rgba(43,217,142,0.16)' : SURFACE,
                            borderWidth: active ? 1 : 0,
                            borderColor: active ? 'rgba(43,217,142,0.4)' : 'transparent',
                          }}
                        >
                          <CategoryAvatar slug={c.slug} size={22} />
                          <Text style={{ fontFamily: FONT.jakartaMd, fontSize: 13, color: active ? ACCENT : INK2 }}>
                            {categoryLabel(c.slug, locale)}
                          </Text>
                        </PressableScale>
                      );
                    })}
                  </ScrollView>
                )}

                {/* Period toggle */}
                <Text style={labelStyle(align)}>{t('budgets.period', locale)}</Text>
                <View style={{ flexDirection: rowDir, gap: 8 }}>
                  <TogglePill
                    testID="budget-period-monthly"
                    label={t('budgets.monthly', locale)}
                    active={period === 'monthly'}
                    onPress={() => {
                      setPeriod('monthly');
                      setFormError(null);
                    }}
                  />
                  <TogglePill
                    testID="budget-period-weekly"
                    label={t('budgets.weekly', locale)}
                    active={period === 'weekly'}
                    onPress={() => {
                      setPeriod('weekly');
                      setFormError(null);
                    }}
                  />
                </View>

                {/* Amount */}
                <Text style={labelStyle(align)}>{t('budgets.amount', locale)}</Text>
                <TextInput
                  testID="budget-amount-input"
                  value={amount}
                  onChangeText={(v) => {
                    setAmount(v);
                    setFormError(null);
                  }}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={INK3}
                  style={{
                    fontFamily: FONT.soraSb,
                    fontSize: 16,
                    color: INK,
                    backgroundColor: '#1C2322',
                    borderRadius: 12,
                    paddingHorizontal: 14,
                    paddingVertical: 11,
                    textAlign: align,
                  }}
                />

                {/* Warn % */}
                <Text style={labelStyle(align)}>{t('budgets.warnAt', locale)}</Text>
                <TextInput
                  testID="budget-warn-input"
                  value={warnPct}
                  onChangeText={(v) => {
                    setWarnPct(v);
                    setFormError(null);
                  }}
                  keyboardType="numeric"
                  placeholder="80"
                  placeholderTextColor={INK3}
                  style={{
                    fontFamily: FONT.soraSb,
                    fontSize: 16,
                    color: INK,
                    backgroundColor: '#1C2322',
                    borderRadius: 12,
                    paddingHorizontal: 14,
                    paddingVertical: 11,
                    textAlign: align,
                  }}
                />

                <View style={{ flexDirection: rowDir, gap: 10, marginTop: 4 }}>
                  <PressableScale
                    testID="budget-save"
                    disabled={saving || !canSave}
                    onPress={onSave}
                    style={{
                      flex: 1,
                      backgroundColor: '#2BD98E',
                      borderRadius: 12,
                      paddingVertical: 12,
                      alignItems: 'center',
                      opacity: canSave ? 1 : 0.5,
                    }}
                  >
                    <AppText weight="semibold" style={{ fontSize: 14, color: '#06251A' }}>
                      {t(editingId ? 'budgets.saveChanges' : 'budgets.save', locale)}
                    </AppText>
                  </PressableScale>
                  <PressableScale
                    testID="budget-cancel"
                    onPress={closeForm}
                    style={{
                      flex: 1,
                      backgroundColor: SURFACE,
                      borderRadius: 12,
                      paddingVertical: 12,
                      alignItems: 'center',
                    }}
                  >
                    <AppText weight="semibold" style={{ fontSize: 14, color: INK2 }}>
                      {t('budgets.cancel', locale)}
                    </AppText>
                  </PressableScale>
                </View>
              </View>
            </Card>
          ) : (
            <PressableScale
              testID="budgets-add"
              onPress={openForm}
              style={{
                backgroundColor: 'rgba(43,217,142,0.12)',
                borderRadius: 12,
                paddingVertical: 13,
                alignItems: 'center',
              }}
            >
              <AppText weight="semibold" style={{ fontSize: 14, color: ACCENT }}>
                {t('budgets.add', locale)}
              </AppText>
            </PressableScale>
          )}
        </View>
      </View>
    </Screen>
  );
}

// ---------------------------------------------------------------------------

function labelStyle(align: 'left' | 'right') {
  return {
    fontFamily: FONT.jakartaMd,
    fontSize: 12,
    color: INK3,
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
    textAlign: align,
  };
}

function TogglePill({
  label,
  active,
  onPress,
  testID,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      style={{
        flex: 1,
        paddingVertical: 10,
        borderRadius: 12,
        alignItems: 'center',
        backgroundColor: active ? 'rgba(43,217,142,0.16)' : SURFACE,
      }}
    >
      <Text style={{ fontFamily: FONT.jakartaSb, fontSize: 13.5, color: active ? ACCENT : INK2 }}>{label}</Text>
    </PressableScale>
  );
}

/** "Overall" tile — matches CategoryAvatar's look (40×40, tinted bg, centered glyph). */
function OverallAvatar({ size = 40 }: { size?: number }) {
  const radius = Math.round(size * 0.35);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: 'rgba(43,217,142,0.14)',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <MaterialCommunityIcons name="chart-donut" size={Math.round(size * 0.55)} color={ACCENT} />
    </View>
  );
}

function BudgetRow({
  progress,
  locale,
  rtl,
  deleting,
  onDelete,
  onEdit,
}: {
  progress: BudgetProgress;
  locale: Locale;
  rtl: boolean;
  deleting: boolean;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const rowDir = rtl ? 'row-reverse' : 'row';
  const align: 'left' | 'right' = rtl ? 'right' : 'left';
  const { budget, spent, pct, remaining, tone } = progress;
  const label = budget.scope === 'overall' ? t('budgets.overall', locale) : categoryLabel(budget.category_slug ?? '', locale);
  const periodLabel = t(budget.period === 'weekly' ? 'budgets.weekly' : 'budgets.monthly', locale);
  const barColor = TONE_COLOR[tone];

  return (
    <View testID={`budget-row-${budget.id}`} style={{ flexDirection: rowDir, alignItems: 'flex-start', gap: 12 }}>
      {budget.scope === 'overall' ? <OverallAvatar /> : <CategoryAvatar slug={budget.category_slug ?? ''} size={40} />}
      <View style={{ flex: 1, gap: 8 }}>
        <View style={{ flexDirection: rowDir, alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: rowDir, alignItems: 'center', gap: 8, flexShrink: 1 }}>
            <AppText weight="semibold" numberOfLines={1} style={{ fontSize: 14.5, color: INK, textAlign: align }}>
              {label}
            </AppText>
            <View style={{ backgroundColor: OVERLAY, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
              <Text style={{ fontFamily: FONT.jakartaMd, fontSize: 10.5, color: INK3 }}>{periodLabel}</Text>
            </View>
          </View>
          <View style={{ flexDirection: rowDir, alignItems: 'center', gap: 14 }}>
            <PressableScale
              testID={`budget-edit-${budget.id}`}
              onPress={onEdit}
              hitSlop={10}
              style={{ padding: 4 }}
            >
              <Text style={{ fontFamily: FONT.jakartaMd, fontSize: 12.5, color: INK2 }}>{t('edit', locale)}</Text>
            </PressableScale>
            <PressableScale
              testID={`budget-delete-${budget.id}`}
              onPress={onDelete}
              disabled={deleting}
              hitSlop={10}
              style={{ padding: 4 }}
            >
              <Text style={{ fontFamily: FONT.jakartaMd, fontSize: 12.5, color: DANGER }}>{t('delete', locale)}</Text>
            </PressableScale>
          </View>
        </View>

        {/* Progress track — filled width is clamped so an overspent bar never overflows */}
        <View style={{ height: 8, borderRadius: 4, backgroundColor: OVERLAY, overflow: 'hidden' }}>
          <View
            style={{
              height: '100%',
              width: `${Math.min(100, pct)}%`,
              backgroundColor: barColor,
              borderRadius: 4,
              alignSelf: rtl ? 'flex-end' : 'flex-start',
            }}
          />
        </View>

        {/* Two stacked lines: four money elements never fit one phone line once
            EGP amounts reach thousands (they used to collide and run off-screen). */}
        <View style={{ gap: 2 }}>
          <View style={{ flexDirection: rowDir, alignItems: 'center', gap: 4 }}>
            <Money amount={spent} tone="ink" sign="none" size={13} numberOfLines={1} />
            <Text
              style={{ fontFamily: FONT.jakartaMd, fontSize: 12, color: INK3 }}
              numberOfLines={1}
            >
              {t('budgets.spentOf', locale)}
            </Text>
            <Money
              amount={budget.amount}
              tone="ink2"
              sign="none"
              size={13}
              numberOfLines={1}
              style={{ flexShrink: 1 }}
            />
          </View>
          <View style={{ flexDirection: rowDir, alignItems: 'center', gap: 4 }}>
            <Money
              amount={tone === 'over' ? Math.max(0, spent - budget.amount) : remaining}
              tone="ink2"
              sign="none"
              size={12}
              numberOfLines={1}
            />
            <Text
              style={{ fontFamily: FONT.jakartaMd, fontSize: 12, color: tone === 'over' ? DANGER : INK3 }}
              numberOfLines={1}
            >
              {t(tone === 'over' ? 'budgets.over' : 'budgets.remaining', locale)}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}
