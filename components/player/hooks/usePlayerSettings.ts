'use client';

import { useState, useEffect, useCallback } from 'react';
import { settingsStore, AdFilterMode } from '@/lib/store/settings-store';

/**
 * Hook to access and update player settings from the settings store
 * Provides reactive updates when settings change
 */
export function usePlayerSettings() {
    const [settings, setSettings] = useState(() => {
        const stored = settingsStore.getSettings();
        return {
            autoNextEpisode: stored.autoNextEpisode,
            autoSkipIntro: stored.autoSkipIntro,
            skipIntroSeconds: stored.skipIntroSeconds,
            autoSkipOutro: stored.autoSkipOutro,
            skipOutroSeconds: stored.skipOutroSeconds,
            showModeIndicator: stored.showModeIndicator,
            adFilter: stored.adFilter,
            adFilterMode: stored.adFilterMode,
            adKeywords: stored.adKeywords,
            fullscreenType: stored.fullscreenType,
            proxyMode: stored.proxyMode,
            danmakuEnabled: stored.danmakuEnabled,
            danmakuApiUrl: stored.danmakuApiUrl,
            danmakuOpacity: stored.danmakuOpacity,
            danmakuFontSize: stored.danmakuFontSize,
            danmakuDisplayArea: stored.danmakuDisplayArea,
        };
    });

    // Subscribe to settings changes
    useEffect(() => {
        const unsubscribe = settingsStore.subscribe(() => {
            const stored = settingsStore.getSettings();
            setSettings({
                autoNextEpisode: stored.autoNextEpisode,
                autoSkipIntro: stored.autoSkipIntro,
                skipIntroSeconds: stored.skipIntroSeconds,
                autoSkipOutro: stored.autoSkipOutro,
                skipOutroSeconds: stored.skipOutroSeconds,
                showModeIndicator: stored.showModeIndicator,
                adFilter: stored.adFilter,
                adFilterMode: stored.adFilterMode,
                adKeywords: stored.adKeywords,
                fullscreenType: stored.fullscreenType,
                proxyMode: stored.proxyMode,
                danmakuEnabled: stored.danmakuEnabled,
                danmakuApiUrl: stored.danmakuApiUrl,
                danmakuOpacity: stored.danmakuOpacity,
                danmakuFontSize: stored.danmakuFontSize,
                danmakuDisplayArea: stored.danmakuDisplayArea,
            });
        });
        return unsubscribe;
    }, []);

    const updateSetting = useCallback(<K extends keyof typeof settings>(
        key: K,
        value: typeof settings[K]
    ) => {
        const currentSettings = settingsStore.getSettings();
        settingsStore.saveSettings({
            ...currentSettings,
            [key]: value,
        });
    }, []);

    const setAutoNextEpisode = useCallback((value: boolean) => {
        updateSetting('autoNextEpisode', value);
    }, [updateSetting]);

    const setAutoSkipIntro = useCallback((value: boolean) => {
        updateSetting('autoSkipIntro', value);
    }, [updateSetting]);

    const setSkipIntroSeconds = useCallback((value: number) => {
        updateSetting('skipIntroSeconds', Math.max(0, value));
    }, [updateSetting]);

    const setAutoSkipOutro = useCallback((value: boolean) => {
        updateSetting('autoSkipOutro', value);
    }, [updateSetting]);

    const setSkipOutroSeconds = useCallback((value: number) => {
        updateSetting('skipOutroSeconds', Math.max(0, value));
    }, [updateSetting]);

    const setShowModeIndicator = useCallback((value: boolean) => {
        updateSetting('showModeIndicator', value);
    }, [updateSetting]);

    const setAdFilter = useCallback((value: boolean) => {
        updateSetting('adFilter', value);
    }, [updateSetting]);

    const setAdFilterMode = useCallback((value: AdFilterMode) => {
        updateSetting('adFilterMode', value);
    }, [updateSetting]);

    const setAdKeywords = useCallback((value: string[]) => {
        updateSetting('adKeywords', value);
    }, [updateSetting]);

    const setFullscreenType = useCallback((value: 'auto' | 'native' | 'window') => {
        updateSetting('fullscreenType', value);
    }, [updateSetting]);

    const setProxyMode = useCallback((value: 'retry' | 'none' | 'always') => {
        updateSetting('proxyMode', value);
    }, [updateSetting]);

    const setDanmakuEnabled = useCallback((value: boolean) => {
        updateSetting('danmakuEnabled', value);
    }, [updateSetting]);

    const setDanmakuApiUrl = useCallback((value: string) => {
        updateSetting('danmakuApiUrl', value);
    }, [updateSetting]);

    const setDanmakuOpacity = useCallback((value: number) => {
        updateSetting('danmakuOpacity', Math.max(0.1, Math.min(1, value)));
    }, [updateSetting]);

    const setDanmakuFontSize = useCallback((value: number) => {
        updateSetting('danmakuFontSize', value);
    }, [updateSetting]);

    const setDanmakuDisplayArea = useCallback((value: number) => {
        updateSetting('danmakuDisplayArea', value);
    }, [updateSetting]);

    return {
        ...settings,
        setAutoNextEpisode,
        setAutoSkipIntro,
        setSkipIntroSeconds,
        setAutoSkipOutro,
        setSkipOutroSeconds,
        setShowModeIndicator,
        setAdFilter,
        setAdFilterMode,
        setAdKeywords,
        setFullscreenType,
        setProxyMode,
        setDanmakuEnabled,
        setDanmakuApiUrl,
        setDanmakuOpacity,
        setDanmakuFontSize,
        setDanmakuDisplayArea,
    };
}
