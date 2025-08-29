

import React, { useState, useMemo } from 'react';
// FIX: Added 'Track' type to the import to resolve multiple 'Cannot find name' errors.
import { type SequenceItem, TrackType, type Folder, TimeMarkerType, type TimeMarker, type Track } from '../types';
import { TrashIcon } from './icons/TrashIcon';
import { GrabHandleIcon } from './icons/GrabHandleIcon';
import { PlayIcon } from './icons/PlayIcon';
import { NowPlayingIcon } from './icons/NowPlayingIcon';
import ConfirmationDialog from './ConfirmationDialog';
import { StopAfterTrackIcon } from './icons/StopAfterTrackIcon';
import { HeadphoneIcon } from './icons/HeadphoneIcon';
import { SparklesIcon } from './icons/SparklesIcon';
import AddTimeMarkerModal from './AddTimeMarkerModal';
import { Toggle } from './Toggle';
import { ClockPlusIcon } from './icons/ClockPlusIcon';
import { EditIcon } from './icons/EditIcon';

interface PlaylistProps {
    items: SequenceItem[];
    currentPlayingItemId: string | null;
    onRemove: (itemId: string) => void;
    onReorder: (draggedId: string, dropTargetId: string | null) => void;
    onPlayTrack: (itemId: string) => void;
    onAddTrack: (track: Track) => void;
    onInsertTrack: (track: Track, beforeItemId: string | null) => void;
    onInsertTimeMarker: (marker: TimeMarker, beforeItemId: string | null) => void;
    onUpdateTimeMarker: (markerId: string, updates: Partial<TimeMarker>) => void;
    isPlaying: boolean;
    stopAfterTrackId: string | null;
    onSetStopAfterTrackId: (id: string | null) => void;
    trackProgress: number;
    onClearPlaylist: () => void;
    onPflTrack: (trackId: string) => void;
    pflTrackId: string | null;
    isPflPlaying: boolean;
    pflProgress: number;
    mediaLibrary: Folder;
    timeline: Map<string, { startTime: Date, endTime: Date, duration: number, isSkipped?: boolean, shortenedBy?: number }>;
}

const formatDuration = (seconds: number): string => {
    const roundedSeconds = Math.floor(seconds);
    const min = Math.floor(roundedSeconds / 60);
    const sec = roundedSeconds % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
};

const formatTime = (date?: Date): string => {
    if (!date) return '--:--:--';
    return date.toLocaleTimeString('en-GB');
};

// --- Helper Functions for Duplicate Check ---
const findTrackAndPath = (node: Folder, trackId: string, currentPath: Folder[]): Folder[] | null => {
    const pathWithCurrentNode = [...currentPath, node];
    for (const child of node.children) {
        if (child.type !== 'folder' && child.id === trackId) {
            return pathWithCurrentNode;
        }
        if (child.type === 'folder') {
            const foundPath = findTrackAndPath(child, trackId, pathWithCurrentNode);
            if (foundPath) return foundPath;
        }
    }
    return null;
};

const isDuplicateCheckSuppressed = (trackId: string, library: Folder): boolean => {
    const path = findTrackAndPath(library, trackId, []);
    if (!path) return false;
    for (const folder of path) {
        if (folder.suppressMetadata?.suppressDuplicateWarning) {
            return true;
        }
    }
    return false;
};


// --- Memoized List Item Components for Performance ---

const PlaylistItemTrack = React.memo(({ track, isCurrentlyPlaying, isDuplicateWarning, isSkipped, trackProgress, stopAfterTrackId, timelineData, onPlayTrack, onSetStopAfterTrackId, onRemove, onDragStart, onDragEnd, onDragOver, onDragEnter, onDrop, draggedId, onPflTrack, pflTrackId, isPflPlaying, pflProgress }: {
    track: Track;
    isCurrentlyPlaying: boolean;
    isDuplicateWarning: boolean;
    isSkipped: boolean;
    trackProgress: number;
    stopAfterTrackId: string | null;
    timelineData?: { startTime: Date, endTime: Date, duration: number, shortenedBy?: number };
    onPlayTrack: () => void;
    onSetStopAfterTrackId: () => void;
    onRemove: () => void;
    onDragStart: (e: React.DragEvent<HTMLLIElement>) => void;
    onDragEnd: () => void;
    onDragOver: (e: React.DragEvent<HTMLElement>) => void;
    onDragEnter: (e: React.DragEvent<HTMLLIElement>) => void;
    onDrop: (e: React.DragEvent<HTMLLIElement>) => void;
    draggedId: string | null;
    onPflTrack: (trackId: string) => void;
    pflTrackId: string | null;
    isPflPlaying: boolean;
    pflProgress: number;
}) => {
    const trackDuration = timelineData ? timelineData.duration : track.duration;
    const progressPercentage = isCurrentlyPlaying && trackDuration > 0
        ? (trackProgress / trackDuration) * 100
        : 0;
    const isPflActive = pflTrackId === track.id;
    const pflProgressPercentage = isPflPlaying && isPflActive && trackDuration > 0
        ? (pflProgress / track.duration) * 100
        : 0;

    const timeLeft = trackDuration - trackProgress;
    const isEnding = isCurrentlyPlaying && timeLeft <= 10 && timeLeft > 0;
    const isSong = track.type === TrackType.SONG;

    const getListItemClasses = () => {
        if (isCurrentlyPlaying) return 'bg-green-600 border-green-500';
        if (isDuplicateWarning) return 'bg-red-500/20 dark:bg-red-900/40 border-red-500';
        if (isPflActive) return 'border-blue-500 bg-blue-500/10';
        if (stopAfterTrackId === track.id) return 'border-neutral-400 dark:border-neutral-600';
        return 'hover:bg-neutral-200/50 dark:hover:bg-neutral-800/50 border-transparent';
    };

    return (
        <li
            draggable
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDragOver={onDragOver}
            onDragEnter={onDragEnter}
            onDrop={onDrop}
            className={`
                relative overflow-hidden flex items-start p-3 rounded-lg transition-all duration-300 group
                border
                ${getListItemClasses()}
                ${draggedId === track.id ? 'opacity-30' : ''}
                ${isSkipped ? 'opacity-40 bg-neutral-200 dark:bg-neutral-800' : ''}
                ${isEnding ? 'animate-pulse-ending' : ''}
            `}
        >
            {isPflPlaying && isPflActive && (
                <div
                    className="absolute bottom-0 left-0 h-1 bg-blue-500/70"
                    style={{ width: `${pflProgressPercentage}%` }}
                />
            )}
            <div
                className="absolute bottom-0 left-0 h-1 bg-black/30 dark:bg-white/30 transition-all duration-100 ease-linear"
                style={{ width: `${progressPercentage}%` }}
            />
             <div className="flex-shrink-0 flex items-center gap-4">
                <div className={`text-neutral-400 dark:text-neutral-500 ${isSkipped ? 'cursor-not-allowed' : 'cursor-grab'}`} title="Drag to reorder">
                    <GrabHandleIcon className="w-5 h-5" />
                </div>
                <div className="w-16 font-mono text-sm text-neutral-500 dark:text-neutral-400 pt-0.5 text-right pr-2">{formatTime(timelineData?.startTime)}</div>
             </div>

            <div className="flex-grow flex items-center gap-4 overflow-hidden">
                <div className="w-6 text-center">
                    {isCurrentlyPlaying ? (
                         <div onClick={onPlayTrack} className="cursor-pointer">
                            <NowPlayingIcon className="w-4 h-4 mx-auto text-white" />
                         </div>
                    ) : (
                        <div className="relative h-full w-full flex items-center justify-center">
                            <button
                                onClick={onPlayTrack}
                                className="absolute inset-0 flex items-center justify-center text-black dark:text-white"
                                aria-label={`Play ${track.title}`}
                                disabled={isSkipped}
                            >
                                <PlayIcon className="w-5 h-5" />
                            </button>
                        </div>
                    )}
                </div>
                <div className="truncate flex items-center gap-2">
                     <p className={`font-medium truncate ${isCurrentlyPlaying ? 'text-white' : 'text-black dark:text-white'}`}>
                        {isSong && track.artist ? `${track.artist} - ${track.title}` : track.title}
                     </p>
                    {track.addedBy === 'auto-fill' && <SparklesIcon className="w-4 h-4 text-neutral-400 dark:text-neutral-500 flex-shrink-0" title="Added by Auto-Fill" />}
                    {(track.artist && !isSong) &&
                        <p className={`text-sm truncate ${isCurrentlyPlaying ? 'text-green-200' : 'text-neutral-600 dark:text-neutral-400'}`}>{track.artist}</p>
                    }
                </div>
            </div>
            <div className="flex items-center gap-2">
                <span className={`font-mono text-sm ${isCurrentlyPlaying ? 'text-green-200' : 'text-neutral-500'}`}>
                    {formatDuration(trackDuration)}
                </span>
                 <button
                    onClick={() => onPflTrack(track.id)}
                    className={`p-1 transition-colors ${isPflActive ? 'opacity-100 text-blue-500' : 'text-neutral-500 dark:text-neutral-400 opacity-0 group-hover:opacity-100 hover:text-blue-500 focus:opacity-100'}`}
                    title="PFL"
                    disabled={isSkipped}
                >
                    <HeadphoneIcon className="w-5 h-5" />
                </button>
                <button
                    onClick={onSetStopAfterTrackId}
                    className={`p-1 transition-colors ${stopAfterTrackId === track.id ? 'opacity-100 text-black dark:text-white' : 'text-neutral-500 dark:text-neutral-400 opacity-0 group-hover:opacity-100 hover:text-black dark:hover:text-white focus:opacity-100'}`}
                    title="Stop after this track and enable mic"
                    disabled={isSkipped}
                >
                    <StopAfterTrackIcon className="w-5 h-5" />
                </button>
                <button
                    onClick={onRemove}
                    className="p-1 text-neutral-500 dark:text-neutral-400 opacity-0 group-hover:opacity-100 hover:text-black dark:hover:text-white transition-opacity focus:opacity-100"
                    title="Remove from playlist"
                >
                    <TrashIcon className="w-5 h-5" />
                </button>
            </div>
        </li>
    );
});

const PlaylistItemMarker = React.memo(({ marker, onRemove, onEdit, onDragStart, onDragEnd, onDragOver, onDragEnter, onDrop, draggedId }: {
    marker: TimeMarker;
    onRemove: () => void;
    onEdit: () => void;
    onDragStart: (e: React.DragEvent<HTMLLIElement>) => void;
    onDragEnd: () => void;
    onDragOver: (e: React.DragEvent<HTMLElement>) => void;
    onDragEnter: (e: React.DragEvent<HTMLLIElement>) => void;
    onDrop: (e: React.DragEvent<HTMLLIElement>) => void;
    draggedId: string | null;
}) => {
    const isHard = marker.markerType === TimeMarkerType.HARD;
    const markerTime = new Date(marker.time);

    return (
        <li
            draggable
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDragOver={onDragOver}
            onDragEnter={onDragEnter}
            onDrop={onDrop}
            className={`
                flex items-center justify-between p-3 rounded-lg transition-colors duration-150 group border-2
                ${isHard ? 'border-red-500/50 bg-red-500/10' : 'border-blue-500/50 bg-blue-500/10'}
                ${draggedId === marker.id ? 'opacity-30' : ''}
            `}
        >
            <div className="flex items-center gap-4">
                <div className="text-neutral-400 dark:text-neutral-500 cursor-grab" title="Drag to reorder">
                    <GrabHandleIcon className="w-5 h-5" />
                </div>
                <div className="flex items-center gap-3">
                    <ClockPlusIcon className={`w-5 h-5 ${isHard ? 'text-red-500' : 'text-blue-500'}`} />
                    <div className="font-semibold text-black dark:text-white">
                        Time Marker: <span className="font-mono">{markerTime.toLocaleTimeString('en-GB')}</span>
                    </div>
                </div>
            </div>
            <div className="flex items-center gap-4">
                 <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${isHard ? 'bg-red-200 text-red-800 dark:bg-red-900/50 dark:text-red-300' : 'bg-blue-200 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300'}`}>
                    {isHard ? 'HARD' : 'SOFT'}
                </span>
                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center">
                    <button onClick={onEdit} className="p-1 text-neutral-500 hover:text-black dark:hover:text-white" title="Edit Marker">
                        <EditIcon className="w-5 h-5"/>
                    </button>
                    <button onClick={onRemove} className="p-1 text-neutral-500 hover:text-black dark:hover:text-white" title="Remove Marker">
                        <TrashIcon className="w-5 h-5"/>
                    </button>
                </div>
            </div>
        </li>
    );
});


const Playlist: React.FC<PlaylistProps> = ({ items, currentPlayingItemId, onRemove, onReorder, onPlayTrack, onAddTrack, onInsertTrack, onInsertTimeMarker, onUpdateTimeMarker, isPlaying, stopAfterTrackId, onSetStopAfterTrackId, trackProgress, onClearPlaylist, onPflTrack, pflTrackId, isPflPlaying, pflProgress, mediaLibrary, timeline }) => {
    const totalDuration = useMemo(() => items.reduce((sum, item) => {
        if (item.type === 'marker') return sum;
        const timelineData = timeline.get(item.id);
        return sum + (timelineData && !timelineData.isSkipped ? timelineData.duration : 0);
    }, 0), [items, timeline]);
    
    const [draggedId, setDraggedId] = useState<string | null>(null);
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [itemToDeleteId, setItemToDeleteId] = useState<string | null>(null);
    const [isDragOver, setIsDragOver] = useState(false);
    const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
    const [isMarkerModeActive, setIsMarkerModeActive] = useState(false);
    const [markerModalState, setMarkerModalState] = useState<{ beforeItemId: string | null, existingMarker?: TimeMarker } | null>(null);

    const duplicateIds = useMemo(() => {
        const problematicIds = new Set<string>();
        const DUPLICATE_SLOT_WINDOW = 7;
    
        const tracks = items.filter(item => item.type !== 'marker') as Track[];
        tracks.forEach((track, index) => {
            if (track.type !== TrackType.SONG || isDuplicateCheckSuppressed(track.id, mediaLibrary)) {
                return;
            }
            for (let i = index + 1; i < Math.min(index + 1 + DUPLICATE_SLOT_WINDOW, tracks.length); i++) {
                const futureTrack = tracks[i];
                if (futureTrack.type === TrackType.SONG && futureTrack.id === track.id) {
                    problematicIds.add(track.id);
                    problematicIds.add(futureTrack.id);
                }
            }
        });
    
        return problematicIds;
    }, [items, mediaLibrary]);

    const handleDragStart = (e: React.DragEvent, itemId: string) => {
        e.dataTransfer.setData('dragged-item-id', itemId);
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => setDraggedId(itemId), 0);
    };

    const handleDragEnd = () => {
        setDraggedId(null);
        setIsDragOver(false);
    };

    const handleDragOver = (e: React.DragEvent<HTMLElement>) => {
        e.preventDefault();
        const isInternalDrag = e.dataTransfer.types.includes('dragged-item-id');
        const isExternalTrack = e.dataTransfer.types.includes('application/json');

        if (isExternalTrack && !isInternalDrag) {
            e.dataTransfer.dropEffect = 'copy';
            setIsDragOver(true);
        } else if (isInternalDrag) {
            e.dataTransfer.dropEffect = 'move';
        } else {
             e.dataTransfer.dropEffect = 'none';
        }
    };

    const handleDrop = (e: React.DragEvent, dropTargetId: string | null) => {
        e.preventDefault();
        e.stopPropagation();
        
        const draggedItemId = e.dataTransfer.getData('dragged-item-id');
        const trackJson = e.dataTransfer.getData('application/json');

        if (draggedItemId) {
            if (draggedItemId !== dropTargetId) {
                 onReorder(draggedItemId, dropTargetId);
            }
        } else if (trackJson) {
            try {
                const track = JSON.parse(trackJson) as Track;
                if (track?.id && track.title) {
                    onInsertTrack(track, dropTargetId);
                }
            } catch (error) {
                console.error("Failed to parse dropped track data:", error);
            }
        }
        handleDragEnd();
    };
    
    const handleContainerDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        const isInternalDrag = e.dataTransfer.types.includes('dragged-item-id');
        if (isInternalDrag) {
            handleDragEnd();
            return;
        }

        try {
            const trackJson = e.dataTransfer.getData('application/json');
            if (trackJson) {
                const track = JSON.parse(trackJson) as Track;
                if (track?.id && track.title) {
                    onAddTrack(track);
                }
            }
        } catch (error) { console.error("Failed to handle drop on container:", error); }
        handleDragEnd();
    };

    const handleContainerDragLeave = () => setIsDragOver(false);
    const handleDeleteRequest = (itemId: string) => { setItemToDeleteId(itemId); setIsConfirmOpen(true); };
    const handleConfirmDelete = () => { if (itemToDeleteId !== null) onRemove(itemToDeleteId); handleCloseDialog(); };
    const handleCloseDialog = () => { setIsConfirmOpen(false); setItemToDeleteId(null); };
    const itemToDelete = itemToDeleteId ? items.find(i => i.id === itemToDeleteId) : null;

    const handleStopAfterClick = (trackId: string) => {
        onSetStopAfterTrackId(stopAfterTrackId === trackId ? null : trackId);
    };

    const handleConfirmClear = () => { onClearPlaylist(); setIsClearConfirmOpen(false); };

    return (
        <div 
            className={`flex flex-col h-full transition-colors duration-200 ${isDragOver ? 'bg-green-500/10' : ''}`}
            onDrop={handleContainerDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleContainerDragLeave}
        >
            <div className="flex-shrink-0 p-4 border-b border-neutral-200 dark:border-neutral-800 space-y-3">
                 <div className="flex justify-between items-center">
                    <h2 className="text-xl font-semibold">Timeline</h2>
                    <div className="flex items-center gap-4">
                        <span className="text-sm text-neutral-500 dark:text-neutral-400 font-mono">
                            Total: {formatDuration(totalDuration)}
                        </span>
                        <div className="h-4 border-l border-neutral-300 dark:border-neutral-700"></div>
                        <button
                            onClick={() => setIsClearConfirmOpen(true)}
                            disabled={items.length === 0}
                            className="p-1.5 text-neutral-500 dark:text-neutral-400 hover:text-black dark:hover:text-white disabled:text-neutral-300 dark:disabled:text-neutral-600 disabled:cursor-not-allowed transition-colors"
                            title="Clear Playlist"
                        >
                            <TrashIcon className="w-5 h-5" />
                        </button>
                    </div>
                 </div>
                 <div className="flex items-center justify-end gap-2 text-sm">
                    <label htmlFor="marker-mode-toggle" className="font-medium text-neutral-600 dark:text-neutral-400 cursor-pointer">
                        Add Marker Mode
                    </label>
                    <Toggle id="marker-mode-toggle" checked={isMarkerModeActive} onChange={setIsMarkerModeActive} />
                 </div>
            </div>
            <div className="flex-grow overflow-y-auto">
                <ul className="p-2 space-y-1">
                     {items.map((item, index) => {
                        const prevItem = index > 0 ? items[index-1] : null;
                        const showAddMarkerButton = isMarkerModeActive && index > 0 && (!prevItem || prevItem.type !== 'marker');

                        return (
                           <React.Fragment key={item.id}>
                                {showAddMarkerButton && (
                                    <li className="flex justify-center items-center h-4 my-1 group">
                                        <div className="w-full h-px bg-neutral-200 dark:bg-neutral-800 relative">
                                            <button 
                                                onClick={() => setMarkerModalState({ beforeItemId: item.id })}
                                                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 p-1 bg-neutral-100 dark:bg-neutral-900 rounded-full text-neutral-400 dark:text-neutral-600 hover:text-black dark:hover:text-white hover:bg-neutral-200 dark:hover:bg-neutral-800 scale-90 group-hover:scale-100 opacity-70 group-hover:opacity-100 transition-all"
                                                title="Add Time Marker"
                                            >
                                                <ClockPlusIcon className="w-5 h-5"/>
                                            </button>
                                        </div>
                                    </li>
                                )}
                               {item.type === 'marker' ? (
                                    <PlaylistItemMarker
                                        marker={item}
                                        onRemove={() => handleDeleteRequest(item.id)}
                                        onEdit={() => setMarkerModalState({ beforeItemId: null, existingMarker: item })}
                                        onDragStart={(e) => handleDragStart(e, item.id)}
                                        onDragEnd={handleDragEnd}
                                        onDragOver={handleDragOver}
                                        onDragEnter={() => {}}
                                        onDrop={(e) => handleDrop(e, item.id)}
                                        draggedId={draggedId}
                                    />
                               ) : (
                                    <PlaylistItemTrack
                                        track={item}
                                        isCurrentlyPlaying={item.id === currentPlayingItemId}
                                        isDuplicateWarning={duplicateIds.has(item.id)}
                                        isSkipped={!!timeline.get(item.id)?.isSkipped}
                                        trackProgress={item.id === currentPlayingItemId ? trackProgress : 0}
                                        stopAfterTrackId={stopAfterTrackId}
                                        timelineData={timeline.get(item.id)}
                                        onPlayTrack={() => onPlayTrack(item.id)}
                                        onSetStopAfterTrackId={() => handleStopAfterClick(item.id)}
                                        onRemove={() => handleDeleteRequest(item.id)}
                                        onDragStart={(e) => handleDragStart(e, item.id)}
                                        onDragEnd={handleDragEnd}
                                        onDragOver={handleDragOver}
                                        onDragEnter={() => {}}
                                        onDrop={(e) => handleDrop(e, item.id)}
                                        draggedId={draggedId}
                                        onPflTrack={onPflTrack}
                                        pflTrackId={pflTrackId}
                                        isPflPlaying={isPflPlaying}
                                        pflProgress={pflProgress}
                                   />
                               )}
                           </React.Fragment>
                        );
                     })}
                     {isMarkerModeActive && (items.length === 0 || items[items.length - 1].type !== 'marker') && (
                        <li className="flex justify-center items-center h-4 my-1 group">
                            <div className="w-full h-px bg-neutral-200 dark:bg-neutral-800 relative">
                                <button
                                    onClick={() => setMarkerModalState({ beforeItemId: null })}
                                    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 p-1 bg-neutral-100 dark:bg-neutral-900 rounded-full text-neutral-400 dark:text-neutral-600 hover:text-black dark:hover:text-white hover:bg-neutral-200 dark:hover:bg-neutral-800 scale-90 group-hover:scale-100 opacity-70 group-hover:opacity-100 transition-all"
                                    title="Add Time Marker"
                                >
                                    <ClockPlusIcon className="w-5 h-5" />
                                </button>
                            </div>
                        </li>
                    )}
                     {items.length === 0 && (
                        <li className="text-center text-neutral-400 dark:text-neutral-500 p-8">
                            Playlist is empty. Add or drag tracks here from the library.
                        </li>
                    )}
                </ul>
            </div>
            <ConfirmationDialog
                isOpen={isClearConfirmOpen}
                onClose={() => setIsClearConfirmOpen(false)}
                onConfirm={handleConfirmClear}
                title="Clear Playlist"
                confirmText="Clear"
            >
                Are you sure you want to clear the playlist? This will remove all tracks and markers.
                {isPlaying && ' The currently playing track will be kept.'}
            </ConfirmationDialog>
            <ConfirmationDialog
                isOpen={isConfirmOpen}
                onClose={handleCloseDialog}
                onConfirm={handleConfirmDelete}
                title={`Remove ${itemToDelete?.type === 'marker' ? 'Marker' : 'Track'}`}
            >
                Are you sure you want to remove "{itemToDelete?.type !== 'marker' ? itemToDelete?.title : 'Time Marker'}" from the playlist?
            </ConfirmationDialog>
             <AddTimeMarkerModal
                isOpen={!!markerModalState}
                onClose={() => setMarkerModalState(null)}
                onAddMarker={(marker) => {
                    if(markerModalState?.existingMarker) {
                         onUpdateTimeMarker(markerModalState.existingMarker.id, marker);
                    } else {
                        // FIX: The marker from AddTimeMarkerModal is a full TimeMarker object,
                        // but typed as Partial for flexibility. Cast to TimeMarker for insertion.
                        onInsertTimeMarker(marker as TimeMarker, markerModalState?.beforeItemId || null);
                    }
                }}
                existingMarker={markerModalState?.existingMarker}
            />
        </div>
    );
};

export default React.memo(Playlist);