import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getQuickActions,
  setQuickActions,
  peekQuickActions,
  subscribeQuickActions,
  makeQuickActionId,
  MAX_QUICK_ACTIONS,
  type QuickAction,
} from '../quickActions';

const qa = (over: Partial<QuickAction> = {}): QuickAction => ({
  id: makeQuickActionId(),
  categorySlug: 'food',
  type: 'expense',
  note: '',
  ...over,
});

describe('notification quickActions store', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    // Reset the module cache by writing an empty list.
    await setQuickActions([]);
  });

  it('round-trips presets through storage', async () => {
    const list = [qa({ categorySlug: 'transport', type: 'expense', note: 'uber' })];
    await setQuickActions(list);
    expect(await getQuickActions()).toEqual(list);
  });

  it('caps the list at MAX_QUICK_ACTIONS', async () => {
    const many = Array.from({ length: MAX_QUICK_ACTIONS + 2 }, () => qa());
    await setQuickActions(many);
    expect((await getQuickActions()).length).toBe(MAX_QUICK_ACTIONS);
  });

  it('drops malformed entries on read/write', async () => {
    await setQuickActions([qa(), { id: 'x', categorySlug: 'food' } as unknown as QuickAction]);
    const out = await getQuickActions();
    expect(out.length).toBe(1);
  });

  it('peek returns the last-set cache synchronously', async () => {
    const list = [qa({ note: 'coffee' })];
    await setQuickActions(list);
    expect(peekQuickActions()).toEqual(list);
  });

  it('notifies subscribers on change', async () => {
    const fn = jest.fn();
    const unsub = subscribeQuickActions(fn);
    await setQuickActions([qa()]);
    expect(fn).toHaveBeenCalledTimes(1);
    unsub();
    await setQuickActions([qa(), qa()]);
    expect(fn).toHaveBeenCalledTimes(1); // no longer subscribed
  });
});
