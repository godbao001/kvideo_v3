import { useState, useEffect, useCallback, useRef } from 'react';
import { useInfiniteScroll } from '@/lib/hooks/useInfiniteScroll';

interface DoubanMovie {
    id: string;
    title: string;
    cover: string;
    rate: string;
    url: string;
}

const PAGE_LIMIT = 20;

export function usePopularMovies(selectedTag: string, tags: any[], contentType: 'movie' | 'tv' = 'movie') {
    const [movies, setMovies] = useState<DoubanMovie[]>([]);
    const [loading, setLoading] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [page, setPage] = useState(0);

    // Store tags in a ref so loadMore can always use the latest tags without re-creation.
    const tagsRef = useRef(tags);
    tagsRef.current = tags;

    const loadMovies = useCallback(async (tag: string, pageStart: number, append = false) => {
        if (loading) return;

        setLoading(true);
        try {
            // Resolve tag value: try value lookup first (since selectedTag now stores value), then '热门'.
            const currentTags = tagsRef.current;
            const tagObj = currentTags.find(t => t.value === tag);
            const tagValue = tagObj?.value || (currentTags.length > 0 ? '热门' : tag);
            const response = await fetch(
                `/api/douban/recommend?type=${contentType}&tag=${encodeURIComponent(tagValue)}&page_limit=${PAGE_LIMIT}&page_start=${pageStart}`
            );

            if (!response.ok) throw new Error('Failed to fetch');

            const data = await response.json();
            const newMovies = data.subjects || [];

            setMovies(prev => append ? [...prev, ...newMovies] : newMovies);
            setHasMore(newMovies.length === PAGE_LIMIT);
        } catch (error) {
            console.error('Failed to load movies:', error);
            setHasMore(false);
        } finally {
            setLoading(false);
        }
    }, [loading, contentType]);

    // Reload when selectedTag or contentType changes. Always call with current tagsRef.current.
    // The tags.length===0 guard handles the restore-before-tags-load case.
    useEffect(() => {
        console.log('[usePopularMovies effect] selectedTag:', selectedTag, '| tags.length:', tags.length);
        setPage(0);
        setMovies([]);
        setHasMore(true);
        if (tags.length > 0) {
            console.log('[usePopularMovies effect] calling loadMovies with selectedTag:', selectedTag);
            loadMovies(selectedTag, 0, false);
        } else {
            console.log('[usePopularMovies effect] SKIPPED - tags not loaded yet');
        }
    }, [selectedTag, contentType, tags.length]);

    const { prefetchRef, loadMoreRef } = useInfiniteScroll({
        hasMore,
        loading,
        page,
        onLoadMore: (nextPage) => {
            setPage(nextPage);
            loadMovies(selectedTag, nextPage * PAGE_LIMIT, true);
        },
    });

    return {
        movies,
        loading,
        hasMore,
        prefetchRef,
        loadMoreRef,
    };
}
