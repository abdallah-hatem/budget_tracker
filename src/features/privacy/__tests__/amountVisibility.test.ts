import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getAmountsHidden,
  toggleAmountsHidden,
  subscribeAmountVisibility,
  hydrateAmountVisibility,
} from '../amountVisibility';

// The store is a module singleton; reset its persisted backing between tests.
// (The in-memory flag persists across tests, so each test asserts relative to
// the toggle it performs.)
beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('amount visibility store', () => {
  it('defaults to visible', () => {
    expect(getAmountsHidden()).toBe(false);
  });

  it('toggles and notifies subscribers', () => {
    const before = getAmountsHidden();
    const listener = jest.fn();
    const unsub = subscribeAmountVisibility(listener);

    toggleAmountsHidden();
    expect(getAmountsHidden()).toBe(!before);
    expect(listener).toHaveBeenCalledTimes(1);

    toggleAmountsHidden();
    expect(getAmountsHidden()).toBe(before);
    expect(listener).toHaveBeenCalledTimes(2);

    unsub();
    toggleAmountsHidden();
    expect(listener).toHaveBeenCalledTimes(2); // no longer notified
    toggleAmountsHidden(); // restore to `before`
  });

  it('persists the toggle to storage', async () => {
    const before = getAmountsHidden();
    toggleAmountsHidden();
    const stored = await AsyncStorage.getItem('amounts_hidden_v1');
    expect(stored).toBe(before ? '0' : '1');
    toggleAmountsHidden(); // restore
  });

  it('hydrate is a no-op after the first call', async () => {
    // hydrate ran implicitly via earlier tests / first import; calling again
    // must not throw and must resolve.
    await expect(hydrateAmountVisibility()).resolves.toBeUndefined();
  });
});
