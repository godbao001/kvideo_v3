import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

export const runtime = 'nodejs';

interface BtDownloadLink {
    label: string;    // e.g. "2160p", "1080p", "BluRay"
    size: string;    // e.g. "21.99GB"
    filename: string; // e.g. "复仇者联盟[国英多音轨].The.Avengers.2012.Bluray.2160p..."
    magnet: string;  // magnet:?xt=urn:btih:...
    torrentUrl: string; // direct torrent download URL
}

interface BtResult {
    title: string;
    genre: string;
    country: string;
    synopsis: string;
    detailUrl: string;
    year?: string;
    downloads?: BtDownloadLink[];
}

// Fetch magnet + torrent download links from a btbtla.com detail page
async function fetchDownloadLinks(detailUrl: string): Promise<BtDownloadLink[]> {
    try {
        const pageRes = await fetch(detailUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'zh-CN,zh;q=0.9',
            },
        });
        if (!pageRes.ok) return [];
        const pageHtml = await pageRes.text();
        const $page = cheerio.load(pageHtml);

        const downloads: BtDownloadLink[] = [];

        // Find all tdown links from the download-list section
        // Each <a class="module-row-text copy" href="/tdown/ID.html"> contains title info
        // Sibling <a class="btn-pc btn-down" href="/tdown/ID.html"> has the actual link
        // The magnet link is on the tdown page
        const tdownMap = new Map<string, { label: string; size: string; filename: string }>();

        $page('.module-row-text.copy').each((_, el) => {
            const href = $page(el).attr('href') || '';
            const match = href.match(/\/tdown\/(\d+)\.html/);
            if (!match) return;

            const tdownId = match[1];
            const fullTitle = $page(el).attr('title') || $page(el).find('h4').text() || '';

            // Extract label (resolution/format) and size from title
            // e.g. "复仇者联盟[国英多音轨+简繁英双语特效字幕].The.Avengers.2012.Bluray.2160p.x265.10bit.HDR.3Audio-SSDSSE 21.99GB.torrent"
            const sizeMatch = fullTitle.match(/\[?([\d.]+\s*(GB|MB|TB))/);
            const size = sizeMatch ? sizeMatch[1] : '';

            // Extract format label - look for patterns like "2160p", "1080p", "BluRay", "WebDL"
            const labelMatch = fullTitle.match(/\b(2160p|1080p|720p|4K|UHD|BluRay|WEB-DL|WEBrip|BRRip|HDRip|DVDRip|HDTV)/i);
            const label = labelMatch ? labelMatch[1].toUpperCase() : tdownId;

            tdownMap.set(tdownId, { label, size, filename: fullTitle });
        });

        // For all results, fetch tdown page to get magnet link
        const tdownIds = Array.from(tdownMap.keys()).slice(0, 20);

        for (const tdownId of tdownIds) {
            const info = tdownMap.get(tdownId)!;
            const tdownUrl = `https://www.btbtla.com/tdown/${tdownId}.html`;

            try {
                const tdownRes = await fetch(tdownUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0',
                        'Accept-Language': 'zh-CN,zh;q=0.9',
                    },
                });
                if (!tdownRes.ok) continue;

                const tdownHtml = await tdownRes.text();
                const $tdown = cheerio.load(tdownHtml);

                // Get magnet link
                const magnetEl = $tdown('a[href^="magnet:?xt="]').first();
                const magnet = magnetEl.attr('href') || '';

                // Get direct torrent download URL
                const torrentEl = $tdown('a[href^="/dlt/"]').first();
                let torrentUrl = torrentEl.attr('href') || '';
                if (torrentUrl && !torrentUrl.startsWith('http')) {
                    torrentUrl = `https://www.btbtla.com${torrentUrl}`;
                }

                if (magnet || torrentUrl) {
                    downloads.push({
                        label: info.label,
                        size: info.size,
                        filename: info.filename,
                        magnet,
                        torrentUrl,
                    });
                }
            } catch {
                // Silently skip failed tdown fetches
            }
        }

        return downloads;
    } catch {
        return [];
    }
}

export async function GET(request: NextRequest) {
    const query = request.nextUrl.searchParams.get('q');

    if (!query || query.trim().length < 2) {
        return NextResponse.json({ error: 'Query too short' }, { status: 400 });
    }

    const searchUrl = `https://www.btbtla.com/search?q=${encodeURIComponent(query.trim())}`;

    try {
        const response = await fetch(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'zh-CN,zh;q=0.9',
            },
        });

        if (!response.ok) {
            return NextResponse.json({ error: 'Search failed' }, { status: response.status });
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        const results: BtResult[] = [];

        // btbtla.com HTML structure:
        // <div class="module-item">
        //   <div class="module-item-cover">
        //     <div class="module-item-pic">
        //       <a href="/detail/288248.html" title="复仇者联盟">
        //     <div class="module-item-info">
        //       <span class="video-class">动作,科幻,奇幻,冒险</span>
        //       <span>美国</span>
        //     <div class="module-item-content">
        //       <div class="module-item-title">复仇者联盟</div>
        //       <div class="video-text">一股突如其来的强大邪恶势力...</div>
        $('.module-item').each((_, el) => {
            const $el = $(el);

            const detailLink = $el.find('.module-item-pic a').attr('href') || '';
            if (!detailLink.match(/\/detail\/\d+\.html/)) return;

            const title = $el.find('.module-item-title').text().trim() ||
                $el.find('.video-name').text().trim() ||
                $el.find('.module-item-pic a').attr('title') || '';
            if (!title || title.length < 2) return;

            const genre = $el.find('.video-class').text().trim();
            const country = $el.find('.module-item-info span').eq(1).text().trim() || '';
            const synopsis = $el.find('.video-text').text().replace(/\s+/g, ' ').trim().slice(0, 300);
            const yearMatch = (synopsis + title).match(/\b(19|20\d{2})\b/);
            const year = yearMatch ? yearMatch[1] : undefined;

            const fullUrl = `https://www.btbtla.com${detailLink}`;

            if (!results.some(r => r.title === title)) {
                results.push({ title, genre, country, synopsis, detailUrl: fullUrl, year });
            }
        });

        // For top result, fetch ALL download links
        if (results.length > 0) {
            const downloads = await fetchDownloadLinks(results[0].detailUrl);
            results[0].downloads = downloads;
        }

        return NextResponse.json({
            query,
            total: results.length,
            results: results.slice(0, 5),
        }, {
            headers: {
                'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
            },
        });

    } catch (error) {
        console.error('[bt-search] Error:', error);
        return NextResponse.json(
            { error: 'Search failed', message: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
