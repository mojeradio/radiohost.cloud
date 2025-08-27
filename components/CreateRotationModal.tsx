import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { TrackType, type ScheduledBlock, type Track, type Folder, type LibraryItem, type TimeFixMarker, type SequenceItem, type ClockStartMarker, RandomFromFolderMarker, RandomFromTagMarker } from '../types';
import { FolderIcon } from './icons/FolderIcon';
import { MusicNoteIcon } from './icons/MusicNoteIcon';
import { MegaphoneIcon } from './icons/MegaphoneIcon';
import { TagIcon } from './icons/TagIcon';
import { MicrophoneIcon } from './icons/MicrophoneIcon';
import { GrabHandleIcon } from './icons/GrabHandleIcon';
import { TrashIcon } from './icons/TrashIcon';
import { ClockIcon } from './icons/ClockIcon';
import ConfirmationDialog from './ConfirmationDialog';
import AddTimeMarkerModal from './AddTimeMarkerModal';
import { SequenceIcon } from './icons/SequenceIcon';
import { RotationIcon } from './icons/RotationIcon';
import { CloseIcon } from './icons/CloseIcon';

interface ScheduleBlockEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (block: ScheduledBlock) => void;
  onDelete: (hour: number) => void;
  initialBlock?: ScheduledBlock;
  hour: number;
  mediaLibrary: Folder;
  folders: { id: string; name: string }[];
  allTags: string[];
}

const formatDuration = (seconds: number): string => {
    const roundedSeconds = Math.floor(seconds);
    const min = Math.floor(roundedSeconds / 60);
    const sec = roundedSeconds % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
};


// --- Performance Optimized Mini Media Browser ---

const TypeIcon: React.FC<{ item: LibraryItem }> = React.memo(({ item }) => {
    const iconClass = "w-5 h-5 text-neutral-500 dark:text-neutral-400";
    if (item.type === 'folder') return <FolderIcon className={iconClass} />;
    switch (item.type) {
        case TrackType.SONG: return <MusicNoteIcon className={iconClass} />;
        case TrackType.JINGLE: return <TagIcon className={iconClass} />;
        case TrackType.AD: return <MegaphoneIcon className={iconClass} />;
        case TrackType.VOICETRACK: return <MicrophoneIcon className={iconClass} />;
        default: return null;
    }
});

const BrowserItem = React.memo(({ item, onNavigate, onDragStart }: {
    item: LibraryItem;
    onNavigate: (folder: Folder) => void;
    onDragStart: (e: React.DragEvent, track: Track) => void;
}) => (
    <li 
        draggable={item.type !== 'folder'}
        onDragStart={item.type !== 'folder' ? (e) => onDragStart(e, item as Track) : undefined}
        onClick={item.type === 'folder' ? () => onNavigate(item) : undefined}
        className={`flex items-center gap-3 p-2 rounded-md text-sm ${item.type === 'folder' ? 'cursor-pointer hover:bg-neutral-200 dark:hover:bg-neutral-800' : 'hover:bg-neutral-200 dark:hover:bg-neutral-800 cursor-grab'}`}
    >
        <TypeIcon item={item} />
        <span className="truncate">{item.type === 'folder' ? item.name : (item as Track).title}</span>
    </li>
));

const findFolder = (folder: Folder, folderId: string): Folder | null => {
    if (folder.id === folderId) return folder;
    for (const child of folder.children) {
        if (child.type === 'folder') {
            const found = findFolder(child, folderId);
            if (found) return found;
        }
    }
    return null;
};

const getAllTracks = (folder: Folder): Track[] => {
    let tracks: Track[] = [];
    folder.children.forEach(child => {
        if (child.type === 'folder') {
            tracks = tracks.concat(getAllTracks(child));
        } else {
            tracks.push(child);
        }
    });
    return tracks;
}

const MiniMediaBrowser: React.FC<{ rootFolder: Folder }> = ({ rootFolder }) => {
    const [path, setPath] = useState<{ id: string; name: string }[]>([{ id: rootFolder.id, name: 'Library' }]);
    const [searchQuery, setSearchQuery] = useState('');
    const currentFolderId = path[path.length - 1].id;
    
    const isSearching = searchQuery.trim().length > 0;

    const currentFolder = useMemo(() => findFolder(rootFolder, currentFolderId) || rootFolder, [rootFolder, currentFolderId]);
    
    const displayItems = useMemo(() => {
        if (isSearching) {
            const query = searchQuery.toLowerCase().trim();
            const results: LibraryItem[] = [];

            const traverse = (item: LibraryItem) => {
                let isMatch = false;
                
                // Check tags
                if (item.tags?.some(tag => tag.toLowerCase().includes(query))) {
                    isMatch = true;
                }

                if (item.type === 'folder') {
                    // Check folder name
                    if (!isMatch && item.name.toLowerCase().includes(query)) {
                        isMatch = true;
                    }
                    if (isMatch) {
                        results.push(item);
                    }
                    // Always traverse children
                    item.children.forEach(traverse);
                } else { // track
                    const track = item as Track;
                    // Check title and artist
                    if (!isMatch && (
                        track.title.toLowerCase().includes(query) ||
                        track.artist.toLowerCase().includes(query)
                    )) {
                        isMatch = true;
                    }
                    if (isMatch) {
                        results.push(item);
                    }
                }
            };

            traverse(rootFolder);
            
            results.sort((a, b) => {
                if (a.type === 'folder' && b.type !== 'folder') return -1;
                if (a.type !== 'folder' && b.type === 'folder') return 1;
                const titleA = a.type === 'folder' ? a.name : (a as Track).title;
                const titleB = b.type === 'folder' ? b.name : (b as Track).title;
                return titleA.localeCompare(titleB);
            });

            return results;
        }

        // When not searching
        return [...currentFolder.children].sort((a, b) => {
            if (a.type === 'folder' && b.type !== 'folder') return -1;
            if (a.type !== 'folder' && b.type === 'folder') return 1;
            const titleA = a.type === 'folder' ? a.name : (a as Track).title;
            const titleB = b.type === 'folder' ? b.name : (b as Track).title;
            return titleA.localeCompare(titleB);
        });
    }, [currentFolder.children, rootFolder, isSearching, searchQuery]);
    

    const handleNavigate = useCallback((folder: Folder) => {
        setSearchQuery('');
        setPath(prev => [...prev, { id: folder.id, name: folder.name }])
    }, []);
    const handleBreadcrumbClick = useCallback((index: number) => {
        setSearchQuery('');
        setPath(prev => prev.slice(0, index + 1))
    }, []);
    const handleDragStart = useCallback((e: React.DragEvent, track: Track) => {
        e.dataTransfer.setData('application/json', JSON.stringify(track));
        e.dataTransfer.effectAllowed = 'copy';
    }, []);

    return (
        <div className="flex flex-col h-full bg-neutral-100 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-lg">
            <div className="p-2 border-b border-neutral-300 dark:border-neutral-700 space-y-2">
                <input
                    type="search"
                    placeholder="Search all..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full bg-white dark:bg-black border border-neutral-300 dark:border-neutral-700 rounded-md px-2 py-1 text-sm"
                />
                 {!isSearching && (
                    <nav className="flex items-center text-xs text-neutral-500 dark:text-neutral-400" aria-label="Breadcrumb">
                        {path.map((p, index) => (
                            <React.Fragment key={p.id}>
                                <button onClick={() => handleBreadcrumbClick(index)} className="hover:underline disabled:no-underline disabled:text-neutral-800 dark:disabled:text-neutral-300" disabled={index === path.length - 1}>
                                    {p.name}
                                </button>
                                {index < path.length - 1 && <span className="mx-1">/</span>}
                            </React.Fragment>
                        ))}
                    </nav>
                 )}
            </div>
            <div className="flex-grow overflow-y-auto p-1">
                 <ul>
                    {displayItems.map(item => (
                       <BrowserItem
                            key={item.id}
                            item={item}
                            onNavigate={handleNavigate}
                            onDragStart={handleDragStart}
                       />
                    ))}
                 </ul>
            </div>
        </div>
    );
};

const MemoizedMiniMediaBrowser = React.memo(MiniMediaBrowser);

const WEEK_DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// --- Optimized Sequence List Items ---
const SequenceTrackItem = React.memo(({ item, index, isDragOver, onRemove, onDragStart, onDragEnter, onDragLeave, onDrop }: {
    item: Track; index: number; isDragOver: boolean;
    onRemove: (id: string) => void;
    onDragStart: (e: React.DragEvent, id: string) => void;
    onDragEnter: (e: React.DragEvent, id: string) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent, id: string) => void;
}) => (
    <li 
        draggable 
        onDragStart={e => onDragStart(e, item.id)}
        onDragEnter={e => onDragEnter(e, item.id)}
        onDragLeave={onDragLeave}
        onDrop={e => onDrop(e, item.id)}
        className={`flex items-center justify-between p-2 rounded-md group transition-colors duration-200 border-t-2 ${isDragOver ? 'border-black dark:border-white' : 'border-transparent'} hover:bg-neutral-200 dark:hover:bg-neutral-800`}
    >
        <div className="flex items-center gap-3 overflow-hidden">
            <GrabHandleIcon className="w-5 h-5 text-neutral-400 dark:text-neutral-500 cursor-grab flex-shrink-0" />
            <span className="font-mono text-xs text-neutral-500">{String(index + 1).padStart(2, '0')}</span>
            <p className="truncate text-black dark:text-white text-sm">{item.title}</p>
        </div>
        <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500 font-mono">{formatDuration(item.duration)}</span>
            <button onClick={() => onRemove(item.id)} className="p-1 text-neutral-500 hover:text-red-500 opacity-0 group-hover:opacity-100"><TrashIcon className="w-4 h-4" /></button>
        </div>
    </li>
));

const SequenceMarkerItem = React.memo(({ item, isDragOver, onRemove, onDoubleClick, onDragStart, onDragEnter, onDragLeave, onDrop }: {
    item: TimeFixMarker; isDragOver: boolean;
    onRemove: (id: string) => void;
    onDoubleClick: (marker: TimeFixMarker) => void;
    onDragStart: (e: React.DragEvent, id: string) => void;
    onDragEnter: (e: React.DragEvent, id: string) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent, id: string) => void;
}) => {
    const isHard = item.markerType === 'hard';
    const bgColor = isHard ? 'bg-yellow-400/20 dark:bg-yellow-900/40' : 'bg-blue-400/20 dark:bg-blue-900/40';
    const textColor = isHard ? 'text-yellow-800 dark:text-yellow-300' : 'text-blue-800 dark:text-blue-300';
    const timeColor = isHard ? 'text-yellow-700 dark:text-yellow-400' : 'text-blue-700 dark:text-blue-400';
    const iconColor = isHard ? 'text-yellow-600 dark:text-yellow-400' : 'text-blue-600 dark:text-blue-400';
    
    return (
        <li 
            draggable 
            onDragStart={e => onDragStart(e, item.id)}
            onDragEnter={e => onDragEnter(e, item.id)}
            onDragLeave={onDragLeave}
            onDrop={e => onDrop(e, item.id)}
            onDoubleClick={() => onDoubleClick(item)}
            title="Double-click to edit"
            className={`flex items-center justify-between p-2 rounded-md group cursor-pointer border-t-2 ${bgColor} ${isDragOver ? 'border-black dark:border-white' : 'border-transparent'}`}
        >
            <div className="flex items-center gap-3 overflow-hidden">
                <GrabHandleIcon className="w-5 h-5 text-neutral-400 dark:text-neutral-500 cursor-grab flex-shrink-0" />
                <ClockIcon className={`w-5 h-5 ${iconColor} flex-shrink-0`}/>
                <div className="truncate">
                    <p className={`text-sm font-semibold ${textColor}`}>{isHard ? 'HARD FIX' : 'SOFT FIX'}</p>
                    <p className={`font-mono text-xs ${timeColor}`}>{item.time}</p>
                </div>
            </div>
            <button onClick={() => onRemove(item.id)} className="p-1 text-neutral-500 hover:text-red-500 opacity-0 group-hover:opacity-100">
                <TrashIcon className="w-4 h-4" />
            </button>
        </li>
    );
});

const SequenceRandomFolderItem = React.memo(({ item, folders, isDragOver, onRemove, onDragStart, onDragEnter, onDragLeave, onDrop }: {
    item: RandomFromFolderMarker; folders: { id: string; name: string }[]; isDragOver: boolean;
    onRemove: (id: string) => void;
    onDragStart: (e: React.DragEvent, id: string) => void;
    onDragEnter: (e: React.DragEvent, id: string) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent, id: string) => void;
}) => {
    const folderName = folders.find(f => f.id === item.folderId)?.name || 'Unknown Folder';
    return (
        <li
            draggable
            onDragStart={e => onDragStart(e, item.id)}
            onDragEnter={e => onDragEnter(e, item.id)}
            onDragLeave={onDragLeave}
            onDrop={e => onDrop(e, item.id)}
            className={`flex items-center justify-between p-2 rounded-md group transition-colors duration-200 border-t-2 bg-purple-400/20 dark:bg-purple-900/40 ${isDragOver ? 'border-black dark:border-white' : 'border-transparent'} hover:bg-purple-400/30 dark:hover:bg-purple-900/50`}
        >
            <div className="flex items-center gap-3 overflow-hidden">
                <GrabHandleIcon className="w-5 h-5 text-neutral-400 dark:text-neutral-500 cursor-grab flex-shrink-0" />
                <RotationIcon className="w-5 h-5 text-purple-600 dark:text-purple-400 flex-shrink-0" />
                <p className="truncate text-purple-800 dark:text-purple-300 text-sm">
                    Random from <span className="font-semibold">"{folderName}"</span>
                </p>
            </div>
            <button onClick={() => onRemove(item.id)} className="p-1 text-neutral-500 hover:text-red-500 opacity-0 group-hover:opacity-100">
                <TrashIcon className="w-4 h-4" />
            </button>
        </li>
    );
});

const SequenceTagItem = React.memo(({ item, isDragOver, onRemove, onDragStart, onDragEnter, onDragLeave, onDrop }: {
    item: RandomFromTagMarker; isDragOver: boolean;
    onRemove: (id: string) => void;
    onDragStart: (e: React.DragEvent, id: string) => void;
    onDragEnter: (e: React.DragEvent, id: string) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent, id: string) => void;
}) => {
    return (
        <li
            draggable
            onDragStart={e => onDragStart(e, item.id)}
            onDragEnter={e => onDragEnter(e, item.id)}
            onDragLeave={onDragLeave}
            onDrop={e => onDrop(e, item.id)}
            className={`flex items-center justify-between p-2 rounded-md group transition-colors duration-200 border-t-2 bg-blue-400/20 dark:bg-blue-900/40 ${isDragOver ? 'border-black dark:border-white' : 'border-transparent'} hover:bg-blue-400/30 dark:hover:bg-blue-900/50`}
        >
            <div className="flex items-center gap-3 overflow-hidden">
                <GrabHandleIcon className="w-5 h-5 text-neutral-400 dark:text-neutral-500 cursor-grab flex-shrink-0" />
                <TagIcon className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                <p className="truncate text-blue-800 dark:text-blue-300 text-sm">
                    Random with tag <span className="font-semibold">"{item.tag}"</span>
                </p>
            </div>
            <button onClick={() => onRemove(item.id)} className="p-1 text-neutral-500 hover:text-red-500 opacity-0 group-hover:opacity-100">
                <TrashIcon className="w-4 h-4" />
            </button>
        </li>
    );
});


// --- Main Modal Component ---
const ScheduleBlockEditorModal: React.FC<ScheduleBlockEditorModalProps> = ({ isOpen, onClose, onSave, onDelete, initialBlock, hour, mediaLibrary, folders, allTags }) => {
  const [blockType, setBlockType] = useState<'sequence' | 'folder'>('sequence');
  const [title, setTitle] = useState('');
  const [sequence, setSequence] = useState<SequenceItem[]>([]);
  const [isAddMarkerModalOpen, setIsAddMarkerModalOpen] = useState(false);
  const [editingMarker, setEditingMarker] = useState<TimeFixMarker | null>(null);
  const [folderId, setFolderId] = useState<string>('');
  const [randomFolderId, setRandomFolderId] = useState<string>('');
  const [randomTag, setRandomTag] = useState<string>('');
  const [loadMode, setLoadMode] = useState<'hard' | 'soft'>('soft');
  const [preloadTime, setPreloadTime] = useState(2);
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([]);
  const [daysOfMonth, setDaysOfMonth] = useState<string>('');
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const draggedItemIdRef = useRef<string | null>(null);

  const resetState = useCallback(() => {
    setBlockType('sequence');
    setTitle('');
    setSequence([]);
    setFolderId(folders[0]?.id || 'root');
    setRandomFolderId(folders[0]?.id || 'root');
    setRandomTag(allTags[0] || '');
    setLoadMode('soft');
    setPreloadTime(2);
    setDaysOfWeek([]);
    setDaysOfMonth('');
  }, [folders, allTags]);

  useEffect(() => {
    if (isOpen) {
        if (initialBlock) {
            setBlockType(initialBlock.type);
            setTitle(initialBlock.title || '');
            setSequence(initialBlock.type === 'sequence' ? initialBlock.sequenceItems || [] : []);
            const firstFolderId = folders[0]?.id || 'root';
            const firstTag = allTags[0] || '';
            setFolderId(initialBlock.type === 'folder' && initialBlock.folderId ? initialBlock.folderId : firstFolderId);
            setRandomFolderId(firstFolderId);
            setRandomTag(firstTag);
            setLoadMode(initialBlock.loadMode || 'soft');
            setPreloadTime(initialBlock.preloadTime ?? 2);
            setDaysOfWeek(initialBlock.daysOfWeek || []);
            setDaysOfMonth((initialBlock.daysOfMonth || []).join(', '));
        } else {
            resetState();
        }
    }
}, [initialBlock, folders, allTags, isOpen, resetState]);

  const sequenceDuration = useMemo(() => sequence.reduce((sum, item) => sum + (item.type !== 'marker' && item.type !== 'clock_start_marker' && item.type !== 'random_from_folder' && item.type !== 'random_from_tag' && item.type !== 'autofill_marker' ? (item as Track).duration : 0), 0), [sequence]);

  const handleSaveAndClose = useCallback(() => {
    let block: ScheduledBlock;
    const parsedDaysOfMonth = daysOfMonth.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n >= 1 && n <= 31);

    const wasDefault = initialBlock ? (!initialBlock.daysOfWeek || initialBlock.daysOfWeek.length === 0) && (!initialBlock.daysOfMonth || initialBlock.daysOfMonth.length === 0) : false;
    const isNowSpecific = daysOfWeek.length > 0 || parsedDaysOfMonth.length > 0;

    const blockId = (initialBlock && !(wasDefault && isNowSpecific))
        ? initialBlock.id
        : `block-${Date.now()}-${Math.random()}`;

    const baseBlock = {
        id: blockId,
        hour,
        title,
        loadMode,
        preloadTime,
        daysOfWeek: daysOfWeek.length > 0 ? daysOfWeek : undefined,
        daysOfMonth: parsedDaysOfMonth.length > 0 ? parsedDaysOfMonth : undefined,
    };

    if (blockType === 'sequence') {
      block = { ...baseBlock, type: 'sequence', sequenceItems: sequence };
    } else {
        if (!folderId) return;
        block = { ...baseBlock, type: 'folder', folderId };
    }
    onSave(block);
  }, [hour, title, daysOfWeek, daysOfMonth, blockType, sequence, folderId, initialBlock, onSave, loadMode, preloadTime]);
  
    const handleDelete = useCallback(() => {
        if (initialBlock?.id) {
            onDelete(hour);
            onClose();
        }
    }, [initialBlock, hour, onDelete, onClose]);
  
    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        const trackJson = e.dataTransfer.getData('application/json');
        if (trackJson) {
            try {
                const track = JSON.parse(trackJson) as Track;
                setSequence(current => {
                    const lastItem = current.length > 0 ? current[current.length - 1] : null;
                    if (lastItem && lastItem.type === 'marker') {
                        return current;
                    }
                    return [...current, track];
                });
            } catch(err) { console.error("Error parsing dropped track data:", err); }
        }
        setDragOverId(null);
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent) => e.preventDefault(), []);

    const handleRemoveFromSequence = useCallback((id: string) => {
        setSequence(current => current.filter(item => item.id !== id));
    }, []);

    const handleDragStart = useCallback((e: React.DragEvent, id: string) => {
        draggedItemIdRef.current = id;
    }, []);

    const handleInternalDrop = useCallback((e: React.DragEvent, dropTargetId: string) => {
        e.preventDefault();
        const draggedId = draggedItemIdRef.current;
        if (draggedId && draggedId !== dropTargetId) {
             setSequence(currentSequence => {
                const dragIndex = currentSequence.findIndex(item => item.id === draggedId);
                const dropIndex = currentSequence.findIndex(item => item.id === dropTargetId);
                if (dragIndex === -1 || dropIndex === -1) return currentSequence;
        
                if (dropIndex > 0) {
                    const itemBefore = currentSequence[dropIndex - 1];
                    if (itemBefore && itemBefore.type === 'marker') {
                        return currentSequence;
                    }
                }
        
                const newSequence = [...currentSequence];
                const [draggedItem] = newSequence.splice(dragIndex, 1);
                newSequence.splice(dropIndex, 0, draggedItem);
                return newSequence;
            });
        }
        draggedItemIdRef.current = null;
        setDragOverId(null);
    }, []);
    
    const handleDragEnter = useCallback((e: React.DragEvent, id: string) => {
        e.preventDefault();
        if (draggedItemIdRef.current !== id) {
            setDragOverId(id);
        }
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragOverId(null);
    }, []);

    const handleDayOfWeekToggle = useCallback((dayIndex: number) => {
        setDaysOfWeek(prev => 
            prev.includes(dayIndex) 
                ? prev.filter(d => d !== dayIndex) 
                : [...prev, dayIndex].sort()
        );
    }, []);

    const handleAddRandomFromFolder = () => {
        if (!randomFolderId) return;
        const newMarker: RandomFromFolderMarker = {
            id: `random-folder-${Date.now()}`,
            type: 'random_from_folder',
            folderId: randomFolderId,
        };
        setSequence(prev => {
            const lastItem = prev.length > 0 ? prev[prev.length - 1] : null;
            if (lastItem && lastItem.type === 'marker') {
                return prev;
            }
            return [...prev, newMarker];
        });
    };

    const handleAddRandomFromTag = () => {
        if (!randomTag) return;
        const newMarker: RandomFromTagMarker = {
            id: `random-tag-${Date.now()}`,
            type: 'random_from_tag',
            tag: randomTag,
        };
        setSequence(prev => {
            const lastItem = prev.length > 0 ? prev[prev.length - 1] : null;
            if (lastItem && lastItem.type === 'marker') {
                return prev;
            }
            return [...prev, newMarker];
        });
    };

    const formatPreloadTime = (minutes: number): string => {
        if (minutes < 60) return `${minutes} min`;
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;
        if (remainingMinutes === 0) return `${hours}h`;
        return `${hours}h ${remainingMinutes}min`;
    };

  if (!isOpen) return null;
  const timeLabel = `${String(hour).padStart(2, '0')}:00`;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50" onClick={onClose}>
        <div className="bg-neutral-100 dark:bg-neutral-900 rounded-lg shadow-xl border border-neutral-300 dark:border-neutral-800 w-full max-w-5xl h-[90vh] m-4 flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex justify-between items-center p-4 border-b border-neutral-300 dark:border-neutral-700 flex-shrink-0">
                <h2 className="text-xl font-bold text-black dark:text-white">
                    {initialBlock ? 'Edit' : 'Create'} Clock for {timeLabel}
                </h2>
                <div className="flex items-center gap-4">
                    {initialBlock && <button onClick={() => setIsDeleteConfirmOpen(true)} className="px-3 py-1.5 text-sm font-semibold text-red-500 hover:bg-red-500/10 rounded-md">Delete Clock</button>}
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-neutral-200 dark:hover:bg-neutral-800"><CloseIcon className="w-6 h-6"/></button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-grow flex p-4 gap-4 overflow-hidden">
                {/* Left Panel: Settings */}
                <div className="w-1/3 flex flex-col gap-4 overflow-y-auto pr-2">
                    {/* Basic Info */}
                    <div className="space-y-4 p-4 bg-white dark:bg-black rounded-lg border border-neutral-200 dark:border-neutral-800">
                         <div>
                            <label htmlFor="block-title" className="block text-sm font-medium">Clock Title (Optional)</label>
                            <input type="text" id="block-title" value={title} onChange={e => setTitle(e.target.value)} placeholder={`e.g., Morning Drive`} className="mt-1 w-full bg-neutral-100 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-md p-2"/>
                         </div>
                         <div>
                            <label className="block text-sm font-medium mb-1">Clock Type</label>
                            <div className="flex gap-2">
                                <button onClick={() => setBlockType('sequence')} className={`flex-1 p-2 rounded-md text-sm font-semibold flex items-center justify-center gap-2 ${blockType === 'sequence' ? 'bg-black text-white dark:bg-white dark:text-black' : 'bg-neutral-200 dark:bg-neutral-800'}`}>
                                    <SequenceIcon className="w-5 h-5"/> Manual Sequence
                                </button>
                                <button onClick={() => setBlockType('folder')} className={`flex-1 p-2 rounded-md text-sm font-semibold flex items-center justify-center gap-2 ${blockType === 'folder' ? 'bg-black text-white dark:bg-white dark:text-black' : 'bg-neutral-200 dark:bg-neutral-800'}`}>
                                    <FolderIcon className="w-5 h-5"/> Folder Playlist
                                </button>
                            </div>
                        </div>
                    </div>

                     {/* Advanced Scheduling */}
                     <div className="space-y-4 p-4 bg-white dark:bg-black rounded-lg border border-neutral-200 dark:border-neutral-800">
                         <h3 className="font-semibold text-black dark:text-white">Advanced Scheduling</h3>
                         <p className="text-xs text-neutral-500 -mt-2">Leave blank to run this clock every day. If you set specific days, it will only run on those days.</p>
                         <div>
                            <label className="block text-sm font-medium mb-2">Days of the Week</label>
                            <div className="flex justify-around gap-1">
                                {WEEK_DAYS.map((day, index) => (
                                    <button key={index} onClick={() => handleDayOfWeekToggle(index)} className={`w-8 h-8 rounded-full text-xs font-bold transition-colors ${daysOfWeek.includes(index) ? 'bg-blue-600 text-white' : 'bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700'}`}>
                                        {day}
                                    </button>
                                ))}
                            </div>
                         </div>
                         <div>
                            <label htmlFor="days-of-month" className="block text-sm font-medium">Days of the Month</label>
                            <input id="days-of-month" value={daysOfMonth} onChange={e => setDaysOfMonth(e.target.value)} placeholder="e.g., 1, 15, 30" className="mt-1 w-full bg-neutral-100 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-md p-2 text-sm"/>
                         </div>
                    </div>
                     {/* Load Options */}
                     <div className="space-y-4 p-4 bg-white dark:bg-black rounded-lg border border-neutral-200 dark:border-neutral-800">
                         <h3 className="font-semibold text-black dark:text-white">Load Options</h3>
                         <div>
                            <label className="block text-sm font-medium mb-1">Load Mode</label>
                            <div className="flex gap-2">
                                <button onClick={() => setLoadMode('soft')} className={`flex-1 p-2 rounded-md text-sm font-semibold ${loadMode === 'soft' ? 'bg-blue-600 text-white' : 'bg-neutral-200 dark:bg-neutral-800'}`}>Soft</button>
                                <button onClick={() => setLoadMode('hard')} className={`flex-1 p-2 rounded-md text-sm font-semibold ${loadMode === 'hard' ? 'bg-yellow-500 text-black' : 'bg-neutral-200 dark:bg-neutral-800'}`}>Hard</button>
                            </div>
                            <p className="text-xs text-neutral-500 mt-1">{loadMode === 'soft' ? 'Waits for current track to end before loading.' : 'Interrupts current track to load at the top of the hour.'}</p>
                         </div>
                         <div>
                             <label htmlFor="preload-time" className="flex justify-between text-sm font-medium">
                                <span>Pre-load Time</span>
                                <span className="font-mono">{formatPreloadTime(preloadTime)}</span>
                            </label>
                            <input id="preload-time" type="range" min="1" max="60" step="1" value={preloadTime} onChange={(e) => setPreloadTime(parseInt(e.target.value, 10))} className="w-full h-2 bg-neutral-200 dark:bg-neutral-700 rounded-lg appearance-none cursor-pointer mt-1"/>
                         </div>
                    </div>
                </div>

                {/* Right Panel: Editor */}
                <div className="w-2/3 flex flex-col gap-4 overflow-hidden">
                    {blockType === 'sequence' ? (
                        <div className="flex-grow flex gap-4 overflow-hidden">
                            {/* Sequence List */}
                            <div className="w-1/2 flex flex-col bg-white dark:bg-black rounded-lg border border-neutral-200 dark:border-neutral-800">
                                <div className="flex justify-between items-center p-2 border-b border-neutral-200 dark:border-neutral-800">
                                    <h3 className="font-semibold">Sequence</h3>
                                    <span className="text-xs text-neutral-500 font-mono">Total: {formatDuration(sequenceDuration)}</span>
                                </div>
                                <div onDrop={handleDrop} onDragOver={handleDragOver} className="flex-grow overflow-y-auto p-1">
                                    {sequence.length === 0 ? (
                                        <div className="text-center text-neutral-400 p-8">Drag items from the right to build your sequence.</div>
                                    ) : (
                                        <ul>
                                            {sequence.map((item, index) => {
                                                const isDragOver = item.id === dragOverId;
                                                if (item.type === 'marker') {
                                                    return <SequenceMarkerItem key={item.id} item={item} isDragOver={isDragOver} onRemove={handleRemoveFromSequence} onDoubleClick={setEditingMarker} onDragStart={handleDragStart} onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDrop={handleInternalDrop} />;
                                                }
                                                if(item.type === 'random_from_folder'){
                                                    return <SequenceRandomFolderItem key={item.id} item={item} folders={folders} isDragOver={isDragOver} onRemove={handleRemoveFromSequence} onDragStart={handleDragStart} onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDrop={handleInternalDrop} />;
                                                }
                                                if(item.type === 'random_from_tag'){
                                                    return <SequenceTagItem key={item.id} item={item} isDragOver={isDragOver} onRemove={handleRemoveFromSequence} onDragStart={handleDragStart} onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDrop={handleInternalDrop} />;
                                                }
                                                if (item.type === 'clock_start_marker' || item.type === 'autofill_marker') {
                                                    return null;
                                                }
                                                return <SequenceTrackItem key={item.id} item={item} index={index} isDragOver={isDragOver} onRemove={handleRemoveFromSequence} onDragStart={handleDragStart} onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDrop={handleInternalDrop} />;
                                            })}
                                        </ul>
                                    )}
                                </div>
                                <div className="p-2 border-t border-neutral-200 dark:border-neutral-800">
                                    <button onClick={() => setIsAddMarkerModalOpen(true)} className="w-full p-2 text-sm text-center rounded-md bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700">Add Time Marker</button>
                                </div>
                            </div>
                             {/* Tools & Browser */}
                            <div className="w-1/2 flex flex-col gap-4">
                                <div className="p-3 bg-white dark:bg-black rounded-lg border border-neutral-200 dark:border-neutral-800 space-y-3">
                                    <h4 className="font-semibold text-sm">Dynamic Items</h4>
                                    <div className="flex items-end gap-2">
                                        <select value={randomFolderId} onChange={e => setRandomFolderId(e.target.value)} className="flex-1 w-full bg-neutral-100 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-md p-2 text-sm">
                                            {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                                        </select>
                                        <button onClick={handleAddRandomFromFolder} className="px-3 py-2 bg-neutral-200 dark:bg-neutral-800 rounded-md text-sm hover:bg-neutral-300 dark:hover:bg-neutral-700">Add</button>
                                    </div>
                                    <div className="flex items-end gap-2">
                                         <select value={randomTag} onChange={e => setRandomTag(e.target.value)} className="flex-1 w-full bg-neutral-100 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-md p-2 text-sm">
                                            {allTags.map(t => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                        <button onClick={handleAddRandomFromTag} className="px-3 py-2 bg-neutral-200 dark:bg-neutral-800 rounded-md text-sm hover:bg-neutral-300 dark:hover:bg-neutral-700">Add</button>
                                    </div>
                                </div>
                                <div className="flex-grow overflow-hidden"><MemoizedMiniMediaBrowser rootFolder={mediaLibrary} /></div>
                            </div>
                        </div>
                    ) : (
                        <div className="w-full flex flex-col items-center justify-center bg-white dark:bg-black rounded-lg border border-neutral-200 dark:border-neutral-800 p-8">
                             <h3 className="font-semibold mb-2">Select Folder</h3>
                            <p className="text-sm text-neutral-500 mb-4">A playlist will be generated randomly from all tracks within this folder.</p>
                            <select value={folderId} onChange={e => setFolderId(e.target.value)} className="w-full max-w-sm bg-neutral-100 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-md p-2">
                                {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                            </select>
                        </div>
                    )}
                </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end items-center p-4 border-t border-neutral-300 dark:border-neutral-700 flex-shrink-0">
                <button onClick={handleSaveAndClose} className="px-5 py-2.5 font-semibold rounded-lg bg-black text-white dark:bg-white dark:text-black">Save Clock</button>
            </div>
            <AddTimeMarkerModal isOpen={isAddMarkerModalOpen || !!editingMarker} onClose={() => { setIsAddMarkerModalOpen(false); setEditingMarker(null); }} onSave={(data) => {
                if(editingMarker) {
                    setSequence(s => s.map(item => item.id === editingMarker.id ? { ...item, ...data } : item));
                } else {
                    const newMarker: TimeFixMarker = { id: `marker-${Date.now()}`, type: 'marker', ...data };
                    setSequence(s => {
                        const lastItem = s.length > 0 ? s[s.length - 1] : null;
                        if (lastItem && lastItem.type === 'marker') {
                            return s;
                        }
                        return [...s, newMarker];
                    });
                }
            }} initialData={editingMarker} />
            <ConfirmationDialog isOpen={isDeleteConfirmOpen} onClose={() => setIsDeleteConfirmOpen(false)} onConfirm={handleDelete} title="Delete Clock">
                Are you sure you want to delete all scheduling for {timeLabel}? This action cannot be undone.
            </ConfirmationDialog>
        </div>
    </div>
  );
};

export default React.memo(ScheduleBlockEditorModal);