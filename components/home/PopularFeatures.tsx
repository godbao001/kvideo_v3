/**
 * PopularFeatures - Main component for popular movies section
 * Displays Douban movie recommendations with tag filtering and infinite scroll.
 * Includes personalized "为你推荐" tag when user has 2+ watched items.
 */

'use client';

import { useState, useEffect, useRef } from 'react';
import { TagManager } from './TagManager';
import { MovieGrid } from './MovieGrid';
import { useTagManager } from './hooks/useTagManager';
import { usePopularMovies } from './hooks/usePopularMovies';
import { usePersonalizedRecommendations } from './hooks/usePersonalizedRecommendations';

interface PopularFeaturesProps {
  onSearch?: (query: string) => void;
}

export function PopularFeatures({ onSearch }: PopularFeaturesProps) {  const {
    tags,
    selectedTag,
    contentType,
    newTagInput,
    showTagManager,
    justAddedTag,
    setContentType,
    setSelectedTag,
    setNewTagInput,
    setShowTagManager,
    setJustAddedTag,
    handleAddTag,
    handleDeleteTag,
    handleRestoreDefaults,
    handleDragEnd,
    isLoadingTags,
  } = useTagManager();

  const {
    movies: recommendMovies,
    loading: recommendLoading,
    hasMore: recommendHasMore,
    hasHistory,
    prefetchRef: recommendPrefetchRef,
    loadMoreRef: recommendLoadMoreRef,
  } = usePersonalizedRecommendations(false);

  // isRecommendSelected: controls whether to show tag list or "为你推荐".
  // Strategy: the INITIAL value of isRecommendSelected is determined ONCE on first render.
  // After first render, state only changes via user actions (no auto-enable from hasHistory).
  //
  // - Fresh visit with history (no cancel flag) → show "为你推荐" (initial = true)
  // - Cancel → restore flow                   → show tag view    (initial = false)
  // - Subsequent Zustand changes              → ignore (handled via user actions only)
  const _isFirstRenderRef = useRef(true);
  // Read cancel flag: ONLY set by handleCancelSearch (search cancel).
  // NOT set when returning from video detail page.
  const _cancelFlag = (window as any)._kvideo_cancel_search;
  const _shouldShowTagView = _cancelFlag === true;
  console.log('[PopularFeatures] _shouldShowTagView:', _shouldShowTagView, '| hasHistory:', hasHistory);

  // Determine initial state value during first render.
  // The initializer reads the window flag and decides: show "为你推荐" or tag view.
  const [isRecommendSelected, setIsRecommendSelected] = useState(() => {
    if (!_isFirstRenderRef.current) return false; // not first render — use cached
    return !_shouldShowTagView && hasHistory; // first render: fresh visit → "为你推荐"
  });

  // After first render, mark ref as false — never changes again.
  if (_isFirstRenderRef.current) {
    _isFirstRenderRef.current = false;
    // Clean up the cancel flag after reading it.
    delete (window as any)._kvideo_cancel_search;
  }

  const effectiveRecommendSelected = hasHistory && isRecommendSelected;

  const {
    movies,
    loading,
    hasMore,
    prefetchRef,
    loadMoreRef,
  } = usePopularMovies(
    effectiveRecommendSelected ? '' : selectedTag,
    tags,
    contentType
  );

  console.log('[PopularFeatures] selectedTag:', selectedTag, '| isRecommendSelected:', isRecommendSelected, '| effectiveRecommendSelected:', effectiveRecommendSelected, '| movies count:', movies.length);

  const handleMovieClick = (movie: any) => {
    // Save tag's ID (not display value) so UI tag selection can match by id.
    // The display value is resolved in loadMovies via tags lookup.
    const tagToSave = selectedTag;
    console.log('[handleMovieClick] saving tag ID:', tagToSave);
    window._kvideo_tag_to_restore = tagToSave;

    if (onSearch) {
      onSearch(movie.title);
    }
  };

  const handleRecommendSelect = () => {
    setIsRecommendSelected(true);
  };

  const handleRegularTagSelect = (tagId: string) => {
    // tagId is now the tag value (e.g., '欧美'), not the id (e.g., 'tag_欧美').
    // Use t.value for lookup since that's what we now store in selectedTag.
    if (tagId === 'custom_高级' || tags.find(t => t.value === tagId)?.label === '高级') {
      window.location.href = '/premium';
      return;
    }
    setIsRecommendSelected(false);
    setSelectedTag(tagId);
  };

  return (
    <div className="animate-fade-in">
      {/* Content Type Toggle (Capsule Liquid Glass - Fixed & Centered) */}
      {!effectiveRecommendSelected && (
        <div className="mb-10 flex justify-center">
          <div className="relative w-80 p-1 bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-full grid grid-cols-2 backdrop-blur-2xl shadow-lg ring-1 ring-white/10 overflow-hidden">
            {/* Sliding Indicator */}
            <div
              className="absolute top-1 bottom-1 w-[calc(50%-4px)] bg-[var(--accent-color)] rounded-full transition-transform duration-400 cubic-bezier(0.4, 0, 0.2, 1) shadow-[0_0_15px_rgba(0,122,255,0.4)]"
              style={{
                transform: `translateX(${contentType === 'movie' ? '4px' : 'calc(100% + 4px)'})`,
              }}
            />

            <button
              onClick={() => setContentType('movie')}
              className={`relative z-10 py-2.5 text-sm font-bold transition-colors duration-300 cursor-pointer flex justify-center items-center ${contentType === 'movie' ? 'text-white' : 'text-[var(--text-color-secondary)] hover:text-[var(--text-color)]'
                }`}
            >
              电影
            </button>
            <button
              onClick={() => setContentType('tv')}
              className={`relative z-10 py-2.5 text-sm font-bold transition-colors duration-300 cursor-pointer flex justify-center items-center ${contentType === 'tv' ? 'text-white' : 'text-[var(--text-color-secondary)] hover:text-[var(--text-color)]'
                }`}
            >
              电视剧
            </button>
          </div>
        </div>
      )}

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
        isLoadingTags={isLoadingTags}
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
          onMovieClick={handleMovieClick}
          prefetchRef={recommendPrefetchRef}
          loadMoreRef={recommendLoadMoreRef}
        />
      ) : (
        <MovieGrid
          movies={movies}
          loading={loading}
          hasMore={hasMore}
          onMovieClick={handleMovieClick}
          prefetchRef={prefetchRef}
          loadMoreRef={loadMoreRef}
        />
      )}
    </div>
  );
}
