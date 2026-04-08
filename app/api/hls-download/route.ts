import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';

export const runtime = 'nodejs';

export async function GET(request: NextRequest): Promise<Response> {
    const url = request.nextUrl.searchParams.get('url');
    const mode = request.nextUrl.searchParams.get('mode') || 'progress';

    if (!url) {
        return new NextResponse('Missing URL parameter', { status: 400 });
    }

    let videoUrl = url;
    if (url.includes('/api/proxy?url=')) {
        const match = url.match(/url=([^&]*)/);
        if (match && match[1]) {
            videoUrl = decodeURIComponent(match[1]);
        }
    }

    const outputFilename = `video_${Date.now()}.mp4`;
    const outputPath = path.join(os.tmpdir(), outputFilename);

    // ========== SSE PROGRESS MODE ==========
    if (mode === 'progress') {
        const encoder = new TextEncoder();
        let ffmpeg: ReturnType<typeof spawn> | null = null;
        let closed = false;

        const stream = new ReadableStream({
            start(controller) {
                let duration = 0;
                let totalSize = 0;
                let currentSec = 0;
                let downloadedBytes = -1; // -1 so first real size triggers update
                let lastBytes = 0;
                let lastTime = Date.now();
                let lastSpeedBps = 0;
                let lastPercent = -1;
                let lastSpeedDisplay = '';

                const send = (data: object) => {
                    if (closed) return;
                    try {
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
                    } catch { /* ignore */ }
                };

                send({ stage: 'starting', percent: 0, message: '正在解析视频流...', speed: '', remaining: '' });

                ffmpeg = spawn('/usr/bin/ffmpeg', [
                    '-reconnect', '1',
                    '-reconnect_streamed', '1',
                    '-reconnect_delay_max', '5',
                    '-i', videoUrl,
                    '-c', 'copy',
                    '-bsf:a', 'aac_adtstoasc',
                    '-threads', '4',
                    '-y',
                    outputPath
                ]);

                let stderr = '';

                ffmpeg.stderr?.on('data', (data: Buffer) => {
                    const str = data.toString();
                    stderr += str;

                    // Content-Length from HTTP server
                    if (totalSize === 0) {
                        const m = str.match(/Content-Length:\s*(\d+)/);
                        if (m) totalSize = parseInt(m[1]);
                    }

                    // Duration from ffmpeg header
                    if (duration === 0) {
                        const dm = str.match(/Duration: (\d{2}):(\d{2}):(\d{2})/);
                        if (dm) {
                            duration = parseInt(dm[1]) * 3600 + parseInt(dm[2]) * 60 + parseInt(dm[3]);
                            send({
                                stage: 'downloading',
                                percent: 0,
                                message: `已连接，开始下载... (总时长 ${Math.floor(duration / 60)}分)`,
                                speed: '0 MB/s',
                                remaining: '计算中...',
                                totalSize,
                                downloadedSize: 0,
                            });
                        }
                    }

                    // Current time progress
                    const tm = str.match(/time=(\d{2}):(\d{2}):(\d{2})/);
                    if (tm && duration > 0) {
                        currentSec = parseInt(tm[1]) * 3600 + parseInt(tm[2]) * 60 + parseInt(tm[3]);
                    }
                });

                ffmpeg.on('close', (code) => {
                    if (closed) return;
                    if (code === 0 && fs.existsSync(outputPath)) {
                        const stats = fs.statSync(outputPath);
                        send({
                            stage: 'done',
                            percent: 100,
                            message: '转换完成，正在准备下载...',
                            speed: lastSpeedDisplay || 'N/A',
                            remaining: '00:00',
                            totalSize: stats.size,
                            downloadedSize: stats.size,
                        });
                    } else {
                        const lastErr = stderr.slice(-300).replace(/\n/g, ' ');
                        send({
                            stage: 'error',
                            percent: 0,
                            message: '转换失败',
                            errorMsg: code ? `exit ${code}: ${lastErr}` : lastErr || '未知错误',
                        });
                    }
                    closed = true;
                    try { controller.close(); } catch { /* ignore */ }
                });

                ffmpeg.on('error', (err: Error) => {
                    if (closed) return;
                    send({ stage: 'error', percent: 0, message: 'ffmpeg 启动失败', errorMsg: err.message });
                    closed = true;
                    try { controller.close(); } catch { /* ignore */ }
                });

                // Poll file size every 600ms for real download speed
                const pollInterval = setInterval(() => {
                    if (closed) { clearInterval(pollInterval); return; }

                    if (!fs.existsSync(outputPath)) return;

                    try {
                        const stats = fs.statSync(outputPath);
                        const size = stats.size;
                        const now = Date.now();

                        if (size > 0) {
                            // First update — initialize
                            if (downloadedBytes === -1) {
                                downloadedBytes = size;
                                lastBytes = size;
                                lastTime = now;
                                return;
                            }

                            // Size changed — calculate speed
                            if (size !== lastBytes) {
                                const timeDelta = (now - lastTime) / 1000;
                                if (timeDelta >= 0.4 && lastBytes > 0) {
                                    const bytesDelta = size - lastBytes;
                                    lastSpeedBps = bytesDelta / timeDelta;

                                    // Format speed
                                    if (lastSpeedBps >= 1024 * 1024) {
                                        lastSpeedDisplay = `${(lastSpeedBps / (1024 * 1024)).toFixed(1)} MB/s`;
                                    } else if (lastSpeedBps >= 1024) {
                                        lastSpeedDisplay = `${(lastSpeedBps / 1024).toFixed(0)} KB/s`;
                                    } else {
                                        lastSpeedDisplay = `${lastSpeedBps.toFixed(0)} B/s`;
                                    }

                                    lastBytes = size;
                                    lastTime = now;
                                }

                                downloadedBytes = size;

                                // Calculate percent
                                let percent = lastPercent;
                                if (totalSize > 0) {
                                    percent = Math.min(98, Math.round((size / totalSize) * 100));
                                } else if (duration > 0) {
                                    percent = Math.min(98, Math.round((currentSec / duration) * 100));
                                }

                                // Calculate remaining time
                                let remaining = '';
                                if (lastSpeedBps > 0) {
                                    if (totalSize > 0) {
                                        const remainBytes = totalSize - size;
                                        const remainSec = remainBytes / lastSpeedBps;
                                        if (isFinite(remainSec) && remainSec < 7200) {
                                            remaining = `${Math.floor(remainSec / 60)}:${(Math.floor(remainSec) % 60).toString().padStart(2, '0')}`;
                                        } else if (remainSec >= 7200) {
                                            remaining = `${Math.floor(remainSec / 3600)}小时+`;
                                        }
                                    } else if (duration > 0) {
                                        const remainSec = duration - currentSec;
                                        const estRemainBytes = remainSec > 0 ? (remainSec / currentSec) * size : 0;
                                        const estRemainSec = estRemainBytes / lastSpeedBps;
                                        if (isFinite(estRemainSec) && estRemainSec < 7200) {
                                            remaining = `${Math.floor(estRemainSec / 60)}:${(Math.floor(estRemainSec) % 60).toString().padStart(2, '0')}`;
                                        } else if (isFinite(estRemainSec) && estRemainSec >= 7200) {
                                            remaining = `${Math.floor(estRemainSec / 3600)}小时+`;
                                        }
                                    }
                                }
                                if (!remaining) remaining = '计算中...';

                                send({
                                    stage: 'downloading',
                                    percent,
                                    message: totalSize > 0
                                        ? `下载中 ${percent}%`
                                        : duration > 0
                                        ? `下载中 ${percent}% (时长${Math.floor(duration/60)}分)`
                                        : '下载中...',
                                    speed: lastSpeedDisplay,
                                    remaining,
                                    totalSize: totalSize > 0 ? totalSize : 0,
                                    downloadedSize: size,
                                });

                                if (percent !== lastPercent) lastPercent = percent;
                            }
                        }
                    } catch { /* ignore */ }
                }, 600);
            },

            cancel() {
                closed = true;
                if (ffmpeg) {
                    try { ffmpeg.kill('SIGTERM'); } catch { /* ignore */ }
                }
                if (fs.existsSync(outputPath)) {
                    try { fs.unlinkSync(outputPath); } catch { /* ignore */ }
                }
            }
        });

        return new Response(stream, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'X-Accel-Buffering': 'no',
            }
        });
    }

    // ========== DOWNLOAD MODE ==========
    return new Promise((resolve) => {
        const ffmpeg = spawn('/usr/bin/ffmpeg', [
            '-reconnect', '1',
            '-reconnect_streamed', '1',
            '-reconnect_delay_max', '5',
            '-i', videoUrl,
            '-c', 'copy',
            '-bsf:a', 'aac_adtstoasc',
            '-threads', '4',
            '-y',
            outputPath
        ]);

        let stderr = '';
        let exited = false;

        const cleanup = () => {
            if (fs.existsSync(outputPath)) {
                try { fs.unlinkSync(outputPath); } catch { /* ignore */ }
            }
        };

        const resolveWith = (res: NextResponse) => {
            if (!exited) { exited = true; cleanup(); }
            resolve(res);
        };

        ffmpeg.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });

        ffmpeg.on('close', (code) => {
            if (code === 0 && fs.existsSync(outputPath)) {
                const buf = fs.readFileSync(outputPath);
                resolveWith(new NextResponse(buf, {
                    status: 200,
                    headers: {
                        'Content-Type': 'video/mp4',
                        'Content-Disposition': `attachment; filename="${outputFilename}"`,
                        'Content-Length': buf.length.toString(),
                    }
                }));
            } else {
                resolveWith(new NextResponse(
                    JSON.stringify({ error: 'Conversion failed', details: stderr.slice(-500) }),
                    { status: 500, headers: { 'Content-Type': 'application/json' } }
                ));
            }
        });

        ffmpeg.on('error', (err: Error) => {
            resolveWith(new NextResponse(
                JSON.stringify({ error: 'ffmpeg not found', details: err.message }),
                { status: 500, headers: { 'Content-Type': 'application/json' } }
            ));
        });

        setTimeout(() => {
            if (!exited) {
                ffmpeg.kill();
                resolveWith(new NextResponse(
                    JSON.stringify({ error: 'Conversion timeout (30min)' }),
                    { status: 500, headers: { 'Content-Type': 'application/json' } }
                ));
            }
        }, 30 * 60 * 1000);
    });
}
