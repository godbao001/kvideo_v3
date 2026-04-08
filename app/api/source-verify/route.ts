/**
 * Source Verification API - Server-side HTTP probe for video sources
 * Avoids CORS issues and provides timeout control
 */

import { type NextRequest, NextResponse } from 'next/server';

const VALID_VIDEO_CONTENT_TYPES = [
  'application/json',
  'application/octet-stream',
  'video/mp4',
  'video/x-mpegurl',
  'application/x-mpegurl',
  'application/vnd.apple.mpegurl',
  'video/x-m4v',
  'application/xml',
  'text/plain',
];

const TIMEOUT_MS = 8000;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: '缺少 url 参数' }, { status: 400 });
  }

  // Validate URL
  let targetUrl: URL;
  try {
    targetUrl = new URL(url);
    if (!['http:', 'https:'].includes(targetUrl.protocol)) {
      return NextResponse.json({ error: '仅支持 http/https 协议' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: '无效的 URL 格式' }, { status: 400 });
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await fetch(targetUrl.toString(), {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow',
    });

    clearTimeout(timeoutId);

    const contentType = response.headers.get('content-type') || '';
    const cleanContentType = contentType.split(';')[0].trim().toLowerCase();

    if (!VALID_VIDEO_CONTENT_TYPES.includes(cleanContentType) && !contentType) {
      // Try GET with range header as fallback (some servers don't honor HEAD)
      const controller2 = new AbortController();
      const timeoutId2 = setTimeout(() => controller2.abort(), TIMEOUT_MS);

      try {
        const getResponse = await fetch(targetUrl.toString(), {
          method: 'GET',
          signal: controller2.signal,
          redirect: 'follow',
          headers: { Range: 'bytes=0-1024' },
        });
        clearTimeout(timeoutId2);

        const getContentType = getResponse.headers.get('content-type') || '';
        const getCleanType = getContentType.split(';')[0].trim().toLowerCase();

        if (!VALID_VIDEO_CONTENT_TYPES.includes(getCleanType) && !getCleanType) {
          return NextResponse.json({
            reachable: true,
            valid: false,
            contentType: getCleanType || 'unknown',
            error: '无法识别的内容类型，可能不是有效的视频源'
          });
        }

        return NextResponse.json({
          reachable: true,
          valid: true,
          contentType: getCleanType,
          status: getResponse.status,
        });
      } catch {
        clearTimeout(timeoutId2);
        return NextResponse.json({
          reachable: true,
          valid: false,
          error: '服务器响应格式异常'
        });
      }
    }

    return NextResponse.json({
      reachable: true,
      valid: true,
      contentType: cleanContentType,
      status: response.status,
    });
  } catch (err: unknown) {
    const error = err as Error;
    if (error.name === 'AbortError') {
      return NextResponse.json({
        reachable: false,
        valid: false,
        error: `连接超时（${TIMEOUT_MS / 1000}秒）`
      });
    }
    return NextResponse.json({
      reachable: false,
      valid: false,
      error: error.message || '网络错误'
    });
  }
}
