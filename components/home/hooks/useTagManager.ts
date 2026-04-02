import { useState, useEffect, useLayoutEffect } from 'react';
import { DragEndEvent } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';

const DEFAULT_TAG = { id: 'popular', label: '热门', value: '热门' };

const STORAGE_KEY_PREFIX = 'kvideo_custom_tags_';
const SESSION_TAG_KEY = 'kvideo_last_tag';

// Global window key for cross-component tag restoration.
// sessionStorage works for same-origin navigations but gets lost in some Next.js router
// flows; a window global survives StrictMode unmount/remount cycles.
declare global {
    interface Window {
        _kvideo_tag_to_restore?: string;
    }
}

export function useTagManager() {
    const [contentType, setContentType] = useState<'movie' | 'tv'>(() => {
        if (typeof window === 'undefined') return 'movie';
        const saved = localStorage.getItem('kvideo_default_content_type');
        return saved === 'tv' ? 'tv' : 'movie';
    });

    // Initializer strategy for StrictMode safety:
    // 1. First init call: read window._kvideo_tag_to_restore, delete it, save to _kvideo_tag_session,
    //    set _kvideo_tag_restored = true. Return the tag value.
    // 2. StrictMode remount init call: window._kvideo_tag_to_restore is gone (deleted in step 1),
    //    but _kvideo_tag_session still has the value. Return it.
    // 3. Normal page load (no window restore): both are absent, return DEFAULT.
    const [selectedTag, setSelectedTag] = useState<string>(() => {
        if (typeof window === 'undefined') return DEFAULT_TAG.value;

        const winVal = (window as any)._kvideo_tag_to_restore;
        if (winVal !== undefined) {
            // First mount: found restore value in window. Delete it and cache in sessionStorage.
            delete (window as any)._kvideo_tag_to_restore;
            (window as any)._kvideo_tag_session = winVal;
            (window as any)._kvideo_tag_restored = true;
            console.log('[useTagManager init] restored from window:', winVal);
            return winVal;
        }

        const ssVal = (window as any)._kvideo_tag_session;
        if (ssVal !== undefined) {
            // StrictMode remount: window was already cleared, but sessionStorage survives.
            console.log('[useTagManager init] restored from session:', ssVal);
            return ssVal;
        }

        console.log('[useTagManager init] no restore value, returning DEFAULT:', DEFAULT_TAG.value);
        return DEFAULT_TAG.value;
    });

    // Effect: ensure sessionStorage is set if we restored from window.
    // NO cleanup: sessionStorage survives same-origin navigation and is needed across
    // StrictMode remounts (where cleanup runs BETWEEN the two mounts, not after).
    useLayoutEffect(() => {
        if ((window as any)._kvideo_tag_restored) {
            try { sessionStorage.setItem('_kvideo_tag_session', selectedTag); } catch (_) { /* ignore */ }
        }
    }, []);
    const [tags, setTags] = useState<any[]>([]);
    const [isLoadingTags, setIsLoadingTags] = useState(false);
    const [newTagInput, setNewTagInput] = useState('');
    const [showTagManager, setShowTagManager] = useState(false);
    const [justAddedTag, setJustAddedTag] = useState(false);

    // Persist content type preference
    useEffect(() => {
        localStorage.setItem('kvideo_default_content_type', contentType);
    }, [contentType]);

    const storageKey = `${STORAGE_KEY_PREFIX}${contentType}`;

    // Load custom tags or fetch from Douban
    useEffect(() => {
        const loadTags = async () => {
            const saved = localStorage.getItem(storageKey);
            if (saved) {
                try {
                    setTags(JSON.parse(saved));
                    return;
                } catch (e) {
                    console.error('Failed to parse saved tags', e);
                }
            }

            // If no saved tags, fetch from Douban
            setIsLoadingTags(true);
            try {
                const response = await fetch(`/api/douban/tags?type=${contentType}`);
                const data = await response.json();
                if (data.tags && Array.isArray(data.tags)) {
                    const mappedTags = data.tags.map((label: string) => ({
                        id: label === '热门' ? 'popular' : `tag_${label}`,
                        label,
                        value: label,
                    }));

                    // If "热门" isn't in the list, add it to the front
                    if (!mappedTags.some((t: any) => t.value === '热门')) {
                        mappedTags.unshift(DEFAULT_TAG);
                    }

                    setTags(mappedTags);
                } else {
                    setTags([DEFAULT_TAG]);
                }
            } catch (error) {
                console.error('Fetch tags error:', error);
                setTags([DEFAULT_TAG]);
            } finally {
                setIsLoadingTags(false);
            }
        };

        loadTags();
        // Do NOT set selectedTag here — useInsertionEffect handles restoration before paint.
    }, [contentType, storageKey]);

    const saveTags = (newTags: any[]) => {
        setTags(newTags);
        localStorage.setItem(storageKey, JSON.stringify(newTags));
    };

    const handleAddTag = () => {
        if (!newTagInput.trim()) return;
        const newTag = {
            id: `custom_${Date.now()}`,
            label: newTagInput.trim(),
            value: newTagInput.trim(),
        };
        saveTags([...tags, newTag]);
        setNewTagInput('');
        setJustAddedTag(true);
    };

    const handleDeleteTag = (tagId: string) => {
        saveTags(tags.filter(t => t.id !== tagId));
        if (selectedTag === tagId) {
            setSelectedTag('popular');
        }
    };

    const handleRestoreDefaults = async () => {
        localStorage.removeItem(storageKey);
        // Refresh by re-fetching
        setIsLoadingTags(true);
        try {
            const response = await fetch(`/api/douban/tags?type=${contentType}`);
            const data = await response.json();
            if (data.tags && Array.isArray(data.tags)) {
                const mappedTags = data.tags.map((label: string) => ({
                    id: label === '热门' ? 'popular' : `tag_${label}`,
                    label,
                    value: label,
                }));
                if (!mappedTags.some((t: any) => t.value === '热门')) {
                    mappedTags.unshift(DEFAULT_TAG);
                }
                setTags(mappedTags);
            } else {
                setTags([DEFAULT_TAG]);
            }
        } catch (error) {
            setTags([DEFAULT_TAG]);
        } finally {
            setIsLoadingTags(false);
        }
        setSelectedTag(DEFAULT_TAG.value);
        setShowTagManager(false);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            const oldIndex = tags.findIndex((tag) => tag.id === active.id);
            const newIndex = tags.findIndex((tag) => tag.id === over.id);
            saveTags(arrayMove(tags, oldIndex, newIndex));
        }
    };

    return {
        tags,
        selectedTag,
        contentType,
        newTagInput,
        showTagManager,
        justAddedTag,
        isLoadingTags,
        setContentType,
        setSelectedTag,
        setNewTagInput,
        setShowTagManager,
        setJustAddedTag,
        handleAddTag,
        handleDeleteTag,
        handleRestoreDefaults,
        handleDragEnd,
    };
}
