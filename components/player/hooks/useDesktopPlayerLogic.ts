import { useMemo, useCallback } from 'react';
import { usePlaybackControls } from './desktop/usePlaybackControls';
import { useVolumeControls } from './desktop/useVolumeControls';
import { useProgressControls } from './desktop/useProgressControls';
import { useSkipControls } from './desktop/useSkipControls';
import { useFullscreenControls } from './desktop/useFullscreenControls';
import { useControlsVisibility } from './desktop/useControlsVisibility';
import { useUtilities } from './desktop/useUtilities';
import { useDesktopShortcuts } from './desktop/useDesktopShortcuts';
import { useDesktopPlayerState } from './useDesktopPlayerState';
import { getCopyUrl } from '../utils/urlUtils';
import { useCastControls } from './desktop/useCastControls';

type DesktopPlayerState = ReturnType<typeof useDesktopPlayerState>;

interface UseDesktopPlayerLogicProps {
    src: string;
    initialTime: number;
    shouldAutoPlay: boolean;
    onError?: (error: string) => void;
    onTimeUpdate?: (currentTime: number, duration: number) => void;
    refs: DesktopPlayerState['refs'];
    data: DesktopPlayerState['data'];
    actions: DesktopPlayerState['actions'];
    fullscreenType?: 'native' | 'window';
    isForceLandscape?: boolean;
}

export function useDesktopPlayerLogic({
    src,
    initialTime,
    shouldAutoPlay,
    onError,
    onTimeUpdate,
    refs,
    data,
    actions,
    fullscreenType = 'native',
    isForceLandscape = false
}: UseDesktopPlayerLogicProps) {
    const {
        videoRef, containerRef, progressBarRef, volumeBarRef,
        controlsTimeoutRef, speedMenuTimeoutRef, skipForwardTimeoutRef,
        skipBackwardTimeoutRef, volumeBarTimeoutRef, isDraggingProgressRef,
        isDraggingVolumeRef, mouseMoveThrottleRef, toastTimeoutRef
    } = refs;

    const {
        isPlaying,
        duration,
        volume,
        isMuted,
        fullscreenMode,
        showControls,
        playbackRate,
        showSpeedMenu,
        isPiPSupported,
        isAirPlaySupported,
        skipForwardAmount,
        skipBackwardAmount,
        showSkipForwardIndicator,
        showSkipBackwardIndicator,
        showMoreMenu
    } = data;

    const {
        setIsPlaying,
        setCurrentTime,
        setDuration,
        setBufferedTime,
        setVolume,
        setIsMuted,
        setIsFullscreen,
        setFullscreenMode,
        setShowControls,
        setIsLoading,
        setPlaybackRate,
        setShowSpeedMenu,
        setIsPiPSupported,
        setIsAirPlaySupported,
        setSkipForwardAmount,
        setSkipBackwardAmount,
        setShowSkipForwardIndicator,
        setShowSkipBackwardIndicator,
        setIsSkipForwardAnimatingOut,
        setIsSkipBackwardAnimatingOut,
        setShowVolumeBar,
        setToastMessage,
        setShowToast,
        setIsCastAvailable,
        setIsCasting,
        setShowMoreMenu
    } = actions;

    const playbackControls = usePlaybackControls({
        videoRef, isPlaying, setIsPlaying, setIsLoading,
        initialTime, shouldAutoPlay, setDuration, setBufferedTime, setCurrentTime, onTimeUpdate, onError,
        isDraggingProgressRef, speedMenuTimeoutRef, playbackRate, setPlaybackRate, setShowSpeedMenu,
        volume, isMuted
    });

    const volumeControls = useVolumeControls({
        videoRef, volumeBarRef, volume, isMuted,
        setVolume, setIsMuted, setShowVolumeBar,
        volumeBarTimeoutRef, isDraggingVolumeRef
    });

    const progressControls = useProgressControls({
        videoRef, progressBarRef, duration,
        setCurrentTime, isDraggingProgressRef,
        isRotated: isForceLandscape
    });

    const skipControls = useSkipControls({
        videoRef, duration, setCurrentTime,
        showSkipForwardIndicator, showSkipBackwardIndicator,
        skipForwardAmount, skipBackwardAmount,
        setShowSkipForwardIndicator, setShowSkipBackwardIndicator,
        setSkipForwardAmount, setSkipBackwardAmount,
        setIsSkipForwardAnimatingOut, setIsSkipBackwardAnimatingOut,
        skipForwardTimeoutRef, skipBackwardTimeoutRef
    });

    const fullscreenControls = useFullscreenControls({
        containerRef, videoRef, setIsFullscreen, fullscreenMode, setFullscreenMode,
        isPiPSupported, isAirPlaySupported, setIsPiPSupported, setIsAirPlaySupported,
        fullscreenType
    });

    const controlsVisibility = useControlsVisibility({
        isPlaying, showControls, showSpeedMenu, showMoreMenu,
        setShowControls, setShowSpeedMenu, setShowMoreMenu,
        controlsTimeoutRef, speedMenuTimeoutRef, mouseMoveThrottleRef
    });

    const utilities = useUtilities({
        src, setToastMessage, setShowToast, toastTimeoutRef
    });

    // Download handler
    const handleDownload = useCallback(() => {
        // Get original URL (strip proxy if present)
        let originalUrl = src;
        if (src.includes('/api/proxy?url=')) {
            const match = src.match(/url=([^&]*)/);
            if (match && match[1]) {
                originalUrl = decodeURIComponent(match[1]);
            }
        }

        // Check if it's an HLS stream
        const isHls = originalUrl.includes('.m3u8') || 
            originalUrl.includes('m3u8');

        if (isHls) {
            // HLS: open download progress page
            const downloadUrl = `/download?url=${encodeURIComponent(src)}`;
            window.open(downloadUrl, '_blank');
            return;
        }

        // For direct video files, trigger download
        const a = document.createElement('a');
        a.href = originalUrl;
        // Extract filename from URL or generate one
        const urlParts = originalUrl.split('/');
        const lastPart = urlParts[urlParts.length - 1];
        const hasExtension = lastPart.includes('.') && 
            (lastPart.endsWith('.mp4') || lastPart.endsWith('.mkv') || 
             lastPart.endsWith('.webm') || lastPart.endsWith('.avi') ||
             lastPart.endsWith('.mov') || lastPart.endsWith('.flv'));
        a.download = hasExtension ? lastPart : `video_${Date.now()}.mp4`;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        utilities.showToastNotification('开始下载视频');
    }, [src, utilities]);

    const castControls = useCastControls({
        src, videoRef, setIsCastAvailable, setIsCasting
    });

    useDesktopShortcuts({
        videoRef, isPlaying, volume, isPiPSupported,
        togglePlay: playbackControls.togglePlay,
        toggleMute: volumeControls.toggleMute,
        toggleFullscreen: fullscreenControls.toggleFullscreen,
        toggleWindowFullscreen: fullscreenControls.toggleWindowFullscreen,
        togglePictureInPicture: fullscreenControls.togglePictureInPicture,
        skipForward: skipControls.skipForward,
        skipBackward: skipControls.skipBackward,
        showVolumeBarTemporarily: volumeControls.showVolumeBarTemporarily,
        setShowControls, setVolume, setIsMuted, controlsTimeoutRef
    });

    return useMemo(() => ({
        handleMouseMove: controlsVisibility.handleMouseMove,
        handleTouchToggleControls: controlsVisibility.handleTouchToggleControls,
        togglePlay: playbackControls.togglePlay,
        handlePlay: playbackControls.handlePlay,
        handlePause: playbackControls.handlePause,
        handleTimeUpdateEvent: playbackControls.handleTimeUpdateEvent,
        handleLoadedMetadata: playbackControls.handleLoadedMetadata,
        handleProgressEvent: playbackControls.handleProgressEvent,
        handleVideoError: playbackControls.handleVideoError,
        handleProgressClick: progressControls.handleProgressClick,
        handleProgressMouseDown: progressControls.handleProgressMouseDown,
        handleProgressTouchStart: progressControls.handleProgressTouchStart,
        toggleMute: volumeControls.toggleMute,
        showVolumeBarTemporarily: volumeControls.showVolumeBarTemporarily,
        handleVolumeChange: volumeControls.handleVolumeChange,
        handleVolumeMouseDown: volumeControls.handleVolumeMouseDown,
        toggleFullscreen: fullscreenControls.toggleFullscreen,
        toggleNativeFullscreen: fullscreenControls.toggleNativeFullscreen,
        toggleWindowFullscreen: fullscreenControls.toggleWindowFullscreen,
        togglePictureInPicture: fullscreenControls.togglePictureInPicture,
        showAirPlayMenu: fullscreenControls.showAirPlayMenu,
        showCastMenu: castControls.showCastMenu,
        skipForward: skipControls.skipForward,
        skipBackward: skipControls.skipBackward,
        changePlaybackSpeed: playbackControls.changePlaybackSpeed,
        handleCopyLink: (type: 'original' | 'proxy' = 'original') => {
            const urlToCopy = getCopyUrl(src, type);
            utilities.handleCopyLink(urlToCopy);
        },
        handleDownload,
        startSpeedMenuTimeout: controlsVisibility.startSpeedMenuTimeout,
        clearSpeedMenuTimeout: controlsVisibility.clearSpeedMenuTimeout,
        formatTime: playbackControls.formatTime
    }), [
        src,
        controlsVisibility,
        playbackControls,
        progressControls,
        volumeControls,
        fullscreenControls,
        castControls,
        skipControls,
        utilities
    ]);
}
