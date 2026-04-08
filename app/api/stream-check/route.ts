/**
 * Stream Check API Route - Lightweight server-side stream reachability check
 * Returns whether the stream URL is accessible and responsive
 */

import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { url } = body;

        if (!url || typeof url !== 'string') {
            return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
        }

        // Validate URL format
        try {
            new URL(url);
        } catch {
            return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
        }

        const startTime = Date.now();

        try {
            // Use a simple HEAD request with a short timeout viaAbortController
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000); // 3s timeout

            const response = await fetch(url, {
                method: 'HEAD',
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            const latency = Date.now() - startTime;

            return NextResponse.json({
                success: response.ok,
                latency,
                status: response.status,
            });
        } catch (fetchError) {
            const latency = Date.now() - startTime;
            const isTimeout = fetchError instanceof Error && fetchError.name === 'AbortError';

            return NextResponse.json({
                success: false,
                latency,
                timeout: isTimeout,
            });
        }
    } catch (error) {
        console.error('Stream check error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
