'use client';

import { useState } from 'react';
import { fetchSourcesFromUrl, verifySources, type ImportReport, type SourceImportItem } from '@/lib/utils/source-import-utils';
import type { VideoSource } from '@/lib/types';
import { Icons } from '@/components/ui/Icon';

interface LinkImportTabProps {
    onImportVerified: (sources: VideoSource[]) => boolean | Promise<boolean>;
    existingSources: VideoSource[];
}

type Step = 'input' | 'parsing' | 'verifying' | 'preview' | 'importing';

export function LinkImportTab({ onImportVerified, existingSources }: LinkImportTabProps) {
    const [url, setUrl] = useState('');
    const [step, setStep] = useState<Step>('input');
    const [error, setError] = useState('');
    const [progress, setProgress] = useState({ done: 0, total: 0 });
    const [report, setReport] = useState<ImportReport | null>(null);
    const [importing, setImporting] = useState(false);
    const [success, setSuccess] = useState(false);

    const existingBaseUrls = new Set(existingSources.map(s => s.baseUrl));

    const handleFetch = async () => {
        if (!url.trim()) return;
        setError('');
        setStep('parsing');

        let result: Awaited<ReturnType<typeof fetchSourcesFromUrl>>;
        try {
            result = await fetchSourcesFromUrl(url);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : '获取链接失败，请检查 URL 是否正确');
            setStep('input');
            return;
        }

        if (result.totalCount === 0) {
            setError('未在响应中找到有效的视频源');
            setStep('input');
            return;
        }

        const sources = result.normalSources;
        if (sources.length === 0) {
            setError('未找到有效的视频源');
            setStep('input');
            return;
        }

        // Start verification
        setStep('verifying');
        setProgress({ done: 0, total: sources.length });

        const importReport = await verifySources(sources, existingBaseUrls, (done, total) => {
            setProgress({ done, total });
        });

        setReport(importReport);
        setStep('preview');
    };

    const handleConfirmImport = async () => {
        if (!report) return;
        setImporting(true);
        try {
            const okSources = report.sources
                .filter(i => i.status === 'verified_ok')
                .map(i => i.source);
            const result = await onImportVerified(okSources);
            if (result) {
                setSuccess(true);
                setReport(null);
                setUrl('');
                setStep('input');
            } else {
                setError('导入处理失败');
            }
        } catch {
            setError('导入过程发生错误');
        } finally {
            setImporting(false);
        }
    };

    const handleCancel = () => {
        setStep('input');
        setReport(null);
        setError('');
        setUrl('');
    };

    const statusLabel: Record<SourceImportItem['status'], string> = {
        verified_ok: '可导入',
        skipped_exists: '已存在',
        skipped_invalid: '格式无效',
        verified_failed: '连接失败',
        pending: '等待中',
        imported: '已导入',
    };

    return (
        <div className="space-y-4">
            {/* Input step */}
            {step === 'input' && (
                <>
                    <p className="text-xs text-[var(--text-color-secondary)]">
                        输入 JSON 源文件的网址。导入时将验证每个源的可访问性，
                        已存在的源（baseUrl 相同）将自动跳过。
                    </p>
                    <div className="flex gap-2">
                        <input
                            type="url"
                            value={url}
                            onChange={e => setUrl(e.target.value)}
                            placeholder="https://example.com/sources.json"
                            onKeyDown={e => e.key === 'Enter' && handleFetch()}
                            className="flex-1 bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-[var(--radius-2xl)] px-4 py-3 text-[var(--text-color)] placeholder:text-[var(--text-color-secondary)] focus:outline-none focus:border-[var(--accent-color)] transition-all text-sm"
                        />
                        <button
                            onClick={handleFetch}
                            disabled={!url.trim()}
                            className="px-6 py-3 rounded-[var(--radius-2xl)] bg-[var(--accent-color)] text-white font-medium hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all min-w-[100px] flex items-center justify-center"
                        >
                            获取
                        </button>
                    </div>
                    {error && (
                        <p className="text-xs text-red-500 px-1">{error}</p>
                    )}
                </>
            )}

            {/* Parsing step */}
            {step === 'parsing' && (
                <div className="flex items-center gap-2 text-sm text-[var(--text-color-secondary)] py-2">
                    <Icons.RefreshCw size={16} className="animate-spin text-[var(--accent-color)]" />
                    <span>正在获取并解析...</span>
                </div>
            )}

            {/* Verifying step */}
            {step === 'verifying' && (
                <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm text-[var(--text-color)]">
                        <Icons.RefreshCw size={16} className="animate-spin text-[var(--accent-color)]" />
                        <span>正在验证 sources... {progress.done}/{progress.total}</span>
                    </div>
                    <div className="w-full h-2 bg-[var(--glass-bg)] rounded-full overflow-hidden">
                        <div
                            className="h-full bg-[var(--accent-color)] transition-all duration-300"
                            style={{ width: progress.total > 0 ? `${(progress.done / progress.total) * 100}%` : '0%' }}
                        />
                    </div>
                    <p className="text-xs text-[var(--text-color-secondary)]">
                        正在检测每个源是否可访问，请稍候...
                    </p>
                </div>
            )}

            {/* Preview step */}
            {step === 'preview' && report && (
                <div className="space-y-3">
                    {/* Summary */}
                    <div className="grid grid-cols-2 gap-2">
                        {report.successCount > 0 && (
                            <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-[var(--radius-2xl)]">
                                <p className="text-xs text-green-500 font-medium">可导入</p>
                                <p className="text-lg font-bold text-green-500">{report.successCount}</p>
                            </div>
                        )}
                        {report.failedCount > 0 && (
                            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-[var(--radius-2xl)]">
                                <p className="text-xs text-red-500 font-medium">连接失败</p>
                                <p className="text-lg font-bold text-red-500">{report.failedCount}</p>
                            </div>
                        )}
                        {report.skippedExistsCount > 0 && (
                            <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-[var(--radius-2xl)]">
                                <p className="text-xs text-yellow-500 font-medium">已存在</p>
                                <p className="text-lg font-bold text-yellow-500">{report.skippedExistsCount}</p>
                            </div>
                        )}
                        {report.skippedInvalidCount > 0 && (
                            <div className="p-3 bg-orange-500/10 border border-orange-500/30 rounded-[var(--radius-2xl)]">
                                <p className="text-xs text-orange-500 font-medium">格式无效</p>
                                <p className="text-lg font-bold text-orange-500">{report.skippedInvalidCount}</p>
                            </div>
                        )}
                    </div>

                    {/* Source list */}
                    <div className="max-h-[200px] overflow-y-auto space-y-1.5">
                        {report.sources.map((item, i) => (
                            <div key={i} className="flex items-start gap-2 px-3 py-2 bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-xl">
                                {item.status === 'verified_ok' && <Icons.Check size={14} className="text-green-500 shrink-0 mt-0.5" />}
                                {item.status === 'skipped_exists' && <Icons.SkipForward size={14} className="text-yellow-500 shrink-0 mt-0.5" />}
                                {item.status === 'skipped_invalid' && <Icons.AlertTriangle size={14} className="text-orange-500 shrink-0 mt-0.5" />}
                                {item.status === 'verified_failed' && <Icons.AlertTriangle size={14} className="text-red-500 shrink-0 mt-0.5" />}
                                <div className="min-w-0 flex-1">
                                    <p className="text-xs font-medium text-[var(--text-color)] truncate">{item.source.name}</p>
                                    <p className="text-[10px] text-[var(--text-color-secondary)] truncate">{item.source.baseUrl}</p>
                                    {item.error && <p className="text-[10px] text-red-400 mt-0.5">{item.error}</p>}
                                </div>
                                <span className="text-[10px] text-[var(--text-color-secondary)] shrink-0 mt-0.5">
                                    {statusLabel[item.status]}
                                </span>
                            </div>
                        ))}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                        <button
                            onClick={handleCancel}
                            className="flex-1 px-4 py-2.5 bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--text-color)] rounded-[var(--radius-2xl)] text-sm hover:bg-[var(--glass-hover)] transition-all cursor-pointer"
                        >
                            取消
                        </button>
                        <button
                            onClick={handleConfirmImport}
                            disabled={importing || report.successCount === 0}
                            className="flex-1 px-4 py-2.5 bg-[var(--accent-color)] text-white rounded-[var(--radius-2xl)] text-sm font-medium hover:brightness-110 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1"
                        >
                            {importing ? (
                                <><Icons.RefreshCw size={14} className="animate-spin" /> 导入中...</>
                            ) : (
                                <><Icons.Download size={14} /> 导入 {report.successCount} 个</>
                            )}
                        </button>
                    </div>

                    {error && <p className="text-xs text-red-500">{error}</p>}
                </div>
            )}

            {/* Success */}
            {success && (
                <div className="text-sm text-green-500 bg-green-500/10 border border-green-500/30 rounded-[var(--radius-2xl)] px-4 py-3 flex items-center gap-2">
                    <Icons.Check size={16} />
                    导入成功！正在刷新...
                </div>
            )}
        </div>
    );
}
