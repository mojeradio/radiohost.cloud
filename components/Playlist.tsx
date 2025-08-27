import React, { useState, useMemo } from 'react';
import { type Track, TrackType, type SequenceItem, type TimeFixMarker, type HourBoundaryMarker, type Folder, TimelineItem } from '../types';
import { TrashIcon } from './icons/TrashIcon';
import { GrabHandleIcon } from './icons/GrabHandleIcon';
import { PlayIcon } from './icons/PlayIcon';
import { NowPlayingIcon } from './icons/NowPlayingIcon';
import ConfirmationDialog from './ConfirmationDialog';
import { StopAfterTrackIcon } from './icons/StopAfterTrackIcon';
import { ClockIcon } from './icons/ClockIcon';
import AddTimeMarkerModal from './AddTimeMarkerModal';
import { ClockPlusIcon } from './icons/ClockPlusIcon';
import { HeadphoneIcon } from './icons/HeadphoneIcon';
import { PlusIcon } from './icons/PlusIcon';
import { CloseIcon } from './icons/CloseIcon';
import { CalendarIcon } from './icons/CalendarIcon';
import { RotationIcon } from './icons/RotationIcon';
import { Toggle } from './Toggle';

interface PlaylistProps {
    items: TimelineItem[];
    rawPlaylist: SequenceItem[];
    currentPlayingItemId: string | null;
    onRemove: (itemId: string) => void;
    onReorder: (draggedId: string, dropTargetId: string | null) => void;
    onPlayTrack: (itemId: string) => void;
    onAddTrack: (track: Track) => void;
    onInsertTrack: (track: Track, beforeItemId: string | null) => void;
    onAddMarker: (data: { time: string; markerType: 'hard' | 'soft', title?: string, index?: number }) => void;
    onUpdateMarker: (markerId: string, data: { time: string; markerType: 'hard' | 'soft', title?: string }) => void;
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
    isAutoFillEnabled: boolean;
    onToggleAutoFill: () => void;
    skippedItemIds: Set<string>;
    autoFilledItemIds: Set<string>;
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

const PlaylistItemTrack = React.memo(({ track, isCurrentlyPlaying, isDuplicateWarning, trackProgress, stopAfterTrackId, timelineData, onPlayTrack, onSetStopAfterTrackId, onRemove, onDragStart, onDragEnd, onDragOver, onDragEnter, onDrop, draggedId, onPflTrack, pflTrackId, isPflPlaying, pflProgress, isSkipped, isAutoFilled, shortenedBy }: {
    track: Track;
    isCurrentlyPlaying: boolean;
    isDuplicateWarning: boolean;
    trackProgress: number;
    stopAfterTrackId: string | null;
    timelineData?: { startTime: Date, endTime: Date, duration: number };
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
    isSkipped: boolean;
    isAutoFilled: boolean;
    shortenedBy?: number;
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
    const isSqueezed = timelineData && timelineData.duration < track.duration - 1;

    const getListItemClasses = () => {
        if (isCurrentlyPlaying) return 'bg-green-600 border-green-500';
        if (isSkipped) return 'border-transparent opacity-40';
        if (isAutoFilled) return 'bg-neutral-200/60 dark:bg-neutral-800/60 border-transparent';
        if (isDuplicateWarning) return 'bg-red-500/20 dark:bg-red-900/40 border-red-500';
        if (isPflActive) return 'border-blue-500 bg-blue-500/10';
        if (stopAfterTrackId === track.id) return 'border-neutral-400 dark:border-neutral-600';
        return 'hover:bg-neutral-200/50 dark:hover:bg-neutral-800/50 border-transparent';
    };

    return (
        <li
            draggable={!isSkipped}
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
                <div className={`text-neutral-400 dark:text-neutral-500 ${!isSkipped && 'cursor-grab'}`} title="Drag to reorder">
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
                                disabled={isSkipped}
                                onClick={onPlayTrack}
                                className="absolute inset-0 flex items-center justify-center text-black dark:text-white"
                                aria-label={`Play ${track.title}`}
                            >
                                <PlayIcon className="w-5 h-5" />
                            </button>
                        </div>
                    )}
                </div>
                <div className="truncate">
                     <p className={`font-medium truncate ${isCurrentlyPlaying ? 'text-white' : 'text-black dark:text-white'}`}>
                        {isSong && track.artist ? `${track.artist} - ${track.title}` : track.title}
                     </p>
                    {shortenedBy && shortenedBy > 0 && (
                        <p className="text-xs text-yellow-600 dark:text-yellow-400 font-mono italic">
                            Shortened by {formatDuration(shortenedBy)}
                        </p>
                    )}
                    {(track.artist && !isSong) &&
                        <p className={`text-sm truncate ${isCurrentlyPlaying ? 'text-green-200' : 'text-neutral-600 dark:text-neutral-400'}`}>{track.artist}</p>
                    }
                </div>
            </div>
            <div className="flex items-center gap-2">
                {isAutoFilled && <RotationIcon className="w-4 h-4 text-neutral-400 dark:text-neutral-500" title="Auto-filled" />}
                <span className={`font-mono text-sm ${isCurrentlyPlaying ? 'text-green-200' : 'text-neutral-500'}`} title={isSqueezed ? `Original duration: ${formatDuration(track.duration)}` : ''}>
                    {isSqueezed && <span className="text-yellow-400">*</span>}{formatDuration(trackDuration)}
                </span>
                 <button
                    disabled={isSkipped}
                    onClick={() => onPflTrack(track.id)}
                    className={`p-1 transition-colors ${isPflActive ? 'opacity-100 text-blue-500' : 'text-neutral-500 dark:text-neutral-400 opacity-0 group-hover:opacity-100 hover:text-blue-500 focus:opacity-100'}`}
                    title="PFL"
                >
                    <HeadphoneIcon className="w-5 h-5" />
                </button>
                <button
                    disabled={isSkipped}
                    onClick={onSetStopAfterTrackId}
                    className={`p-1 transition-colors ${stopAfterTrackId === track.id ? 'opacity-100 text-black dark:text-white' : 'text-neutral-500 dark:text-neutral-400 opacity-0 group-hover:opacity-100 hover:text-black dark:hover:text-white focus:opacity-100'}`}
                    title="Stop after this track and enable mic"
                >
                    <StopAfterTrackIcon className="w-5 h-5" />
                </button>
                <button
                    disabled={isSkipped}
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

const PlaylistItemMarker = React.memo(({ item, onDoubleClick, onRemove, onDragStart, onDragEnd, onDragOver, onDragEnter, onDrop, draggedId }: {
    item: TimeFixMarker;
    onDoubleClick: (marker: TimeFixMarker) => void;
    onRemove: () => void;
    onDragStart: (e: React.DragEvent<HTMLLIElement>) => void;
    onDragEnd: () => void;
    onDragOver: (e: React.DragEvent<HTMLElement>) => void;
    onDragEnter: (e: React.DragEvent<HTMLLIElement>) => void;
    onDrop: (e: React.DragEvent<HTMLLIElement>) => void;
    draggedId: string | null;
}) => {
    const isHard = item.markerType === 'hard';
    const textColor = isHard ? 'text-yellow-800 dark:text-yellow-300' : 'text-blue-800 dark:text-blue-300';
    const iconColor = isHard ? 'text-yellow-600 dark:text-yellow-400' : 'text-blue-600 dark:text-blue-400';

    return (
        <li
            draggable
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDragOver={onDragOver}
            onDragEnter={onDragEnter}
            onDrop={onDrop}
            onDoubleClick={() => onDoubleClick(item)}
            title="Drag to reorder, double-click to edit"
            className={`relative flex items-center gap-4 py-2 px-3 my-1 transition-opacity ${draggedId === item.id ? 'opacity-30' : 'opacity-100'}`}
        >
            <span className="flex-grow h-px bg-neutral-300 dark:bg-neutral-700"></span>
            <div className="flex items-center gap-3 text-neutral-500 dark:text-neutral-400 flex-shrink-0 text-center cursor-pointer group">
                <div className="cursor-grab" title="Drag to reorder">
                    <GrabHandleIcon className="w-5 h-5 text-neutral-400 dark:text-neutral-500" />
                </div>
                <ClockIcon className={`w-5 h-5 ${iconColor} flex-shrink-0`} />
                <div>
                    <span className={`font-bold text-sm block ${textColor}`}>
                        {item.title || (isHard ? 'HARD TIME FIX' : 'SOFT TIME FIX')}
                    </span>
                    <span className={`text-xs italic block truncate max-w-[200px] font-mono ${textColor}`}>
                        @{item.time}
                    </span>
                </div>
                 <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onRemove();
                    }}
                    className="p-1 text-neutral-500 dark:text-neutral-400 hover:text-red-500 transition-opacity opacity-0 group-hover:opacity-100"
                    title="Remove marker"
                >
                    <TrashIcon className="w-4 h-4" />
                </button>
            </div>
            <span className="flex-grow h-px bg-neutral-300 dark:bg-neutral-700"></span>
        </li>
    );
});

const PlaylistItemHourBoundary = React.memo(({ item }: { item: HourBoundaryMarker }) => {
    const isSchedule = item.source === 'schedule';
    const Icon = isSchedule ? CalendarIcon : RotationIcon;

    return (
        <li className="relative flex items-center gap-4 py-2 px-3 my-1">
            <span className="flex-grow h-px bg-neutral-300 dark:bg-neutral-700"></span>
            <div className="flex items-center gap-3 text-neutral-500 dark:text-neutral-400 flex-shrink-0 text-center">
                <Icon className="w-5 h-5" />
                <div>
                    <span className="font-bold text-sm block">
                        {String(item.hour).padStart(2, '0')}:00
                    </span>
                    <span className="text-xs italic block truncate max-w-[200px]">
                        {item.title}
                    </span>
                </div>
            </div>
            <span className="flex-grow h-px bg-neutral-300 dark:bg-neutral-700"></span>
        </li>
    );
});


const Playlist: React.FC<PlaylistProps> = ({ items, rawPlaylist, currentPlayingItemId, onRemove, onReorder, onPlayTrack, onAddTrack, onInsertTrack, onAddMarker, onUpdateMarker, isPlaying, stopAfterTrackId, onSetStopAfterTrackId, trackProgress, onClearPlaylist, onPflTrack, pflTrackId, isPflPlaying, pflProgress, mediaLibrary, timeline, isAutoFillEnabled, onToggleAutoFill, skippedItemIds, autoFilledItemIds }) => {
    const totalDuration = useMemo(() => items.reduce((sum, item) => {
        if (item.type !== 'marker' && item.type !== 'hour_boundary_marker' && item.type !== 'clock_start_marker' && item.type !== 'random_from_folder' && item.type !== 'random_from_tag' && item.type !== 'autofill_marker') {
            const timelineData = timeline.get(item.id);
            return sum + (timelineData ? timelineData.duration : (item as Track).duration);
        }
        return sum;
    }, 0), [items, timeline]);
    
    const [draggedId, setDraggedId] = useState<string | null>(null);
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [itemToDeleteId, setItemToDeleteId] = useState<string | null>(null);
    const [isDragOver, setIsDragOver] = useState(false);
    const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
    const [isAddMarkerModalOpen, setIsAddMarkerModalOpen] = useState(false);
    const [editingMarker, setEditingMarker] = useState<TimeFixMarker | null>(null);
    const [addMarkerPrefill, setAddMarkerPrefill] = useState<{ time: string, index: number } | null>(null);
    const [isAddingMarker, setIsAddingMarker] = useState(false);

    const duplicateIds = useMemo(() => {
        const problematicIds = new Set<string>();
        const DUPLICATE_SLOT_WINDOW = 7;
    
        const onlyTracks = items.filter(item => 
            item.type !== 'marker' && item.type !== 'hour_boundary_marker'
        ) as Track[];
    
        onlyTracks.forEach((track, index) => {
            if (track.type !== TrackType.SONG || isDuplicateCheckSuppressed(track.id, mediaLibrary)) {
                return;
            }
            for (let i = index + 1; i < Math.min(index + 1 + DUPLICATE_SLOT_WINDOW, onlyTracks.length); i++) {
                const futureTrack = onlyTracks[i];
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

        let itemBefore: SequenceItem | undefined;
        if (dropTargetId) {
            const dropIndex = rawPlaylist.findIndex(item => item.id === dropTargetId);
            if (dropIndex > 0) {
                itemBefore = rawPlaylist[dropIndex - 1];
            }
        } else { // Dropping at the end of the list
            if (rawPlaylist.length > 0) {
                itemBefore = rawPlaylist[rawPlaylist.length - 1];
            }
        }

        if (itemBefore && itemBefore.type === 'marker') {
            console.warn("Cannot place an item immediately after a time marker.");
            handleDragEnd();
            return;
        }

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

    const openAddMarkerModal = (index: number, time: Date | undefined) => {
        const prefillTime = time ? `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}:00` : '';
        setAddMarkerPrefill({ time: prefillTime, index });
        setIsAddMarkerModalOpen(true);
        setIsAddingMarker(false);
    };

    const currentPlayingIndex = useMemo(() => currentPlayingItemId ? items.findIndex(item => item.id === currentPlayingItemId) : -1, [items, currentPlayingItemId]);

    const renderItems = () => {
        const rendered = [];
        let trackCounter = 0;

        const MarkerInserter = ({ index, time, isEnd = false }: { index: number; time?: Date, isEnd?: boolean }) => (
             <li key={`inserter-${index}`} className="h-4 relative group">
                <div className="h-px bg-neutral-300 dark:bg-neutral-600 w-full absolute top-1/2 -translate-y-1/2"></div>
                <button 
                    onClick={() => openAddMarkerModal(index, time)}
                    className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-900 flex items-center gap-1 border border-transparent group-hover:border-neutral-400 dark:group-hover:border-neutral-500 transition-colors"
                >
                    <PlusIcon className="w-4 h-4 text-neutral-500 dark:text-neutral-400" />
                    <span className="text-xs font-mono text-neutral-500 dark:text-neutral-400">{isEnd ? 'Add at end' : formatTime(time)}</span>
                </button>
            </li>
        );

        if (isAddingMarker && currentPlayingIndex === -1 && items.length > 0) {
            const firstItemTime = timeline.get(items[0].id)?.startTime;
            const timeBefore = firstItemTime ? new Date(firstItemTime.getTime() - 1000) : new Date();
             rendered.push(<MarkerInserter key="inserter-start" index={0} time={timeBefore} />);
        }

        for (let index = 0; index < items.length; index++) {
            const item = items[index];
            const timelineData = timeline.get(item.id);
            const isCurrentlyPlaying = item.id === currentPlayingItemId;
            const isSkipped = skippedItemIds.has(item.id);
            const isAutoFilled = autoFilledItemIds.has(item.id);
            const shortenedBy = item.shortenedBy;

            if (item.type === 'hour_boundary_marker') {
                rendered.push(<PlaylistItemHourBoundary key={item.id} item={item} />);
            } else if (item.type === 'marker') {
                rendered.push(
                    <PlaylistItemMarker
                        key={item.id}
                        item={item}
                        onDoubleClick={setEditingMarker}
                        onRemove={() => handleDeleteRequest(item.id)}
                        onDragStart={(e) => handleDragStart(e, item.id)}
                        onDragEnd={handleDragEnd}
                        onDragOver={handleDragOver}
                        onDragEnter={() => {}}
                        onDrop={(e) => handleDrop(e, item.id)}
                        draggedId={draggedId}
                    />
                );
            } else {
                trackCounter++;
                const track = item as Track;
                rendered.push(
                   <PlaylistItemTrack
                        key={item.id}
                        track={track}
                        isCurrentlyPlaying={isCurrentlyPlaying}
                        isDuplicateWarning={duplicateIds.has(item.id)}
                        trackProgress={isCurrentlyPlaying ? trackProgress : 0}
                        stopAfterTrackId={stopAfterTrackId}
                        timelineData={timelineData}
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
                        isSkipped={isSkipped}
                        isAutoFilled={isAutoFilled}
                        shortenedBy={shortenedBy}
                   />
                );
            }

            if (isAddingMarker && (currentPlayingIndex === -1 || index >= currentPlayingIndex)) {
                if (item.type !== 'marker' && !isSkipped) {
                    const nonMarkerItems = rawPlaylist.slice(0, rawPlaylist.findIndex(i => i.id === item.id) + 1);
                    const originalIndex = nonMarkerItems.length;
                    rendered.push(<MarkerInserter index={originalIndex} time={timelineData?.endTime} />);
                }
            }
        }
        return rendered;
    };


    return (
        <div 
            className={`flex flex-col h-full transition-colors duration-200 ${isDragOver ? 'bg-green-500/10' : ''}`}
            onDrop={handleContainerDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleContainerDragLeave}
        >
            <div className="flex justify-between items-center p-4 border-b border-neutral-200 dark:border-neutral-800">
                <h2 className="text-xl font-semibold">Timeline</h2>
                 <div className="flex items-center gap-4">
                    <span className="text-sm text-neutral-500 dark:text-neutral-400 font-mono">
                        Total: {formatDuration(totalDuration)}
                    </span>
                    
                    <div className="flex items-center gap-2" title={isAutoFillEnabled ? "Auto-fill playlist ON" : "Auto-fill playlist OFF"}>
                        <label htmlFor="autofill-toggle" className="text-sm font-medium text-neutral-600 dark:text-neutral-400 cursor-pointer select-none">
                            Auto-fill
                        </label>
                        <Toggle
                            id="autofill-toggle"
                            checked={isAutoFillEnabled}
                            onChange={onToggleAutoFill}
                        />
                    </div>
                    
                    <div className="h-4 border-l border-neutral-300 dark:border-neutral-700"></div>

                    <button
                        onClick={() => setIsAddingMarker(p => !p)}
                        className={`p-1.5 rounded-md transition-colors ${isAddingMarker ? 'bg-red-500 text-white' : 'text-neutral-500 dark:text-neutral-400 hover:text-black dark:hover:text-white'}`}
                        title={isAddingMarker ? "Cancel Adding Marker" : "Add Time Marker"}
                    >
                        {isAddingMarker ? <CloseIcon className="w-5 h-5" /> : <ClockPlusIcon className="w-5 h-5" />}
                    </button>
                   
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
            <div className="flex-grow overflow-y-auto">
                <ul className="p-2 space-y-1">
                     {renderItems()}
                     {items.length === 0 && !isAddingMarker &&(
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
                Are you sure you want to clear the playlist?
                {isPlaying && ' The currently playing track will be kept.'}
            </ConfirmationDialog>
            <ConfirmationDialog
                isOpen={isConfirmOpen}
                onClose={handleCloseDialog}
                onConfirm={handleConfirmDelete}
                title="Remove from Playlist"
            >
                Are you sure you want to remove "{itemToDelete?.type === 'marker' ? `Time Marker at ${itemToDelete.time}` : (itemToDelete as Track)?.title}" from the playlist?
            </ConfirmationDialog>
            <AddTimeMarkerModal
                isOpen={isAddMarkerModalOpen || !!editingMarker}
                onClose={() => {
                    setIsAddMarkerModalOpen(false);
                    setEditingMarker(null);
                    setAddMarkerPrefill(null);
                }}
                onSave={(data) => {
                    if (editingMarker) {
                        onUpdateMarker(editingMarker.id, data);
                    } else {
                        onAddMarker({ ...data, index: addMarkerPrefill?.index });
                    }
                }}
                initialData={editingMarker || addMarkerPrefill}
            />
        </div>
    );
};

export default React.memo(Playlist);