import React, { useState } from 'react';
import { type ScheduledBlock, type Folder } from '../types';
import ScheduleBlockEditorModal from './CreateRotationModal';
import { PlusCircleIcon } from './icons/PlusCircleIcon';
import { PlayIcon } from './icons/PlayIcon';
import { RotationIcon } from './icons/RotationIcon';
import { SequenceIcon } from './icons/SequenceIcon';
import { CalendarIcon } from './icons/CalendarIcon';
import { CloneIcon } from './icons/CloneIcon';
import ConfirmationDialog from './ConfirmationDialog';
import { FolderIcon } from './icons/FolderIcon';
import { ChevronLeftIcon } from './icons/ChevronLeftIcon';
import { ChevronRightIcon } from './icons/ChevronRightIcon';


interface RotationSchedulerProps {
    schedule: ScheduledBlock[];
    onUpdateSchedule: (block: ScheduledBlock) => void;
    onClearSchedule: (blockId: string) => void;
    onLoadPlaylist: (hour: number) => void;
    mediaLibrary: Folder;
    folders: { id: string; name: string }[];
    allTags: string[];
}

/**
 * Finds the most specific scheduled block for a given hour and date.
 * Priority: Day of Month > Day of Week > Default.
 */
const findBlockForHour = (schedule: ScheduledBlock[], hour: number, date: Date): ScheduledBlock | undefined => {
    const dayOfMonth = date.getDate();
    const dayOfWeek = date.getDay();

    const blocksForHour = schedule.filter(b => b.hour === hour);
    if (blocksForHour.length === 0) return undefined;

    const dayOfMonthMatch = blocksForHour.find(b => b.daysOfMonth?.includes(dayOfMonth));
    if (dayOfMonthMatch) return dayOfMonthMatch;

    const dayOfWeekMatch = blocksForHour.find(b => b.daysOfWeek?.includes(dayOfWeek));
    if (dayOfWeekMatch) return dayOfWeekMatch;

    const defaultMatch = blocksForHour.find(b => (!b.daysOfWeek || b.daysOfWeek.length === 0) && (!b.daysOfMonth || b.daysOfMonth.length === 0));
    return defaultMatch;
};


const HourBlock: React.FC<{
    hour: number;
    block: ScheduledBlock | undefined;
    isCurrentHour: boolean;
    onEdit: () => void;
    onLoad: () => void;
    onClone: () => void;
    folders: { id: string; name: string }[];
}> = ({ hour, block, isCurrentHour, onEdit, onLoad, onClone, folders }) => {
    const timeLabel = `${String(hour).padStart(2, '0')}:00`;

    const baseClasses = "relative flex flex-col items-center justify-center p-2 rounded-lg group transition-all duration-200 aspect-square text-center border-2 cursor-pointer";
    const currentHourClasses = isCurrentHour ? "border-green-500 bg-green-500/10 dark:bg-green-900/40 shadow-lg shadow-green-500/20 dark:shadow-green-900/50" : "border-transparent bg-neutral-200/50 dark:bg-neutral-800/50 hover:bg-neutral-200 dark:hover:bg-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700";
    const hasAdvancedSchedule = block && (block.daysOfWeek?.length || block.daysOfMonth?.length);

    return (
        <li className={`${baseClasses} ${currentHourClasses}`} onClick={onEdit}>
             {hasAdvancedSchedule && (
                <div className="absolute top-1.5 left-1.5" title="This clock has specific day scheduling.">
                    <CalendarIcon className="w-4 h-4 text-neutral-400 dark:text-neutral-500" />
                </div>
            )}
            <div className="font-mono text-lg font-bold text-neutral-600 dark:text-neutral-300 mb-1 pointer-events-none">{timeLabel}</div>
            {block ? (
                <>
                    <div className="flex-grow flex flex-col items-center justify-center w-full overflow-hidden pointer-events-none">
                        {block.type === 'sequence' && <div title="Manual Sequence"><SequenceIcon className="w-6 h-6 text-neutral-500 dark:text-neutral-400 flex-shrink-0" /></div>}
                        {block.type === 'folder' && <div title="Folder Playlist"><FolderIcon className="w-6 h-6 text-neutral-500 dark:text-neutral-400 flex-shrink-0" /></div>}
                        <p className="text-xs text-neutral-500 dark:text-neutral-400 w-full truncate mt-1">
                            {block.title ? (
                                <span className="text-black dark:text-white font-medium">{block.title}</span>
                            ) : block.type === 'folder' && block.folderId ? (
                                <span className="italic">{folders.find(f => f.id === block.folderId)?.name || 'Folder Playlist'}</span>
                            ) : (
                                <span className="italic">Manual Sequence</span>
                            )}
                        </p>
                    </div>
                     <div 
                        className="absolute top-1 right-1 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                        onClick={(e) => e.stopPropagation()} 
                    >
                        <button onClick={onLoad} className="p-1.5 bg-neutral-300 dark:bg-neutral-700/80 rounded-full text-neutral-700 dark:text-neutral-200 hover:bg-neutral-400 dark:hover:bg-neutral-600 hover:text-black dark:hover:text-white transition-colors" title="Load to Playlist"><PlayIcon className="w-4 h-4"/></button>
                        <button onClick={onClone} className="p-1.5 bg-neutral-300 dark:bg-neutral-700/80 rounded-full text-neutral-700 dark:text-neutral-200 hover:bg-neutral-400 dark:hover:bg-neutral-600 hover:text-black dark:hover:text-white transition-colors" title="Clone Block"><CloneIcon className="w-4 h-4"/></button>
                    </div>
                </>
            ) : (
                 <div className="flex-grow flex items-center justify-center text-neutral-400 dark:text-neutral-600 group-hover:text-black dark:group-hover:text-white transition-colors">
                     <PlusCircleIcon className="w-8 h-8" />
                </div>
            )}
            {block?.loadMode && (
                <div 
                    className={`absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded text-xs font-bold leading-none
                        ${block.loadMode === 'hard' ? 'bg-yellow-400 text-black' : 'bg-blue-500 text-white'}`}
                    title={`Load Mode: ${block.loadMode.charAt(0).toUpperCase() + block.loadMode.slice(1)}`}
                >
                    {block.loadMode.charAt(0).toUpperCase()}
                </div>
            )}
        </li>
    );
};


const RotationScheduler: React.FC<RotationSchedulerProps> = ({ schedule, onUpdateSchedule, onClearSchedule, onLoadPlaylist, mediaLibrary, folders, allTags }) => {
    const [editingBlock, setEditingBlock] = useState<ScheduledBlock | { hour: number } | null>(null);
    const [cloningBlock, setCloningBlock] = useState<ScheduledBlock | null>(null);
    const [cloneTargetHours, setCloneTargetHours] = useState<Set<number>>(new Set());
    const [viewingDate, setViewingDate] = useState(() => new Date());


    const hours = Array.from({ length: 24 }, (_, i) => i);
    const isToday = viewingDate.toDateString() === new Date().toDateString();
    const currentHour = isToday ? new Date().getHours() : -1;

    const handleOpenModal = (hour: number) => {
        const blockForViewingDate = findBlockForHour(schedule, hour, viewingDate);
        // When editing, we prefer to edit the specific block shown, not a potential default one.
        setEditingBlock(blockForViewingDate || { hour });
    };

    const handleCloseModal = () => {
        setEditingBlock(null);
    };

    const handleSave = (block: ScheduledBlock) => {
        onUpdateSchedule(block);
        handleCloseModal();
    };

    const handleClone = (block: ScheduledBlock) => {
        setCloningBlock(block);
        setCloneTargetHours(new Set());
    };

    const handleToggleCloneHour = (hour: number) => {
        setCloneTargetHours(prev => {
            const newSet = new Set(prev);
            if (newSet.has(hour)) {
                newSet.delete(hour);
            } else {
                newSet.add(hour);
            }
            return newSet;
        });
    };

    const handleConfirmClone = () => {
        if (!cloningBlock || cloneTargetHours.size === 0) return;
        
        for (const hour of cloneTargetHours) {
            // We clone the *specific* block we clicked clone on, not a potential default.
            const newBlock = {
                ...cloningBlock,
                id: `block-${Date.now()}-${Math.random()}`,
                hour: hour,
            };
            onUpdateSchedule(newBlock);
        }
        setCloningBlock(null);
    };
    
    const handleDeleteAllForHour = (hourToDelete: number) => {
        const blockIdsToDelete = schedule
            .filter(b => b.hour === hourToDelete)
            .map(b => b.id);
        
        blockIdsToDelete.forEach(id => onClearSchedule(id));
    };

    const changeDate = (amount: number) => {
        setViewingDate(currentDate => {
            const newDate = new Date(currentDate);
            newDate.setDate(newDate.getDate() + amount);
            return newDate;
        });
    };

    const goToToday = () => {
        setViewingDate(new Date());
    };


    return (
        <div className="p-4 flex flex-col gap-4">
            <div className="flex items-center justify-between bg-neutral-200/40 dark:bg-neutral-800/40 p-2 rounded-lg">
                <button onClick={() => changeDate(-1)} className="p-2 rounded-md hover:bg-neutral-300 dark:hover:bg-neutral-700 transition-colors" aria-label="Previous day">
                    <ChevronLeftIcon className="w-5 h-5" />
                </button>
                <div className="text-center">
                    <button 
                        onClick={goToToday}
                        disabled={isToday}
                        className="font-semibold text-black dark:text-white text-sm hover:underline disabled:no-underline disabled:cursor-default"
                    >
                        {isToday ? 'Today' : 'Go to Today'}
                    </button>
                    <div className="text-xs text-neutral-500 dark:text-neutral-400">
                        {viewingDate.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    </div>
                </div>
                <button onClick={() => changeDate(1)} className="p-2 rounded-md hover:bg-neutral-300 dark:hover:bg-neutral-700 transition-colors" aria-label="Next day">
                    <ChevronRightIcon className="w-5 h-5" />
                </button>
            </div>

            <ul className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                {hours.map(hour => {
                    const blockForDate = findBlockForHour(schedule, hour, viewingDate);
                    return (
                    <HourBlock
                        key={hour}
                        hour={hour}
                        block={blockForDate}
                        isCurrentHour={hour === currentHour}
                        onEdit={() => handleOpenModal(hour)}
                        onLoad={() => blockForDate && onLoadPlaylist(hour)}
                        onClone={() => blockForDate && handleClone(blockForDate)}
                        folders={folders}
                    />
                )})}
            </ul>
            {editingBlock && (
                <ScheduleBlockEditorModal
                    isOpen={!!editingBlock}
                    onClose={handleCloseModal}
                    onSave={handleSave}
                    onDelete={handleDeleteAllForHour}
                    initialBlock={'id' in editingBlock ? editingBlock : undefined}
                    hour={editingBlock.hour}
                    mediaLibrary={mediaLibrary}
                    folders={folders}
                    allTags={allTags}
                />
            )}
             <ConfirmationDialog
                isOpen={!!cloningBlock}
                onClose={() => setCloningBlock(null)}
                onConfirm={handleConfirmClone}
                title={`Clone Clock for ${String(cloningBlock?.hour).padStart(2, '0')}:00`}
                confirmText="Clone"
                confirmButtonClass="bg-black dark:bg-white hover:bg-neutral-800 dark:hover:bg-neutral-200 text-white dark:text-black"
                cancelText="Cancel"
            >
                <p className="text-sm mb-4">Select destination hours to copy this clock configuration. Any existing clocks in the destination hours with the same day settings will be replaced.</p>
                <div className="grid grid-cols-6 gap-2 max-h-64 overflow-y-auto pr-2">
                    {hours.map(h => (
                         <button key={h}
                            onClick={() => handleToggleCloneHour(h)}
                            disabled={h === cloningBlock?.hour}
                            className={`p-2 rounded-md text-center font-mono transition-colors ${
                                cloneTargetHours.has(h) 
                                    ? 'bg-green-600 text-white' 
                                    : 'bg-neutral-300 dark:bg-neutral-700 hover:bg-neutral-400 dark:hover:bg-neutral-600'
                            } disabled:bg-neutral-200 dark:disabled:bg-neutral-800 disabled:text-neutral-400 dark:disabled:text-neutral-500 disabled:cursor-not-allowed`}
                         >
                             {String(h).padStart(2, '0')}
                         </button>
                    ))}
                </div>
            </ConfirmationDialog>
        </div>
    );
};

export default React.memo(RotationScheduler);