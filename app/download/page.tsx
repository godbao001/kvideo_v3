'use client';

import { useEffect, useRef, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

interface ProgressData {
    stage: 'idle' | 'starting' | 'converting' | 'downloading' | 'done' | 'error';
    percent: number;
    message: string;
    // Detailed info
    speed?: string;        // e.g. "2.5MB/s"
    elapsed?: string;      // e.g. "00:30"
    remaining?: string;    // e.g. "01:20"
    size?: string;         // e.g. "150MB / 500MB"
    filename?: string;
    errorMsg?: string;
    downloadedSize?: number;  // bytes
    totalSize?: number;       // bytes
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatTime(seconds: number): string {
    if (!isFinite(seconds) || seconds < 0) return '--:--';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
        return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function parseFilename(url: string): string {
    try {
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split('/').filter(Boolean);
        const lastPart = pathParts[pathParts.length - 1] || 'video';
        // Remove extension for display
        return decodeURIComponent(lastPart.replace(/\.[^.]+$/, '')).substring(0, 40);
    } catch {
        return 'video';
    }
}

function DownloadPage() {
    const searchParams = useSearchParams();
    const url = searchParams.get('url');
    const [progress, setProgress] = useState<ProgressData>({
        stage: 'idle',
        percent: 0,
        message: '正在初始化...',
    });
    const [canceled, setCanceled] = useState(false);
    const eventSourceRef = useRef<EventSource | null>(null);
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const startTimeRef = useRef<number>(Date.now());
    const [elapsedDisplay, setElapsedDisplay] = useState('00:00');

    // Elapsed time ticker
    useEffect(() => {
        if (progress.stage === 'converting' || progress.stage === 'downloading' || progress.stage === 'starting') {
            const interval = setInterval(() => {
                const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
                setElapsedDisplay(formatTime(elapsed));
            }, 1000);
            return () => clearInterval(interval);
        }
    }, [progress.stage]);

    useEffect(() => {
        if (!url) {
            setProgress({ stage: 'error', percent: 0, message: '缺少下载链接', errorMsg: '没有提供下载链接参数' });
            return;
        }

        startTimeRef.current = Date.now();
        const encodedUrl = encodeURIComponent(url);
        const filename = parseFilename(url);

        setProgress(prev => ({ ...prev, stage: 'starting', message: '正在连接服务器...', filename }));

        const eventSource = new EventSource(`/api/hls-download?url=${encodedUrl}&mode=progress`);
        eventSourceRef.current = eventSource;

        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);

                if (data.stage === 'starting') {
                    setProgress(prev => ({
                        ...prev,
                        stage: 'starting',
                        percent: 0,
                        message: '正在解析视频...',
                    }));
                } else if (data.stage === 'downloading' || data.stage === 'converting') {
                    setProgress(prev => ({
                        ...prev,
                        stage: data.stage,
                        percent: data.percent ?? prev.percent,
                        message: data.message || (data.stage === 'downloading' ? '正在下载...' : '转换中...'),
                        speed: data.speed,
                        elapsed: elapsedDisplay,
                        remaining: data.remaining,
                        size: data.size,
                        downloadedSize: data.downloadedSize,
                        totalSize: data.totalSize,
                    }));
                } else if (data.stage === 'done') {
                    setProgress({
                        stage: 'done',
                        percent: 100,
                        message: '转换完成！正在准备下载...',
                        filename,
                        elapsed: elapsedDisplay,
                    });
                    eventSource.close();

                    // Trigger download after short delay
                    setTimeout(() => {
                        const downloadUrl = `/api/hls-download?url=${encodedUrl}&mode=download`;
                        if (iframeRef.current) {
                            iframeRef.current.src = downloadUrl;
                        }
                    }, 800);
                } else if (data.stage === 'error') {
                    setProgress(prev => ({
                        ...prev,
                        stage: 'error',
                        message: data.message || '发生错误',
                        errorMsg: data.message || '未知错误',
                    }));
                    eventSource.close();
                }
            } catch {
                // Ignore parse errors from incomplete messages
            }
        };

        eventSource.onerror = () => {
            if (!canceled) {
                setProgress(prev => ({
                    ...prev,
                    stage: 'error',
                    message: '连接中断',
                    errorMsg: '服务器连接中断，请检查网络或刷新重试',
                }));
            }
            eventSource.close();
        };

        return () => {
            eventSource.close();
        };
    }, [url, canceled]);

    const handleCancel = () => {
        setCanceled(true);
        eventSourceRef.current?.close();
        setProgress(prev => ({
            ...prev,
            stage: 'error',
            message: '已取消',
            errorMsg: '用户取消了下载',
        }));
    };

    const handleRetry = () => {
        window.location.reload();
    };

    const stageLabel: Record<string, string> = {
        idle: '准备中',
        starting: '解析中',
        downloading: '下载中',
        converting: '转换中',
        done: '完成',
        error: '已中断',
    };

    const stageColor: Record<string, string> = {
        idle: 'text-gray-400',
        starting: 'text-yellow-400',
        downloading: 'text-blue-400',
        converting: 'text-purple-400',
        done: 'text-green-400',
        error: 'text-red-400',
    };

    const isActive = ['starting', 'downloading', 'converting'].includes(progress.stage);

    return (
        <div className="min-h-screen bg-[#0f0f0f] text-white flex items-center justify-center">
            <div className="w-full max-w-lg mx-4">
                <div className="bg-[#1a1a1a] rounded-2xl p-6 shadow-2xl border border-[#2a2a2a]">

                    {/* Header */}
                    <div className="flex items-center justify-between mb-5">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-lg">
                                🎬
                            </div>
                            <div>
                                <div className="text-xs text-gray-500 uppercase tracking-wider">HLS 视频转换下载</div>
                                <div className="text-sm font-medium text-white truncate max-w-[200px]" title={progress.filename || ''}>
                                    {progress.filename || 'video'}
                                </div>
                            </div>
                        </div>
                        {/* Stage badge */}
                        <div className={`text-xs font-medium px-2.5 py-1 rounded-full ${stageColor[progress.stage]} bg-opacity-20 ${progress.stage === 'done' ? 'bg-green-500/20 text-green-400' : progress.stage === 'error' ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400'}`}>
                            {stageLabel[progress.stage]}
                        </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="mb-4">
                        <div className="flex justify-between text-xs text-gray-400 mb-2">
                            <span className={stageColor[progress.stage]}>{progress.message}</span>
                            <span className="text-white font-medium">{progress.percent}%</span>
                        </div>
                        <div className="relative h-3 bg-[#2a2a2a] rounded-full overflow-hidden">
                            <div
                                className="absolute inset-y-0 left-0 rounded-full transition-all duration-500 ease-out"
                                style={{
                                    width: `${progress.percent}%`,
                                    background: progress.stage === 'done'
                                        ? 'linear-gradient(90deg, #22c55e, #4ade80)'
                                        : progress.stage === 'error'
                                        ? '#ef4444'
                                        : 'linear-gradient(90deg, #3b82f6, #8b5cf6, #ec4899)',
                                }}
                            />
                            {/* Shimmer effect when active */}
                            {isActive && (
                                <div
                                    className="absolute inset-y-0 left-0 rounded-full animate-pulse"
                                    style={{
                                        width: `${progress.percent}%`,
                                        backgroundImage: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)',
                                        backgroundSize: '200% 100%',
                                        animation: 'shimmer 2s infinite linear',
                                    }}
                                />
                            )}
                        </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-3 gap-3 mb-5">
                        <div className="bg-[#222] rounded-xl p-3 text-center">
                            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">耗时</div>
                            <div className="text-sm font-mono font-medium text-white">{elapsedDisplay}</div>
                        </div>
                        <div className="bg-[#222] rounded-xl p-3 text-center">
                            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">速度</div>
                            <div className="text-sm font-mono font-medium text-white">{progress.speed || '--'}</div>
                        </div>
                        <div className="bg-[#222] rounded-xl p-3 text-center">
                            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">剩余</div>
                            <div className="text-sm font-mono font-medium text-white">{progress.remaining || '--'}</div>
                        </div>
                    </div>

                    {/* Download info */}
                    {progress.downloadedSize != null && progress.downloadedSize > 0 && progress.totalSize > 0 && (
                        <div className="mb-4 text-center">
                            <span className="text-xs text-gray-500">
                                已下载 {formatBytes(progress.downloadedSize)} / 总计 {formatBytes(progress.totalSize)}
                            </span>
                        </div>
                    )}

                    {/* Done state */}
                    {progress.stage === 'done' && (
                        <div className="text-center mb-4 animate-pulse">
                            <div className="inline-flex items-center gap-2 bg-green-500/10 border border-green-500/30 text-green-400 rounded-full px-4 py-2">
                                <span>✅</span>
                                <span className="text-sm font-medium">文件已生成，浏览器开始下载</span>
                            </div>
                            <div className="mt-2 text-xs text-gray-500">如果没有弹出下载，请检查浏览器拦截设置</div>
                        </div>
                    )}

                    {/* Error state */}
                    {progress.stage === 'error' && (
                        <div className="text-center mb-4">
                            <div className="inline-flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-400 rounded-full px-4 py-2 mb-2">
                                <span>⚠️</span>
                                <span className="text-sm font-medium">{progress.errorMsg || '发生错误'}</span>
                            </div>
                        </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex gap-3 mt-4">
                        {isActive ? (
                            <button
                                onClick={handleCancel}
                                className="flex-1 py-2.5 px-4 rounded-xl bg-[#2a2a2a] hover:bg-[#333] text-gray-300 text-sm font-medium transition-colors border border-[#3a3a3a]"
                            >
                                取消下载
                            </button>
                        ) : (
                            <Link
                                href="/"
                                className="flex-1 py-2.5 px-4 rounded-xl bg-[#2a2a2a] hover:bg-[#333] text-gray-300 text-sm font-medium transition-colors text-center border border-[#3a3a3a]"
                            >
                                返回首页
                            </Link>
                        )}

                        {progress.stage === 'error' && (
                            <button
                                onClick={handleRetry}
                                className="flex-1 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
                            >
                                重新尝试
                            </button>
                        )}
                    </div>

                    {/* Footer tip */}
                    <div className="mt-4 pt-4 border-t border-[#2a2a2a] text-center">
                        <div className="text-[11px] text-gray-600">
                            {isActive
                                ? '💡 提示：大文件转换时间较长，请保持页面不要关闭'
                                : progress.stage === 'done'
                                ? '✅ 转换使用 FFmpeg 无损复制，速度极快'
                                : '🎬 支持 MP4/MKV/AVI 等常见格式'}
                        </div>
                    </div>
                </div>

                {/* Hidden iframe for actual download */}
                <iframe ref={iframeRef} style={{ display: 'none' }} />

                {/* Shimmer keyframes */}
                <style jsx global>{`
                    @keyframes shimmer {
                        from { background-position: -200% 0; }
                        to { background-position: 200% 0; }
                    }
                `}</style>
            </div>
        </div>
    );
}

export default function Page() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-[#0f0f0f] text-white flex items-center justify-center">
                <div className="text-gray-400 animate-pulse">加载中...</div>
            </div>
        }>
            <DownloadPage />
        </Suspense>
    );
}
