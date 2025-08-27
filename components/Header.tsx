



import React, { useCallback, useEffect, useRef, useState } from 'react';
import { UserIcon } from './icons/UserIcon';
import { LogoutIcon } from './icons/LogoutIcon';
import { type Track, TrackType } from '../types';
import { PlayIcon } from './icons/PlayIcon';
import { PauseIcon } from './icons/PauseIcon';
import { ForwardIcon } from './icons/ForwardIcon';
import { BackwardIcon } from './icons/BackwardIcon';
import Clock from './Clock';
import ConfirmationDialog from './ConfirmationDialog';
import { EnterFullscreenIcon } from './icons/EnterFullscreenIcon';
import { ExitFullscreenIcon } from './icons/ExitFullscreenIcon';
import { RotationIcon } from './icons/RotationIcon';

interface HeaderProps {
    currentUser: { email: string; nickname: string; } | null;
    onLogout: () => void;
    currentTrack: Track | undefined;
    onNext: () => void;
    onPrevious: () => void;
    isPlaying: boolean;
    onTogglePlay: () => void;
    isPresenterLive?: boolean;
    progress: number;
    logoSrc: string | null;
    onLogoChange: (file: File) => void;
    onLogoReset: () => void;
    headerGradient: string | null;
    isAutoFillEnabled: boolean;
    onToggleAutoFill: () => void;
}

const formatDuration = (seconds: number): string => {
    const roundedSeconds = Math.floor(seconds);
    const min = Math.floor(roundedSeconds / 60);
    const sec = roundedSeconds % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
};

const Header: React.FC<HeaderProps> = ({ 
    currentUser, onLogout, currentTrack, onNext, onPrevious, isPlaying, onTogglePlay, isPresenterLive = false, progress,
    logoSrc, onLogoChange, onLogoReset, headerGradient, isAutoFillEnabled, onToggleAutoFill,
}) => {
    
    const [isLogoConfirmOpen, setIsLogoConfirmOpen] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const trackDuration = currentTrack?.duration ?? 0;
    const logoInputRef = useRef<HTMLInputElement>(null);
    const isSong = currentTrack?.type === TrackType.SONG;
    
    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                console.error(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
            });
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        }
    };

    const handleLogoClick = () => {
        setIsLogoConfirmOpen(true);
    };

    const handleConfirmLogoChange = () => {
        logoInputRef.current?.click();
    };
    
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            onLogoChange(e.target.files[0]);
        }
        e.target.value = ''; // Reset input so the same file can be selected again
    };

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        onLogoReset();
    };

    const handleNext = useCallback(() => {
      onNext();
    }, [onNext]);
    
    const progressPercentage = trackDuration > 0 ? (progress / trackDuration) * 100 : 0;
    const isSilenced = isPresenterLive && isPlaying;
    const timeLeft = trackDuration - progress;

    return (
        <>
            <header 
                className="flex items-center justify-between p-4 bg-neutral-100/50 dark:bg-neutral-900/50 backdrop-blur-sm shadow-md gap-4 sm:gap-8 h-auto sm:h-24 flex-wrap transition-colors duration-500"
                style={{ background: headerGradient || undefined }}
            >
                 <div className="w-auto flex-shrink-0 order-1">
                    <input
                        type="file"
                        ref={logoInputRef}
                        onChange={handleFileChange}
                        accept="image/*"
                        className="hidden"
                    />
                    {logoSrc ? (
                        <img
                            src={logoSrc}
                            alt="Station Logo"
                            className="h-12 max-w-[150px] object-contain cursor-pointer"
                            onClick={handleLogoClick}
                            onContextMenu={handleContextMenu}
                            title="Click to change logo, right-click to reset"
                        />
                    ) : (
                        <div 
                            className="text-xl font-bold tracking-tight leading-tight text-black dark:text-white cursor-pointer"
                            onClick={handleLogoClick}
                            title="Click to set a logo"
                        >
                            <div>radio</div>
                            <div>host<span className="text-red-500">.</span></div>
                            <div>cloud</div>
                        </div>
                    )}
                </div>

                <div className="w-full sm:w-1/2 flex-grow flex flex-col sm:flex-row items-center justify-center gap-4 order-3 sm:order-2">
                    <div className="flex items-center gap-4">
                         <button 
                            onClick={onPrevious}
                            className="p-3 bg-black/5 dark:bg-black/20 backdrop-blur-sm rounded-full text-black dark:text-white hover:bg-black/10 dark:hover:bg-black/40 transition-colors disabled:bg-black/5 dark:disabled:bg-black/10 disabled:text-black/40 dark:disabled:text-white/50"
                            disabled={!currentTrack || isPresenterLive}
                            title={isPresenterLive ? 'Cannot skip during live broadcast' : 'Previous Track'}
                        >
                            <BackwardIcon className="w-6 h-6" />
                        </button>
                         <button 
                            onClick={onTogglePlay}
                            className="p-3 bg-black/5 dark:bg-black/20 backdrop-blur-sm rounded-full text-black dark:text-white hover:bg-black/10 dark:hover:bg-black/40 transition-colors disabled:bg-black/5 dark:disabled:bg-black/10 disabled:text-black/40 dark:disabled:text-white/50"
                            disabled={!currentTrack || isPresenterLive}
                            title={isPresenterLive ? 'Playback paused during live broadcast' : (isPlaying ? 'Pause' : 'Play')}
                        >
                            {isPlaying ? <PauseIcon className="w-6 h-6" /> : <PlayIcon className="w-6 h-6" />}
                        </button>
                        <button 
                            onClick={handleNext}
                            className="p-3 bg-black/5 dark:bg-black/20 backdrop-blur-sm rounded-full text-black dark:text-white hover:bg-black/10 dark:hover:bg-black/40 transition-colors disabled:bg-black/5 dark:disabled:bg-black/10 disabled:text-black/40 dark:disabled:text-white/50"
                            disabled={!currentTrack || isPresenterLive}
                            title={isPresenterLive ? 'Cannot skip during live broadcast' : 'Next Track'}
                        >
                            <ForwardIcon className="w-6 h-6" />
                        </button>
                        <button
                            onClick={onToggleAutoFill}
                            className={`p-3 rounded-full transition-colors ${isAutoFillEnabled ? 'bg-black/10 dark:bg-white/10 text-black dark:text-white' : 'bg-black/5 dark:bg-black/20 text-neutral-500'}`}
                            title={isAutoFillEnabled ? 'Auto-fill Playlist On' : 'Auto-fill Playlist Off'}
                        >
                            <RotationIcon className="w-6 h-6" />
                        </button>
                    </div>
                     <div className="w-full max-w-sm space-y-1">
                        <div className="flex items-baseline gap-3">
                             {isPresenterLive && (
                                 <div className="flex items-center gap-2 text-red-500 flex-shrink-0">
                                     <span className="relative flex h-2 w-2">
                                         <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                         <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                                     </span>
                                     <span className="text-xs font-bold uppercase">ON AIR</span>
                                 </div>
                            )}
                            <div className="truncate">
                                <p className={`font-bold truncate ${isSilenced ? 'text-neutral-400 dark:text-neutral-600' : 'text-black dark:text-white'}`}>
                                    {isSilenced 
                                        ? 'Presenter is Live' 
                                        : isSong 
                                            ? (currentTrack?.artist ? `${currentTrack.artist} - ` : '') + (currentTrack?.title || 'Untitled')
                                            : (currentTrack?.title ?? 'Silence')
                                    }
                                </p>
                                {!isSong && (
                                    <p className={`text-sm ${isSilenced ? 'text-neutral-500 dark:text-neutral-700' : 'text-neutral-600 dark:text-neutral-400'}`}>
                                        {currentTrack?.artist ?? '...'}
                                    </p>
                                )}
                            </div>
                        </div>
                         <div className="space-y-1">
                            <div className="w-full bg-neutral-300 dark:bg-neutral-800 rounded-full h-1.5">
                                <div className="bg-black dark:bg-white h-1.5 rounded-full" style={{ width: `${progressPercentage}%` }}></div>
                            </div>
                            <div className="flex justify-between font-mono text-xs text-neutral-500 dark:text-neutral-400">
                                <span>{formatDuration(progress)}</span>
                                <span>-{formatDuration(Math.max(0, timeLeft))}</span>
                            </div>
                        </div>
                     </div>
                </div>

                <div className="w-auto flex justify-end items-center gap-4 order-2 sm:order-3">
                    <Clock />
                    <button 
                        onClick={toggleFullscreen}
                        className="p-2 text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white transition-colors rounded-md"
                        title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
                    >
                        {isFullscreen ? <ExitFullscreenIcon className="w-5 h-5" /> : <EnterFullscreenIcon className="w-5 h-5" />}
                    </button>
                    {currentUser ? (
                        <>
                            <div className="h-8 border-l border-neutral-300 dark:border-neutral-700"></div>
                            <div className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
                                <UserIcon className="w-5 h-5" />
                                <span className="font-medium truncate hidden lg:inline">{currentUser.nickname}</span>
                            </div>
                            <button 
                                onClick={onLogout} 
                                className="flex items-center gap-2 text-sm font-medium text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white transition-colors px-3 py-2 rounded-md hover:bg-neutral-200 dark:hover:bg-neutral-800 flex-shrink-0"
                                title="Logout"
                            >
                                <LogoutIcon className="w-5 h-5" />
                                <span className="hidden lg:inline">Logout</span>
                            </button>
                        </>
                    ) : (
                        <div className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300 px-3 py-2">
                            <UserIcon className="w-5 h-5 text-neutral-400 dark:text-neutral-500" />
                            <span className="font-medium">Guest Session</span>
                        </div>
                    )}
                </div>
            </header>
            <ConfirmationDialog
                isOpen={isLogoConfirmOpen}
                onClose={() => setIsLogoConfirmOpen(false)}
                onConfirm={handleConfirmLogoChange}
                title="Change Station Logo"
                confirmText="Choose File"
                confirmButtonClass="bg-black dark:bg-white hover:bg-neutral-800 dark:hover:bg-neutral-200 text-white dark:text-black"
                onSecondaryAction={onLogoReset}
                secondaryActionText="Default"
                secondaryButtonClass="bg-neutral-700 dark:bg-neutral-600 hover:bg-neutral-600 dark:hover:bg-neutral-500"
            >
                You can upload an image file (e.g., PNG, JPG) to replace the current logo, or restore the default text logo. Your choice will be saved for your session.
            </ConfirmationDialog>
        </>
    );
};

export default React.memo(Header);