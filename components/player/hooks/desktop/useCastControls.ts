'use client';

import { useCallback, useEffect, useRef, useMemo } from 'react';

interface UseCastControlsProps {
    src: string;
    videoRef: React.RefObject<HTMLVideoElement | null>;
    setIsCastAvailable: (available: boolean) => void;
    setIsCasting: (casting: boolean) => void;
}

declare global {
    interface Window {
        chrome: any;
        cast: any;
        __onGCastApiAvailable: (isAvailable: boolean) => void;
    }
}

export function useCastControls({
    src,
    videoRef,
    setIsCastAvailable,
    setIsCasting
}: UseCastControlsProps) {
    const castContextRef = useRef<any>(null);

    useEffect(() => {
        // Function to initialize Cast
        const initializeCastApi = () => {
            if (!window.cast || !window.cast.framework) return;

            const castContext = window.cast.framework.CastContext.getInstance();
            castContextRef.current = castContext;

            castContext.setOptions({
                receiverApplicationId: window.chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
                autoJoinPolicy: window.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED
            });

            // SDK loaded — show cast button immediately.
            // requestSession() will re-scan and show Chrome's native device picker.
            setIsCastAvailable(true);

            // Monitor session state
            castContext.addEventListener(
                window.cast.framework.CastContextEventType.SESSION_STATE_CHANGED,
                (event: any) => {
                    const sessionState = event.sessionState;
                    const isSessionActive = sessionState === window.cast.framework.SessionState.SESSION_STARTED ||
                        sessionState === window.cast.framework.SessionState.SESSION_RESUMED;

                    setIsCasting(isSessionActive);

                    if (isSessionActive && videoRef.current) {
                        videoRef.current.pause();
                        loadMedia();
                    }
                }
            );
        };

        // If API is already loaded
        if (window.cast && window.cast.framework) {
            initializeCastApi();
        } else {
            // Wait for API to be available
            window.__onGCastApiAvailable = (isAvailable: boolean) => {
                if (isAvailable) {
                    initializeCastApi();
                }
            };
        }
    }, [setIsCastAvailable, setIsCasting, videoRef]);

    const loadMedia = useCallback(() => {
        if (!castContextRef.current || !src) return;

        const castContext = castContextRef.current;
        const session = castContext.getCurrentSession();
        if (!session) return;

        const mediaInfo = new window.chrome.cast.media.MediaInfo(src, 'video/mp4');
        // Handle HLS specifically if possible, though DEFAULT_MEDIA_RECEIVER supports it
        if (src.includes('.m3u8')) {
            mediaInfo.contentType = 'application/x-mpegurl';
        }

        const request = new window.chrome.cast.media.LoadRequest(mediaInfo);

        // Sync current time
        if (videoRef.current) {
            request.currentTime = videoRef.current.currentTime;
        }

        session.loadMedia(request).then(
            () => console.log('Cast: Media loaded successfully'),
            (error: any) => console.error('Cast: Media load failed', error)
        );
    }, [src, videoRef]);

    const showCastMenu = useCallback(() => {
        if (window.cast && window.cast.framework) {
            window.cast.framework.CastContext.getInstance().requestSession();
        }
    }, []);

    const castActions = useMemo(() => ({
        showCastMenu
    }), [showCastMenu]);

    return castActions;
}
