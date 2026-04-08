'use client';

import { useRef, useState } from 'react';
import { Icons } from '@/components/ui/Icon';
import { parseSourcesFromJson, verifySources, type ImportReport, type SourceImportItem } from '@/lib/utils/source-import-utils';
import type { VideoSource } from '@/lib/types';

interface FileImportTabProps {
    /** Called with verified sources ready to merge (not full backup) */
    onImportVerified: (sources: VideoSource[]) => boolean | Promise<boolean>;
    /** All currently existing sources for dedup check */
    existingSources: VideoSource[];
}

type Step = 'select' | 'verifying' | 'preview' | 'importing';

export function FileImportTab({ onImportVerified, existingSources }: FileImportTabProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [step, setStep] = useState<Step>('select');
    const [progress, setProgress] = useState({ done: 0, total: 0 });
    const [report, setReport] = useState<ImportReport | null>(null);
    const [importing, setImporting] = useState(false);
    const [error, setError] = useState('');

    const existingBaseUrls = new Set(existingSources.map(s => s.baseUrl));

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setError('');
        setReport(null);

        let jsonString: string;
        try {
            jsonString = await file.text();
        } catch {
            setError('文件读取失败');
            return;
        }

        // Try to detect full settings backup (has top-level `sources` key)
        let parsed: Record<string, unknown>;
        try {
            parsed = JSON.parse(jsonString);
        } catch {
            setError('JSON 解析失败');
            return;
        }

        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
            const obj = parsed as Record<string, unknown>;
            // Full settings backup has `version` or `sources` at top level
            if ('sources' in obj || 'version' in obj || 'appVersion' in obj) {
                // Treat as full backup - import directly without verification
                setError('请使用「导入完整备份」功能');
                return;
            }
        }

        // Parse as source list
        const result = parseSourcesFromJson(jsonString);
        if (result.totalCount === 0) {
            setError('未找到有效的视频源，请确认 JSON 格式是否正确');
            return;
        }

        const sources = result.normalSources;
        if (sources.length === 0) {
            setError('未找到有效的视频源');
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
        const okSources = report.sources
            .filter(i => i.status === 'verified_ok')
            .map(i => i.source);

        setImporting(true);
        try {
            await onImportVerified(okSources);
        } finally {
            setImporting(false);
        }
        setStep('select');
        setReport(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleCancel = () => {
        setStep('select');
        setReport(null);
        setError('');
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const statusIcon = (status: SourceImportItem['status']) => {
        switch (status) {
            case 'verified_ok': return <Icons.Check size={14} className="text-green-500 shrink-0" />;
            case 'skipped_exists': return <Icons.SkipForward size={14} className="text-yellow-500 shrink-0" />;
            case 'skipped_invalid': return <Icons.AlertTriangle size={14} className="text-orange-500 shrink-0" />;
            case 'verified_failed': return <Icons.AlertTriangle size={14} className="text-red-500 shrink-0" />;
            default: return <Icons.RefreshCw size={14} className="text-gray-500 shrink-0 animate-spin" />;
        }
    };

    return (
        <div className="space-y-4">
            {/* Step: Select file */}
            {step === 'select' && (
                <>
                    <p className="text-xs text-[var(--text-color-secondary)]">
                        选择 JSON 格式的视频源文件。导入时将自动验证每个源的可访问性，
                        已存在的源（baseUrl 相同）将自动跳过。
                    </p>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".json,application/json"
                        onChange={handleFileChange}
                        className="hidden"
                    />
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full px-4 py-3 border-2 border-dashed border-[var(--glass-border)] rounded-[var(--radius-2xl)] text-sm text-[var(--text-color-secondary)] hover:border-[var(--accent-color)] hover:text-[var(--accent-color)] transition-all cursor-pointer flex items-center justify-center gap-2"
                    >
                        <Icons.Cloud size={16} />
                        选择 JSON 文件
                    </button>
                    {error && <p className="text-xs text-red-500">{error}</p>}
                </>
            )}

            {/* Step: Verifying */}
            {step === 'verifying' && (
                <div className="space-y-3">
                    <div className="flex items-center gap-3 text-sm text-[var(--text-color)]">
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

            {/* Step: Preview */}
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
                    <div className="max-h-[250px] overflow-y-auto space-y-1.5">
                        {report.sources.map((item, i) => (
                            <div key={i} className="flex items-start gap-2 px-3 py-2 bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-xl">
                                {statusIcon(item.status)}
                                <div className="min-w-0 flex-1">
                                    <p className="text-xs font-medium text-[var(--text-color)] truncate">{item.source.name}</p>
                                    <p className="text-[10px] text-[var(--text-color-secondary)] truncate">{item.source.baseUrl}</p>
                                    {item.error && (
                                        <p className="text-[10px] text-red-400 mt-0.5">{item.error}</p>
                                    )}
                                </div>
                                <span className="text-[10px] text-[var(--text-color-secondary)] shrink-0">
                                    {item.status === 'verified_ok' ? '可导入' :
                                     item.status === 'skipped_exists' ? '跳过' :
                                     item.status === 'skipped_invalid' ? '无效' :
                                     item.status === 'verified_failed' ? '失败' : ''}
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
                                <>
                                    <Icons.RefreshCw size={14} className="animate-spin" />
                                    导入中...
                                </>
                            ) : (
                                <>
                                    <Icons.Download size={14} />
                                    导入 {report.successCount} 个
                                </>
                            )}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
