/**
 * Source Import Utilities - Handle parsing and importing sources from various formats
 */

import type { VideoSource, SourceSubscription } from '@/lib/types';

/**
 * Result of verifying a single source URL
 */
export interface SourceVerifyResult {
    baseUrl: string;
    name: string;
    reachable: boolean;
    valid: boolean;
    error?: string;
    contentType?: string;
}

/**
 * Status of a single source in the import process
 */
export type SourceImportStatus = 'pending' | 'skipped_exists' | 'skipped_invalid' | 'verified_ok' | 'verified_failed' | 'imported';

/**
 * A source item with its import status attached
 */
export interface SourceImportItem {
    source: VideoSource;
    status: SourceImportStatus;
    verifyResult?: SourceVerifyResult;
    error?: string; // human-readable error reason
}

/**
 * Detailed import report shown to user before confirming
 */
export interface ImportReport {
    sources: SourceImportItem[];
    successCount: number; // verified_ok
    skippedExistsCount: number; // skipped because already in local store
    skippedInvalidCount: number; // failed format validation
    failedCount: number; // verified but unreachable/failed
    totalCount: number;
}

/**
 * Simplified source format for import
 */
export interface ImportSourceFormat {
    id: string;
    name: string;
    baseUrl: string;
    group?: 'normal' | 'premium';
    enabled?: boolean;
    priority?: number;
}

/**
 * Import result containing categorized sources
 */
export interface ImportResult {
    normalSources: VideoSource[];
    premiumSources: VideoSource[];
    totalCount: number;
}

/**
 * Convert simplified import format to full VideoSource
 */
export function convertToVideoSource(source: ImportSourceFormat): VideoSource {
    return {
        id: source.id,
        name: source.name,
        baseUrl: source.baseUrl,
        searchPath: '',
        detailPath: '',
        enabled: source.enabled !== false,
        priority: source.priority || 1,
        group: source.group || 'normal',
    };
}

/**
 * Validate if an object is a valid source format
 */
export function isValidSourceFormat(obj: unknown): obj is ImportSourceFormat {
    if (typeof obj !== 'object' || obj === null) return false;
    const source = obj as Record<string, unknown>;
    return (
        typeof source.id === 'string' &&
        typeof source.name === 'string' &&
        typeof source.baseUrl === 'string' &&
        source.id.length > 0 &&
        source.name.length > 0 &&
        source.baseUrl.length > 0
    );
}

/**
 * Parse sources from JSON string
 * Supports both array format and wrapped object format
 */
export function parseSourcesFromJson(jsonString: string): ImportResult {
    const data = JSON.parse(jsonString);

    let sourcesArray: unknown[];

    // Handle different JSON structures
    if (Array.isArray(data)) {
        sourcesArray = data;
    } else if (data.sources && Array.isArray(data.sources)) {
        sourcesArray = data.sources;
    } else if (data.list && Array.isArray(data.list)) {
        sourcesArray = data.list;
    } else {
        throw new Error('无法识别的JSON格式');
    }

    const normalSources: VideoSource[] = [];
    const premiumSources: VideoSource[] = [];

    for (const item of sourcesArray) {
        if (!isValidSourceFormat(item)) continue;

        const source = convertToVideoSource(item);

        if (item.group === 'premium') {
            premiumSources.push(source);
        } else {
            normalSources.push(source);
        }
    }

    return {
        normalSources,
        premiumSources,
        totalCount: normalSources.length + premiumSources.length,
    };
}

/**
 * Fetch and parse sources from a URL
 */
export async function fetchSourcesFromUrl(url: string): Promise<ImportResult> {
    // If we're in the browser and it's an external URL, use our proxy to avoid CORS issues
    const isExternal = url.startsWith('http') && (typeof window !== 'undefined' && !url.includes(window.location.host));
    const fetchUrl = isExternal
        ? `/api/proxy?url=${encodeURIComponent(url)}`
        : url;

    const response = await fetch(fetchUrl, {
        headers: {
            'Accept': 'application/json',
        },
    });

    if (!response.ok) {
        throw new Error(`获取失败: ${response.status} ${response.statusText}`);
    }

    const text = await response.text();
    return parseSourcesFromJson(text);
}

/**
 * Create a new subscription object
 */
export function createSubscription(name: string, url: string): SourceSubscription {
    return {
        id: `sub_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        name: name.trim() || '未命名订阅',
        url: url.trim(),
        lastUpdated: 0,
        autoRefresh: true,
    };
}

/**
 * Merge new sources with existing sources, avoiding duplicates by baseUrl
 * If a source with the same baseUrl exists, skip it (no update)
 */
export function mergeSources(
    existing: VideoSource[],
    newSources: VideoSource[]
): VideoSource[] {
    const existingBaseUrls = new Set(existing.map(s => s.baseUrl));
    const merged = [...existing];

    for (const source of newSources) {
        if (existingBaseUrls.has(source.baseUrl)) {
            // Already exists, skip silently
            continue;
        }
        // Add new source
        merged.push({
            ...source,
            id: source.id || `src_${Date.now()}_${Math.random().toString(36).substring(7)}`,
            priority: merged.length + 1,
        });
        existingBaseUrls.add(source.baseUrl);
    }

    return merged;
}

/**
 * Verify a single source URL via the server-side API
 */
export async function verifySource(baseUrl: string): Promise<SourceVerifyResult> {
    try {
        const params = new URLSearchParams({ url: baseUrl });
        const res = await fetch(`/api/source-verify?${params.toString()}`);
        const data = await res.json();
        return {
            baseUrl,
            name: '',
            reachable: data.reachable ?? false,
            valid: data.valid ?? false,
            error: data.error,
            contentType: data.contentType,
        };
    } catch {
        return { baseUrl, name: '', reachable: false, valid: false, error: '验证请求失败' };
    }
}

/**
 * Verify multiple sources concurrently with a concurrency limit
 */
export async function verifySources(
    sources: VideoSource[],
    existingBaseUrls: Set<string>,
    onProgress?: (done: number, total: number) => void
): Promise<ImportReport> {
    const CONCURRENCY = 5;
    const items: SourceImportItem[] = [];
    let done = 0;

    // Phase 1: dedup (mark skipped)
    for (const source of sources) {
        if (existingBaseUrls.has(source.baseUrl)) {
            items.push({ source, status: 'skipped_exists' });
            done++;
            onProgress?.(done, sources.length);
        } else {
            items.push({ source, status: 'pending' });
        }
    }

    // Phase 2: verify pending items concurrently
    const pending = items.filter(i => i.status === 'pending');
    const pendingIndices = items.reduce<number[]>((acc, item, idx) => {
        if (item.status === 'pending') acc.push(idx);
        return acc;
    }, []);

    let nextIndex = 0;

    const worker = async () => {
        while (true) {
            const currentIdx = nextIndex++;
            if (currentIdx >= pendingIndices.length) break;

            const itemIdx = pendingIndices[currentIdx];
            const item = items[itemIdx];
            const result = await verifySource(item.source.baseUrl);
            result.name = item.source.name;

            if (!result.reachable) {
                item.status = 'verified_failed';
                item.verifyResult = result;
                item.error = result.error || '无法连接';
            } else if (!result.valid) {
                item.status = 'skipped_invalid';
                item.verifyResult = result;
                item.error = result.error || '内容格式无效';
            } else {
                item.status = 'verified_ok';
                item.verifyResult = result;
            }

            done++;
            onProgress?.(done, sources.length);
        }
    };

    const workers = Array.from({ length: Math.min(CONCURRENCY, pending.length) }, worker);
    await Promise.all(workers);

    // Sort: ok first, then skipped, then failed
    const statusOrder: Record<SourceImportStatus, number> = {
        verified_ok: 0,
        imported: 0,
        pending: 1,
        skipped_exists: 2,
        skipped_invalid: 3,
        verified_failed: 4,
    };
    items.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);

    return {
        sources: items,
        successCount: items.filter(i => i.status === 'verified_ok').length,
        skippedExistsCount: items.filter(i => i.status === 'skipped_exists').length,
        skippedInvalidCount: items.filter(i => i.status === 'skipped_invalid').length,
        failedCount: items.filter(i => i.status === 'verified_failed').length,
        totalCount: items.length,
    };
}

export interface ExportOptions {
    includeDisabled?: boolean;
}

/**
 * Export sources to a JSON file and trigger download in browser
 */
export function exportSources(sources: VideoSource[], options: ExportOptions = {}): void {
    const toExport = options.includeDisabled
        ? sources
        : sources.filter(s => s.enabled !== false);

    const payload = JSON.stringify(toExport, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kvideo-sources-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
