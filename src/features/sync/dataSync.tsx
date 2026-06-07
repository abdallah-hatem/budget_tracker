import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

/**
 * A tiny global "transactions changed" signal. Capture now lives in a modal that
 * floats above whatever tab is focused, so adding/editing/deleting an entry no
 * longer triggers a screen's `useFocusEffect` refetch — the focused screen never
 * blurred. Screens subscribe with {@link useRefetchOnTxnChange}; the writer
 * (CaptureProvider) calls {@link useDataSync}().notifyTxnsChanged after a write.
 */
interface DataSyncValue {
  /** Monotonic counter — bumps on every transactions mutation. */
  version: number;
  /** Signal that transactions changed somewhere (insert / undo / edit / delete). */
  notifyTxnsChanged: () => void;
}

const DataSyncContext = createContext<DataSyncValue | null>(null);

export function DataSyncProvider({ children }: { children: React.ReactNode }) {
  const [version, setVersion] = useState(0);
  const notifyTxnsChanged = useCallback(() => setVersion((v) => v + 1), []);
  const value = useMemo(() => ({ version, notifyTxnsChanged }), [version, notifyTxnsChanged]);
  return <DataSyncContext.Provider value={value}>{children}</DataSyncContext.Provider>;
}

/** Read the sync signal. Falls back to a no-op when no provider is mounted. */
export function useDataSync(): DataSyncValue {
  return useContext(DataSyncContext) ?? { version: 0, notifyTxnsChanged: () => {} };
}

/**
 * Run `refetch` whenever transactions change elsewhere. Skips the initial mount
 * (screens already load on mount / focus), so it only fires on later mutations.
 */
export function useRefetchOnTxnChange(refetch: () => void) {
  const { version } = useDataSync();
  const first = useRef(true);
  const cb = useRef(refetch);
  cb.current = refetch;
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    cb.current();
  }, [version]);
}
