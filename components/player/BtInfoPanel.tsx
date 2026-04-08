'use client';

import { useState, useEffect } from 'react';

interface BtDownloadLink {
    label: string;
    size: string;
    magnet: string;
    torrentUrl: string;
}

interface BtSearchResult {
    title: string;
    genre: string;
    country: string;
    synopsis: string;
    detailUrl: string;
    year?: string;
    downloads?: BtDownloadLink[];
}

interface BtSearchResponse {
    query: string;
    total: number;
    results: BtSearchResult[];
}

interface BtInfoPanelProps {
    videoTitle: string;
}

export function BtInfoPanel({ videoTitle }: BtInfoPanelProps) {
    const [data, setData] = useState<BtSearchResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isExpanded, setIsExpanded] = useState(true);
    const [copiedMagnet, setCopiedMagnet] = useState<string | null>(null);

    useEffect(() => {
        if (!videoTitle || videoTitle.trim().length < 2) return;

        const encoded = encodeURIComponent(videoTitle.trim());
        const cacheKey = `bt_search_${encoded}`;

        const cached = (window as any)[cacheKey];
        if (cached) {
            setData(cached);
            return;
        }

        setLoading(true);
        setError(null);

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12000);

        fetch(`/api/bt-search?q=${encoded}`, { signal: controller.signal })
            .then(res => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.json();
            })
            .then((json: BtSearchResponse) => {
                clearTimeout(timeout);
                setData(json);
                (window as any)[cacheKey] = json;
            })
            .catch(err => {
                clearTimeout(timeout);
                if (err.name !== 'AbortError') {
                    setError('获取失败');
                    console.error('[BtInfoPanel]', err);
                }
            })
            .finally(() => {
                setLoading(false);
            });
    }, [videoTitle]);

    const copyMagnet = (magnet: string) => {
        if (!navigator.clipboard) {
            // Fallback for SSR or unsupported browsers
            const textArea = document.createElement('textarea');
            textArea.value = magnet;
            textArea.style.position = 'fixed';
            textArea.style.opacity = '0';
            document.body.appendChild(textArea);
            textArea.select();
            try { document.execCommand('copy'); } catch (_) { /* ignore */ }
            document.body.removeChild(textArea);
            setCopiedMagnet(magnet);
            setTimeout(() => setCopiedMagnet(null), 2000);
            return;
        }
        navigator.clipboard.writeText(magnet).then(() => {
            setCopiedMagnet(magnet);
            setTimeout(() => setCopiedMagnet(null), 2000);
        }).catch(() => {
            // Fallback on error
            const textArea = document.createElement('textarea');
            textArea.value = magnet;
            textArea.style.position = 'fixed';
            textArea.style.opacity = '0';
            document.body.appendChild(textArea);
            textArea.select();
            try { document.execCommand('copy'); } catch (_) { /* ignore */ }
            document.body.removeChild(textArea);
            setCopiedMagnet(magnet);
            setTimeout(() => setCopiedMagnet(null), 2000);
        });
    };

    if (!videoTitle) return null;

    const firstResult = data?.results?.[0];
    const downloads = firstResult?.downloads || [];

    return (
        <div className="rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg)] overflow-hidden">
            {/* Header */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-[var(--glass-bg)]/50 transition-colors cursor-pointer"
            >
                <div className="flex items-center gap-2">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--accent-color)]">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="2" y1="12" x2="22" y2="12"/>
                        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                    </svg>
                    <span className="text-sm font-semibold text-[var(--text-color)]">BT 影视</span>
                    {data && (
                        <span className="text-xs text-[var(--text-color-secondary)]">
                            ({data.total} 条结果)
                        </span>
                    )}
                </div>
                <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className={`text-[var(--text-color-secondary)] transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                >
                    <polyline points="6 9 12 15 18 9"/>
                </svg>
            </button>

            {/* Content */}
            {isExpanded && (
                <div className="px-4 pb-4">
                    {loading && (
                        <div className="flex items-center gap-2 py-3 text-sm text-[var(--text-color-secondary)]">
                            <div className="animate-spin rounded-full h-4 w-4 border-2 border-[var(--accent-color)] border-t-transparent"/>
                            搜索 BT 资源...
                        </div>
                    )}

                    {error && (
                        <p className="text-sm text-red-400 py-2">{error}</p>
                    )}

                    {data && data.results.length === 0 && !loading && (
                        <p className="text-sm text-[var(--text-color-secondary)] py-2">未找到相关资源</p>
                    )}

                    {data && data.results.length > 0 && (
                        <div className="space-y-3 mt-2">
                            {/* Primary result */}
                            <div>
                                <div className="flex items-start justify-between gap-2">
                                    <a
                                        href={firstResult.detailUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-sm font-medium text-[var(--text-color)] hover:text-[var(--accent-color)] transition-colors leading-snug"
                                        title={firstResult.title}
                                    >
                                        {firstResult.title}
                                    </a>
                                </div>

                                {/* Meta info */}
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5 text-xs text-[var(--text-color-secondary)]">
                                    {firstResult.year && <span>{firstResult.year}</span>}
                                    {firstResult.country && <span>{firstResult.country}</span>}
                                    {firstResult.genre && <span>{firstResult.genre}</span>}
                                </div>

                                {/* Synopsis */}
                                {firstResult.synopsis && (
                                    <p className="text-xs text-[var(--text-color-secondary)] mt-1 leading-relaxed line-clamp-2">
                                        {firstResult.synopsis}
                                    </p>
                                )}

                                {/* Download links */}
                                {downloads.length > 0 && (() => {
                                    // Group by label (resolution)
                                    const groups = downloads.reduce<Record<string, typeof downloads>>((acc, dl) => {
                                        const key = dl.label || '其他';
                                        if (!acc[key]) acc[key] = [];
                                        acc[key].push(dl);
                                        return acc;
                                    }, {});
                                    const groupEntries = Object.entries(groups);

                                    return (
                                        <div className="mt-2 space-y-2">
                                            <div className="text-xs text-[var(--text-color-secondary)] font-medium">
                                                资源下载 ({downloads.length} 个版本)
                                            </div>
                                            {groupEntries.map(([label, items]) => (
                                                <div key={label} className="rounded-lg border border-[var(--glass-border)] overflow-hidden">
                                                    {/* Group header - click to expand/collapse */}
                                                    <div className="flex items-center justify-between px-3 py-2 bg-[var(--bg-color)]/40">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs font-semibold text-[var(--accent-color)] bg-[var(--accent-color)]/10 px-2 py-0.5 rounded">
                                                                {label}
                                                            </span>
                                                            <span className="text-xs text-[var(--text-color-secondary)]">
                                                                {items.length} 个文件
                                                            </span>
                                                        </div>
                                                    </div>

                                                    {/* Group items */}
                                                    <div className="divide-y divide-[var(--glass-border)]">
                                                        {items.map((dl, i) => (
                                                            <div key={i} className="px-3 py-2 space-y-1">
                                                                {/* Filename */}
                                                                <div className="text-xs text-[var(--text-color)] leading-snug break-all line-clamp-2">
                                                                    {dl.filename}
                                                                </div>
                                                                {/* Size + actions */}
                                                                <div className="flex items-center justify-between">
                                                                    {dl.size && (
                                                                        <span className="text-xs text-[var(--text-color-secondary)]">
                                                                            {dl.size}
                                                                        </span>
                                                                    )}
                                                                    <div className="flex items-center gap-1 ml-auto">
                                                                        {dl.magnet && (
                                                                            <button
                                                                                onClick={() => copyMagnet(dl.magnet)}
                                                                                title="复制磁力链接"
                                                                                className="flex items-center gap-1 px-2 py-0.5 rounded text-xs hover:bg-[var(--accent-color)]/10 transition-colors text-[var(--text-color-secondary)] hover:text-[var(--accent-color)]"
                                                                            >
                                                                                {copiedMagnet === dl.magnet ? (
                                                                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 6"/></svg>
                                                                                ) : (
                                                                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                                                                                )}
                                                                                {copiedMagnet === dl.magnet ? '已复制' : '磁力'}
                                                                            </button>
                                                                        )}
                                                                        {dl.torrentUrl && (
                                                                            <a
                                                                                href={dl.torrentUrl}
                                                                                target="_blank"
                                                                                rel="noopener noreferrer"
                                                                                title="下载种子"
                                                                                className="flex items-center gap-1 px-2 py-0.5 rounded text-xs hover:bg-[var(--accent-color)]/10 transition-colors text-[var(--text-color-secondary)] hover:text-[var(--accent-color)]"
                                                                            >
                                                                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                                                                                种子
                                                                            </a>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    );
                                })()}

                                {downloads.length === 0 && !loading && firstResult && (
                                    <a
                                        href={firstResult.detailUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 mt-2 text-xs text-[var(--accent-color)] hover:underline"
                                    >
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                                            <polyline points="15 3 21 3 21 9"/>
                                            <line x1="10" y1="14" x2="21" y2="3"/>
                                        </svg>
                                        查看 BT 下载
                                    </a>
                                )}
                            </div>

                            {/* Other results */}
                            {data.results.length > 1 && (
                                <div className="pt-2 border-t border-[var(--glass-border)]">
                                    <div className="text-xs text-[var(--text-color-secondary)] mb-1.5">其他结果</div>
                                    {data.results.slice(1).map((result, index) => (
                                        <a
                                            key={index}
                                            href={result.detailUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="block text-sm text-[var(--text-color-secondary)] hover:text-[var(--accent-color)] transition-colors py-0.5 leading-snug"
                                            title={result.title}
                                        >
                                            {result.title}
                                        </a>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
