
import React, { useState, useEffect, useCallback } from 'react';
import { type Track } from '../types';
import { PlayIcon } from './icons/PlayIcon';
import { PauseIcon } from './icons/PauseIcon';
import { ForwardIcon } from './icons/ForwardIcon';

interface PlayerProps {
    currentTrack: Track | undefined;
    nextTrack: Track | undefined;
    onNext: () => void;
    isPlaying: boolean;
    setIsPlaying: (playing: boolean) => void;
    isPresenterLive?: boolean;
}

const formatDuration = (seconds: number): string => {
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
};

const Player: React.FC<PlayerProps> = ({ currentTrack, nextTrack, onNext, isPlaying, setIsPlaying, isPresenterLive = false }) => {
    const [progress, setProgress] = useState(0);

    const trackDuration = currentTrack?.duration ?? 0;

    const handleNext = useCallback(() => {
      setProgress(0);
      onNext();
    }, [onNext]);
    
    useEffect(() => {
        if (!isPlaying || !currentTrack) return;

        const interval = setInterval(() => {
            setProgress(prev => {
                if (prev >= trackDuration) {
                    handleNext();
                    return 0;
                }
                return prev + 1;
            });
        }, 1000);

        return () => clearInterval(interval);
    }, [isPlaying, currentTrack, trackDuration, handleNext]);

    useEffect(() => {
      setProgress(0);
    }, [currentTrack]);


    const progressPercentage = trackDuration > 0 ? (progress / trackDuration) * 100 : 0;
    const isSilenced = isPresenterLive && isPlaying;

    return (
        <div className="space-y-4">
            <div>
                <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-neutral-400 uppercase tracking-wider">Now Playing</span>
                    {isPresenterLive && (
                         <div className="flex items-center gap-2 text-red-500">
                             <span className="relative flex h-3 w-3">
                                 <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                 <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                             </span>
                             <span className="text-sm font-bold uppercase">ON AIR</span>
                         </div>
                    )}
                </div>
                <h3 className={`text-3xl font-bold text-white truncate ${isSilenced ? 'text-neutral-600' : 'text-white'}`}>
                    {isSilenced ? 'Presenter is Live' : (currentTrack?.title ?? 'Silence')}
                </h3>
                <p className={`text-lg ${isSilenced ? 'text-neutral-700' : 'text-neutral-400'}`}>{currentTrack?.artist ?? '...'}</p>
            </div>

            <div className="space-y-1">
                <div className="w-full bg-neutral-800 rounded-full h-2.5">
                    <div className="bg-white h-2.5 rounded-full transition-all duration-1000 ease-linear" style={{ width: `${progressPercentage}%` }}></div>
                </div>
                <div className="flex justify-between font-mono text-sm text-neutral-400">
                    <span>{formatDuration(progress)}</span>
                    <span>{formatDuration(trackDuration)}</span>
                </div>
            </div>

            <div className="flex items-center justify-between">
                <div className="text-left">
                    <span className="text-xs text-neutral-500 uppercase">Next Up</span>
                    <p className="text-sm text-neutral-300 truncate">{nextTrack?.title ?? 'End of Playlist'}</p>
                </div>

                <div className="flex items-center gap-4">
                    <button 
                        onClick={() => setIsPlaying(!isPlaying)}
                        className="p-3 bg-neutral-800 rounded-full text-white hover:bg-neutral-700 transition-colors disabled:bg-neutral-800/50 disabled:text-neutral-600"
                        disabled={isPresenterLive}
                        title={isPresenterLive ? 'Playback paused during live broadcast' : (isPlaying ? 'Pause' : 'Play')}
                    >
                        {isPlaying ? <PauseIcon className="w-6 h-6" /> : <PlayIcon className="w-6 h-6" />}
                    </button>
                    <button 
                        onClick={handleNext}
                        className="p-3 bg-neutral-800 rounded-full text-white hover:bg-neutral-700 transition-colors disabled:bg-neutral-800/50 disabled:text-neutral-600"
                        disabled={isPresenterLive}
                        title={isPresenterLive ? 'Cannot skip during live broadcast' : 'Next Track'}
                    >
                        <ForwardIcon className="w-6 h-6" />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Player;
