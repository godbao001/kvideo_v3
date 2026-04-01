'use client';

import React from 'react';
import { useDesktopPlayerState } from './hooks/useDesktopPlayerState';
import { useDesktopPlayerLogic } from './hooks/useDesktopPlayerLogic';
import { useHlsPlayer } from './hooks/useHlsPlayer';
import { useAutoSkip } from './hooks/useAutoSkip';
import { useStallDetection } from './hooks/useStallDetection';
import { useVideoResolution } from './hooks/useVideoResolution';
import { DesktopControlsWrapper } from './desktop/DesktopControlsWrapper';
import { DesktopOverlayWrapper } from './desktop/DesktopOverlayWrapper';
import { DanmakuCanvas } from './DanmakuCanvas';
import { usePlayerSettings } from './hooks/usePlayerSettings';
import { useDanmaku } from './hooks/useDanmaku';
import { useIsIOS, useIsMobile } from '@/lib/hooks/mobile/useDeviceDetection';
import { useDoubleTap } from '@/lib/hooks/mobile/useDoubleTap';
import './web-fullscreen.css';

type WebFullscreenSize = 'full' | 'large' | 'focused';

const WEB_FULLSCREEN_SIZE_KEY = 'kvideo-web-fullscreen-size';
const WEB_FULLSCREEN_SIZE_ORDER: WebFullscreenSize[] = ['full', 'large', 'focused'];

interface DesktopVideoPlayerProps {
  src: string;
  poster?: string;
  onError?: (error: string) => void;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  initialTime?: number;
  shouldAutoPlay?: boolean;
  // Episode navigation props for auto-skip/auto-next
  totalEpisodes?: number;
  currentEpisodeIndex?: number;
  onNextEpisode?: () => void;
  isReversed?: boolean;
  // Danmaku props
  videoTitle?: string;
  episodeName?: string;
  // Resolution callback
  onResolutionDetected?: (info: import('./hooks/useVideoResolution').VideoResolutionInfo) => void;
}

export function DesktopVideoPlayer({
  src,
  poster,
  onError,
  onTimeUpdate,
  initialTime = 0,
  shouldAutoPlay = false,
  totalEpisodes = 1,
  currentEpisodeIndex = 0,
  onNextEpisode,
  isReversed = false,
  videoTitle = '',
  episodeName = '',
  onResolutionDetected,
}: DesktopVideoPlayerProps) {
  const { refs, data, actions } = useDesktopPlayerState();
  const { fullscreenType: settingsFullscreenType } = usePlayerSettings();
  const isIOS = useIsIOS();
  const isMobile = useIsMobile();
  const [webFullscreenSize, setWebFullscreenSize] = React.useState<WebFullscreenSize>(() => {
    if (typeof window === 'undefined') return 'full';
    const saved = localStorage.getItem(WEB_FULLSCREEN_SIZE_KEY);
    return saved === 'large' || saved === 'focused' || saved === 'full' ? saved : 'full';
  });
  const [fullscreenClock, setFullscreenClock] = React.useState('');

  // Detect actual video resolution
  const videoResolution = useVideoResolution(refs.videoRef);

  // Notify parent when resolution is detected
  React.useEffect(() => {
    if (videoResolution && onResolutionDetected) {
      onResolutionDetected(videoResolution);
    }
  }, [videoResolution, onResolutionDetected]);

  // Danmaku
  const { danmakuEnabled, comments: danmakuComments } = useDanmaku({
    videoTitle,
    episodeName,
    episodeIndex: currentEpisodeIndex,
  });

  // State to track if device is in landscape mode
  const [isLandscape, setIsLandscape] = React.useState(true);

  React.useEffect(() => {
    const checkOrientation = () => {
      // Check if width > height
      if (typeof window !== 'undefined') {
        setIsLandscape(window.innerWidth > window.innerHeight);
      }
    };

    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);
    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, []);

  // Use user preference for fullscreen type, resolving 'auto' to device default
  // Auto Rules:
  // - Mobile: Window Fullscreen (Better for Danmaku/Controls)
  // - Desktop: Native Fullscreen (Better for PiP/Performance)
  const fullscreenType = settingsFullscreenType === 'auto'
    ? (isIOS ? 'window' : isMobile ? 'window' : 'native') // Treat all mobile as window for consistency if auto
    : settingsFullscreenType;

  // Check if we need to force landscape (iOS + Fullscreen + Portrait)
  const shouldForceLandscape = data.fullscreenMode === 'window' && isIOS && !isLandscape;

  React.useEffect(() => {
    localStorage.setItem(WEB_FULLSCREEN_SIZE_KEY, webFullscreenSize);
  }, [webFullscreenSize]);

  React.useEffect(() => {
    if (!data.isFullscreen) {
      setFullscreenClock('');
      return;
    }

    const formatter = new Intl.DateTimeFormat('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const updateClock = () => {
      setFullscreenClock(formatter.format(new Date()));
    };

    updateClock();
    const interval = window.setInterval(updateClock, 30000);
    return () => window.clearInterval(interval);
  }, [data.isFullscreen]);

  // Initialize HLS Player
  useHlsPlayer({
    videoRef: refs.videoRef,
    src,
    autoPlay: shouldAutoPlay
  });

  const {
    videoRef,
    containerRef,
  } = refs;

  const {
    isPlaying,
    currentTime,
    duration,
  } = data;

  const {
    setShowControls,
    setBufferedTime,
    setIsLoading,
  } = actions;

  // Reset loading state and show spinner when source changes
  React.useEffect(() => {
    setIsLoading(true);
    setBufferedTime(0);
  }, [src, setBufferedTime, setIsLoading]);

  const logic = useDesktopPlayerLogic({
    src,
    initialTime,
    shouldAutoPlay,
    onError,
    onTimeUpdate,
    refs,
    data,
    actions,
    fullscreenType,
    isForceLandscape: shouldForceLandscape
  });

  // Auto-skip intro/outro and auto-next episode
  const { isTransitioningToNextEpisode } = useAutoSkip({
    videoRef,
    currentTime,
    duration,
    isPlaying,
    totalEpisodes,
    currentEpisodeIndex,
    onNextEpisode,
    isReversed,
    src,
  });

  // Sensitive stalling detection (e.g. video stuck but HTML5 state says playing)
  useStallDetection({
    videoRef,
    isPlaying: data.isPlaying,
    isDraggingProgressRef: refs.isDraggingProgressRef,
    setIsLoading: actions.setIsLoading,
    isTransitioningToNextEpisode
  });

  const {
    handleMouseMove,
    handleTouchToggleControls,
    togglePlay,
    handlePlay,
    handlePause,
    handleTimeUpdateEvent,
    handleLoadedMetadata,
    handleProgressEvent,
    handleVideoError,
  } = logic;

  const cycleWebFullscreenSize = React.useCallback(() => {
    setWebFullscreenSize((current) => {
      const currentIndex = WEB_FULLSCREEN_SIZE_ORDER.indexOf(current);
      return WEB_FULLSCREEN_SIZE_ORDER[(currentIndex + 1) % WEB_FULLSCREEN_SIZE_ORDER.length];
    });
  }, []);

  const stageClassName = data.fullscreenMode === 'window'
    ? `kvideo-stage kvideo-web-fullscreen-stage web-fullscreen-size-${webFullscreenSize}`
    : 'kvideo-stage absolute inset-0';

  // Mobile double-tap gesture for skip forward/backward
  const { handleTap } = useDoubleTap({
    onSingleTap: handleTouchToggleControls,
    onDoubleTapLeft: () => {
      logic.skipBackward();
      handleMouseMove(); // Reset 3s auto-hide timer
    },
    onDoubleTapRight: () => {
      logic.skipForward();
      handleMouseMove(); // Reset 3s auto-hide timer
    },
    onSkipContinueLeft: () => {
      logic.skipBackward();
      handleMouseMove();
    },
    onSkipContinueRight: () => {
      logic.skipForward();
      handleMouseMove();
    },
    isSkipModeActive: data.showSkipForwardIndicator || data.showSkipBackwardIndicator,
  });

  return (
    <div
      ref={containerRef}
      className={`kvideo-container relative aspect-video bg-black rounded-[var(--radius-2xl)] group ${data.fullscreenMode === 'window' ? 'is-web-fullscreen' : ''
        } ${shouldForceLandscape ? 'force-landscape' : ''}`}
      onMouseMove={() => { handleMouseMove(); }}
      onMouseLeave={() => isPlaying && setShowControls(false)}
    >
      <div className={stageClassName}>
        {/* Clipping Wrapper for video and overlays - Restores the 'Liquid Glass' rounded look */}
        <div className={`absolute inset-0 overflow-hidden pointer-events-none ${data.fullscreenMode === 'window' ? 'rounded-0' : 'rounded-[var(--radius-2xl)]'
          }`}>
          <div className="absolute inset-0 pointer-events-auto">
          {/* Video Element */}
          <video
            ref={videoRef}
            className="w-full h-full object-contain"
            poster={poster}
            x-webkit-airplay="allow"
            playsInline={true} // Crucial for iOS custom fullscreen to work without native player taking over
            controls={false} // Explicitly disable native controls
            onPlay={handlePlay}
            onPause={handlePause}
            onTimeUpdate={handleTimeUpdateEvent}
            onLoadedMetadata={handleLoadedMetadata}
            onProgress={handleProgressEvent}
            onError={handleVideoError}
            onWaiting={() => setIsLoading(true)}
            onCanPlay={() => setIsLoading(false)}
            onClick={!isMobile ? () => {
              togglePlay();
            } : undefined}
            onTouchStart={isMobile ? handleTap : undefined}
            {...({ 'webkit-playsinline': 'true' } as any)} // Legacy iOS support
          />

          {/* Danmaku Canvas */}
          {danmakuEnabled && danmakuComments.length > 0 && (
            <DanmakuCanvas
              comments={danmakuComments}
              currentTime={currentTime}
              isPlaying={isPlaying}
              duration={duration}
            />
          )}

          {/* Video Resolution Badge - follows controls bar visibility */}
          {videoResolution && (
            <div className={`absolute top-3 left-3 z-20 pointer-events-none transition-opacity duration-300 ${data.showControls ? 'opacity-80' : 'opacity-0'}`}>
              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold text-white ${videoResolution.color}`}>
                {videoResolution.label}
                <span className="font-normal opacity-80">{videoResolution.width}x{videoResolution.height}</span>
              </span>
            </div>
          )}

          <DesktopOverlayWrapper
            data={data}
            showControls={data.showControls}
            isFullscreen={data.isFullscreen}
            fullscreenClock={fullscreenClock}
            isRotated={shouldForceLandscape}
            onTogglePlay={togglePlay}
            onSkipForward={logic.skipForward}
            onSkipBackward={logic.skipBackward}
            isTransitioningToNextEpisode={isTransitioningToNextEpisode}
            // More Menu Props
            showMoreMenu={data.showMoreMenu}
            isProxied={src.includes('/api/proxy')}
            onToggleMoreMenu={() => actions.setShowMoreMenu(!data.showMoreMenu)}
            onMoreMenuMouseEnter={() => {
              if (refs.moreMenuTimeoutRef.current) {
                clearTimeout(refs.moreMenuTimeoutRef.current);
                refs.moreMenuTimeoutRef.current = null;
              }
            }}
            onMoreMenuMouseLeave={() => {
              if (refs.moreMenuTimeoutRef.current) {
                clearTimeout(refs.moreMenuTimeoutRef.current);
              }
              refs.moreMenuTimeoutRef.current = setTimeout(() => {
                actions.setShowMoreMenu(false);
                refs.moreMenuTimeoutRef.current = null;
              }, 800); // Increased timeout for better stability
            }}
            onCopyLink={logic.handleCopyLink}
            // Speed Menu Props
            playbackRate={data.playbackRate}
            showSpeedMenu={data.showSpeedMenu}
            speeds={[0.5, 0.75, 1, 1.25, 1.5, 2]}
            onToggleSpeedMenu={() => actions.setShowSpeedMenu(!data.showSpeedMenu)}
            onSpeedChange={logic.changePlaybackSpeed}
            onSpeedMenuMouseEnter={logic.clearSpeedMenuTimeout}
            onSpeedMenuMouseLeave={logic.startSpeedMenuTimeout}
            webFullscreenSize={webFullscreenSize}
            onCycleWebFullscreenSize={cycleWebFullscreenSize}
            // Portal container
            containerRef={containerRef}
          />

            <DesktopControlsWrapper
              src={src}
              data={data}
              logic={logic}
              refs={refs}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
