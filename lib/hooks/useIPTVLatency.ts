/**
 * useIPTVLatency - Hook for streaming latency measurement to IPTV channels
 * Streams results as they arrive. No auto-refresh — call refreshAll() to re-check.
 */

import { useState, useEffect, useRef, useMemo } from 'react';

interface ChannelLatencyState {
    [channelUrl: string]: number;
}

interface UseIPTVLatencyOptions {
    channels: { url: string; name: string }[];
    enabled?: boolean;
}

export function useIPTVLatency({
    channels,
    enabled = true,
}: UseIPTVLatencyOptions) {
    const [latencies, setLatencies] = useState<ChannelLatencyState>({});
    const [pendingCount, setPendingCount] = useState(0);
    const mountedRef = useRef(true);
    const abortRef = useRef<AbortController | null>(null);

    const uniqueChannels = useMemo(() => {
        const seen = new Set<string>();
        return channels.filter((ch) => {
            if (!ch.url || seen.has(ch.url)) return false;
            seen.add(ch.url);
            return true;
        });
    }, [channels]);

    const refreshAll = () => {
        if (!mountedRef.current || uniqueChannels.length === 0) return;

        if (abortRef.current) {
            abortRef.current.abort();
        }
        abortRef.current = new AbortController();

        setPendingCount(uniqueChannels.length);

        const CONCURRENCY = 20;
        let completed = 0;
        let active = 0;
        let index = 0;
        const total = uniqueChannels.length;

        const checkDone = () => {
            if (completed >= total && mountedRef.current) {
                setPendingCount(0);
            }
        };

        const runTask = (url: string) => {
            active++;

            fetch('/api/stream-check', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url }),
                signal: abortRef.current!.signal,
            })
                .then((response) => {
                    if (!mountedRef.current) return null;
                    if (response.ok) {
                        return response.json().then((data) => {
                            if (data.success && data.latency != null) {
                                return { url, latency: data.latency };
                            }
                            return { url, latency: null };
                        });
                    }
                    return { url, latency: null };
                })
                .catch(() => (!mountedRef.current ? null : { url, latency: null }))
                .then((result) => {
                    if (!mountedRef.current || !result) return;
                    if (result.latency !== null) {
                        setLatencies((prev) => ({ ...prev, [result.url]: result.latency }));
                    }
                })
                .finally(() => {
                    if (!mountedRef.current) return;
                    completed++;
                    active--;
                    setPendingCount(total - completed);
                    checkDone();
                    processNext();
                });

            processNext();
        };

        const processNext = () => {
            while (active < CONCURRENCY && index < total) {
                runTask(uniqueChannels[index++].url);
            }
        };

        processNext();
    };

    // Initial ping on channels change
    useEffect(() => {
        mountedRef.current = true;

        if (enabled && uniqueChannels.length > 0) {
            refreshAll();
        }

        return () => {
            mountedRef.current = false;
            if (abortRef.current) {
                abortRef.current.abort();
                abortRef.current = null;
            }
        };
    }, [enabled, uniqueChannels.length]);

    return {
        latencies,
        pendingCount,
        refreshAll,
    };
}
