/**
 * Midnight Emerald UI component library.
 * Re-export all core components from a single entry point.
 */

export { Screen } from './Screen';
export type { ScreenProps } from './Screen';

export { Card } from './Card';
export type { CardProps } from './Card';

export { CollapsibleCard } from './CollapsibleCard';

export { AppText } from './AppText';
export type { AppTextProps, TextWeight } from './AppText';

export { Money } from './Money';
export type { MoneyProps, MoneyTone } from './Money';

export { Hero } from './Hero';
export type { HeroProps } from './Hero';

export { CategoryAvatar } from './CategoryAvatar';
export type { CategoryAvatarProps } from './CategoryAvatar';

export { SectionLabel } from './SectionLabel';
export type { SectionLabelProps } from './SectionLabel';

export { Pill } from './Pill';
export type { PillProps } from './Pill';

export { PrimaryButton } from './PrimaryButton';
export type { PrimaryButtonProps } from './PrimaryButton';

export { PressableScale } from './PressableScale';
export type { PressableScaleProps } from './PressableScale';

export { EmptyState } from './EmptyState';
export type { EmptyStateProps } from './EmptyState';

export { SpendingDonut } from './SpendingDonut';
export type { SpendingDonutProps, SpendingDonutDatum } from './SpendingDonut';

export { TransactionRow } from './TransactionRow';
export type { TransactionRowProps } from './TransactionRow';

export { ViewToggle } from './ViewToggle';
export type { ViewToggleProps } from './ViewToggle';

// NOTE: FloatingTabBar is intentionally NOT re-exported here — it pulls in the
// PendingProvider -> supabase -> AsyncStorage chain, which poisons unit tests
// that import the barrel. Import it directly: `@/src/ui/FloatingTabBar`.
