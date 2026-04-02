'use client';

import { useState, useEffect, useRef } from 'react';
import { TagManager } from '@/components/home/TagManager';
import { MovieGrid } from '@/components/home/MovieGrid';
import { PremiumContentGrid } from './PremiumContentGrid';
import { usePremiumTagManager } from '@/lib/hooks/usePremiumTagManager';
import { usePremiumContent } from '@/lib/hooks/usePremiumContent';
import { usePersonalizedRecommendations } from '@/components/home/hooks/usePersonalizedRecommendations';

interface PremiumContentProps {
    onSearch?: (query: string) => void;
}

export function PremiumContent({ onSearch }: PremiumContentProps) {
    const {
        tags,
        selectedTag,
        newTagInput,
        showTagManager,
        justAddedTag,
        setSelectedTag,
        setNewTagInput,
        setShowTagManager,
        setJustAddedTag,
        handleAddTag,
        handleDeleteTag,
        handleRestoreDefaults,
        handleDragEnd,
    } = usePremiumTagManager();

    const {
        movies: recommendMovies,
        loading: recommendLoading,
        hasMore: recommendHasMore,
        hasHistory,
        prefetchRef: recommendPrefetchRef,
        loadMoreRef: recommendLoadMoreRef,
    } = usePersonalizedRecommendations(true);

    // Track whether the recommendation tab is active.
    // Strategy: the INITIAL value of isRecommendSelected is determined ONCE on first render.
    // - Fresh visit with history (no cancel flag) → show "为你推荐" (initial = true)
    // - Cancel → restore flow                   → show tag view    (initial = false)
    // - Subsequent Zustand changes              → ignore (handled via user actions only)
    const _isFirstRenderRef = useRef(true);
    // Read cancel flag: ONLY set by handleCancelSearch (search cancel).
    // NOT set when returning from video detail page.
    const _shouldShowTagView = (window as any)._kvideo_cancel_search === true;

    const [isRecommendSelected, setIsRecommendSelected] = useState(() => {
        if (!_isFirstRenderRef.current) return false;
        return !_shouldShowTagView && hasHistory;
    });

    if (_isFirstRenderRef.current) {
        _isFirstRenderRef.current = false;
        delete (window as any)._kvideo_cancel_search;
    }

    const effectiveRecommendSelected = hasHistory && isRecommendSelected;

    // Get the category value from selected tag
    const categoryValue = tags.find(t => t.value === selectedTag)?.value || '';

    const {
        videos,
        loading,
        hasMore,
        prefetchRef,
        loadMoreRef,
    } = usePremiumContent(effectiveRecommendSelected ? '' : categoryValue);

    const handleVideoClick = (video: any) => {
        // Save current tag to window global so we can restore it after search cancel.
        const tagToSave = effectiveRecommendSelected ? '' : selectedTag;
        window._kvideo_tag_to_restore = tagToSave;

        if (onSearch) {
            onSearch(video.vod_name || video.title);
        }
    };

    const handleRecommendSelect = () => {
        setIsRecommendSelected(true);
    };

    const handleRegularTagSelect = (tagId: string) => {
        setIsRecommendSelected(false);
        setSelectedTag(tagId);
    };

    return (
        <div className="animate-fade-in">
            <TagManager
                tags={tags}
                selectedTag={effectiveRecommendSelected ? '' : selectedTag}
                showTagManager={showTagManager}
                newTagInput={newTagInput}
                justAddedTag={justAddedTag}
                onTagSelect={handleRegularTagSelect}
                onTagDelete={handleDeleteTag}
                onToggleManager={() => setShowTagManager(!showTagManager)}
                onRestoreDefaults={handleRestoreDefaults}
                onNewTagInputChange={setNewTagInput}
                onAddTag={handleAddTag}
                onDragEnd={handleDragEnd}
                onJustAddedTagHandled={() => setJustAddedTag(false)}
                recommendTag={hasHistory ? {
                    label: '为你推荐',
                    isSelected: effectiveRecommendSelected,
                    onSelect: handleRecommendSelect,
                } : undefined}
            />

            {effectiveRecommendSelected ? (
                <MovieGrid
                    movies={recommendMovies}
                    loading={recommendLoading}
                    hasMore={recommendHasMore}
                    onMovieClick={handleVideoClick}
                    prefetchRef={recommendPrefetchRef}
                    loadMoreRef={recommendLoadMoreRef}
                />
            ) : (
                <PremiumContentGrid
                    videos={videos}
                    loading={loading}
                    hasMore={hasMore}
                    onVideoClick={handleVideoClick}
                    prefetchRef={prefetchRef}
                    loadMoreRef={loadMoreRef}
                />
            )}
        </div>
    );
}
