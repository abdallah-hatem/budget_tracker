// Curated MaterialCommunityIcons glyphs + color palette for the custom-category
// picker. Kept intentionally small (one clean grid) rather than the full
// thousands-strong MCI set. All names must be valid MCI glyphs.

export const CATEGORY_ICONS: string[] = [
  // food & drink
  'food', 'silverware-fork-knife', 'coffee', 'hamburger', 'pizza', 'cup', 'bottle-wine', 'food-apple', 'cake-variant',
  // shopping
  'cart', 'basket', 'shopping', 'store', 'tag', 'gift',
  // transport
  'car', 'bus', 'train', 'taxi', 'bike', 'motorbike', 'gas-station', 'airplane',
  // clothing
  'tshirt-crew', 'shoe-heel', 'hanger', 'sunglasses', 'watch',
  // bills / utilities / tech
  'file-document', 'flash', 'water', 'wifi', 'cellphone', 'lightbulb', 'laptop',
  // health
  'heart-pulse', 'pill', 'hospital-box', 'medical-bag',
  // sports / activity
  'dumbbell', 'soccer', 'basketball', 'tennis', 'swim', 'run', 'yoga',
  // education
  'school', 'book-open-variant', 'pencil',
  // home / life
  'home', 'sofa', 'bed', 'hammer-wrench', 'broom', 'tree', 'flower',
  // pets / family
  'paw', 'dog', 'cat', 'baby-carriage',
  // leisure
  'palette', 'music', 'movie', 'gamepad-variant', 'camera', 'ticket', 'beach', 'bag-suitcase',
  // money / income
  'cash-multiple', 'credit-card', 'bank', 'wallet', 'piggy-bank', 'chart-line', 'briefcase',
  // misc
  'star', 'heart', 'dots-horizontal',
];

export const CATEGORY_COLORS: string[] = [
  '#F97316', '#F59E0B', '#EAB308', '#84CC16', '#22C55E', '#10B981',
  '#14B8A6', '#06B6D4', '#0EA5E9', '#3B82F6', '#6366F1', '#A855F7',
  '#D946EF', '#EC4899', '#F43F5E', '#EF4444', '#94A3B8',
];

export const DEFAULT_CATEGORY_ICON = CATEGORY_ICONS[0];
export const DEFAULT_CATEGORY_COLOR = CATEGORY_COLORS[4]; // green
