import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getCaptureConfig,
  setCaptureConfig,
  headlessNotificationListener,
} from '../androidCapture';

describe('android notification capture', () => {
  const URL = 'https://example.supabase.co';
  const ANON = 'anon-key';
  let fetchMock: jest.Mock;

  beforeEach(async () => {
    await AsyncStorage.clear();
    process.env.EXPO_PUBLIC_SUPABASE_URL = URL;
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = ANON;
    fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  const notif = (over: Record<string, string> = {}) =>
    JSON.stringify({ app: 'com.bank', title: 'Bank', text: 'You spent 50 EGP at Cafe', ...over });

  it('defaults to disabled with no keywords/token', async () => {
    const cfg = await getCaptureConfig();
    expect(cfg).toEqual({ enabled: false, keywords: [], token: null });
  });

  it('persists and merges config patches', async () => {
    await setCaptureConfig({ keywords: ['EGP'] });
    await setCaptureConfig({ enabled: true, token: 'tok' });
    const cfg = await getCaptureConfig();
    expect(cfg).toEqual({ enabled: true, keywords: ['EGP'], token: 'tok' });
  });

  it('does NOT post when disabled', async () => {
    await setCaptureConfig({ enabled: false, keywords: ['EGP'], token: 'tok' });
    await headlessNotificationListener({ notification: notif() });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does NOT post when no keyword matches', async () => {
    await setCaptureConfig({ enabled: true, keywords: ['VODAFONE'], token: 'tok' });
    await headlessNotificationListener({ notification: notif({ text: 'Hi from a friend' }) });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does NOT post without a token', async () => {
    await setCaptureConfig({ enabled: true, keywords: ['EGP'], token: null });
    await headlessNotificationListener({ notification: notif() });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts the notification text to ingest-sms on a keyword match (case-insensitive)', async () => {
    await setCaptureConfig({ enabled: true, keywords: ['egp'], token: 'tok-123' });
    await headlessNotificationListener({ notification: notif() });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe(`${URL}/functions/v1/ingest-sms`);
    expect(opts.method).toBe('POST');
    expect(opts.headers.apikey).toBe(ANON);
    const body = JSON.parse(opts.body);
    expect(body.token).toBe('tok-123');
    expect(body.text).toContain('50 EGP');
    expect(typeof body.received_at).toBe('string');
  });

  it('accepts an already-parsed object too', async () => {
    await setCaptureConfig({ enabled: true, keywords: ['EGP'], token: 'tok' });
    await headlessNotificationListener({
      notification: { title: 'Bank', text: '20 EGP withdrawn' } as never,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never throws on malformed input', async () => {
    await setCaptureConfig({ enabled: true, keywords: ['EGP'], token: 'tok' });
    await expect(
      headlessNotificationListener({ notification: 'not-json{' }),
    ).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('ignores our own app notifications (no feedback loop)', async () => {
    await setCaptureConfig({ enabled: true, keywords: ['EGP'], token: 'tok' });
    await headlessNotificationListener({
      notification: notif({ app: 'com.masareef.budget' }),
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('dedupes the same notification within the window', async () => {
    await setCaptureConfig({ enabled: true, keywords: ['EGP'], token: 'tok' });
    await headlessNotificationListener({ notification: notif() });
    await headlessNotificationListener({ notification: notif() });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keyword-free: with no keywords, forwards a transaction-looking notification', async () => {
    await setCaptureConfig({ enabled: true, keywords: [], token: 'tok' });
    await headlessNotificationListener({
      notification: notif({ text: 'تم خصم 250 جم من حسابك' }),
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keyword-free: with no keywords, ignores a non-transaction notification (OTP)', async () => {
    await setCaptureConfig({ enabled: true, keywords: [], token: 'tok' });
    await headlessNotificationListener({
      notification: notif({ text: 'Your verification code is 123456' }),
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
