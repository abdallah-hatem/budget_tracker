import AsyncStorage from '@react-native-async-storage/async-storage';
import { getShowOnHome, setShowOnHome, resetShowOnHomeCache } from '../showOnHome';

describe('budgets show-on-home preference', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    resetShowOnHomeCache();
  });

  it('defaults to HIDDEN when nothing is stored', async () => {
    expect(await getShowOnHome()).toBe(false);
  });

  it('persists an opt-in across a cold read', async () => {
    await setShowOnHome(true);
    resetShowOnHomeCache(); // force a re-read from storage
    expect(await getShowOnHome()).toBe(true);
  });

  it('persists an opt-out', async () => {
    await setShowOnHome(true);
    await setShowOnHome(false);
    resetShowOnHomeCache();
    expect(await getShowOnHome()).toBe(false);
  });

  it('falls back to hidden when storage throws', async () => {
    const spy = jest
      .spyOn(AsyncStorage, 'getItem')
      .mockRejectedValueOnce(new Error('storage unavailable'));
    resetShowOnHomeCache();
    expect(await getShowOnHome()).toBe(false);
    spy.mockRestore();
  });
});
