import React, { useState, useEffect, useRef } from 'react';
import { type CartwallCategory, type Folder, type Track } from '../types';
import { PlusIcon } from './icons/PlusIcon';
import ConfirmationDialog from './ConfirmationDialog';
import { CloseIcon } from './icons/CloseIcon';
import { MoreVerticalIcon } from './icons/MoreVerticalIcon';
import AudioSpectrum from './AudioSpectrum';

interface CartwallProps {
    categories: CartwallCategory[];
    playingCartwallId: string | null;
    cartwallProgress: number;
    cartwallDuration: number;
    activeCategoryId: string | null;
    onSetActiveCategoryId: (id: string | null) => void;
    onPlayItem: (cartId: string, trackId: string) => void;
    onAssignItem: (categoryId: string, cartId: string, track: Track) => void;
    onClearItem: (categoryId: string, cartId: string) => void;
    onSetItemColor: (categoryId: string, cartId: string, color: string | undefined) => void;
    onAddCategory: (name: string) => void;
    onRenameCategory: (categoryId: string, newName: string) => void;
    onDeleteCategory: (categoryId: string) => void;
    onSetItemCount: (count: number) => void;
    mediaLibrary: Folder;
    duckingLevel: number;
    onSetDuckingLevel: (level: number) => void;
}

// --- Helper Functions ---
const PRESET_COLORS = [ '#3b82f6', '#ef4444', '#f97316', '#eab308', '#84cc16', '#14b8a6', '#8b5cf6', '#ec4899' ];

const findTrackInTree = (node: Folder, trackId: string): Track | null => {
    for (const child of node.children) {
        if (child.type !== 'folder' && child.id === trackId) {
            return child;
        }
        if (child.type === 'folder') {
            const found = findTrackInTree(child, trackId);
            if (found) return found;
        }
    }
    return null;
};

const getContrastingTextColor = (bgColor?: string): string => {
    if (!bgColor) return 'text-black dark:text-white';
    const color = (bgColor.charAt(0) === '#') ? bgColor.substring(1, 7) : bgColor;
    if (color.length < 6) return 'text-white';
    try {
        const r = parseInt(color.substring(0, 2), 16);
        const g = parseInt(color.substring(2, 4), 16);
        const b = parseInt(color.substring(4, 6), 16);
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        return luminance > 0.5 ? 'text-black' : 'text-white';
    } catch(e) {
        return 'text-white';
    }
};

const ColorPicker: React.FC<{ onSelect: (color: string | undefined) => void }> = ({ onSelect }) => (
    <div className="flex flex-col gap-2 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-md shadow-lg p-2">
        <div className="grid grid-cols-4 gap-2">
            {PRESET_COLORS.map(color => (
                <button
                    key={color}
                    onClick={() => onSelect(color)}
                    className="w-6 h-6 rounded-full transition-transform hover:scale-110"
                    style={{ backgroundColor: color }}
                    aria-label={`Select color ${color}`}
                />
            ))}
        </div>
        <button 
            onClick={() => onSelect(undefined)}
            className="w-full text-center text-xs py-1.5 bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 rounded-md"
        >
            Default
        </button>
    </div>
);

const CartItemMenu: React.FC<{
    onSetColor: () => void;
    onClear: () => void;
}> = ({ onSetColor, onClear }) => (
     <div className="flex flex-col bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-md shadow-lg py-1">
        <button onClick={onSetColor} className="w-full text-left px-3 py-1.5 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800">Set Color</button>
        <button onClick={onClear} className="w-full text-left px-3 py-1.5 text-sm text-red-600 dark:text-red-500 hover:bg-neutral-100 dark:hover:bg-neutral-800">Clear Slot</button>
    </div>
);


// --- Main Component ---
const Cartwall: React.FC<CartwallProps> = ({ categories, playingCartwallId, cartwallProgress, cartwallDuration, activeCategoryId, onSetActiveCategoryId, onPlayItem, onAssignItem, onClearItem, onSetItemColor, onAddCategory, onRenameCategory, onDeleteCategory, onSetItemCount, mediaLibrary, duckingLevel, onSetDuckingLevel }) => {
    const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
    const [dragOverId, setDragOverId] = useState<string | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
    const [menuState, setMenuState] = useState<{ cartId: string; ref: React.RefObject<HTMLButtonElement> } | null>(null);
    const [colorPickerState, setColorPickerState] = useState<{ cartId: string; ref: React.RefObject<HTMLButtonElement> } | null>(null);
    
    const popoverRef = useRef<HTMLDivElement>(null);

    // Click outside handler for popovers
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
                setMenuState(null);
                setColorPickerState(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const activeCategory = categories.find(c => c.id === activeCategoryId);
    const itemCount = activeCategory?.items.length || 0;

    const handleDrop = (e: React.DragEvent<HTMLDivElement>, cartId: string) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOverId(null);
        if (!activeCategoryId) return;
        try {
            const trackJson = e.dataTransfer.getData('application/json');
            if (trackJson) {
                const track = JSON.parse(trackJson) as Track;
                if (track && track.id && track.title) {
                    onAssignItem(activeCategoryId, cartId, track);
                }
            }
        } catch (error) {
            console.error("Failed to parse dropped track data:", error);
        }
    };
    
    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy';
    };

    const handleAddCategory = () => {
        const name = prompt("Enter new category name:", `Category ${categories.length + 1}`);
        if (name) {
            onAddCategory(name);
        }
    };
    
    const handleRename = (e: React.FocusEvent<HTMLInputElement> | React.KeyboardEvent<HTMLInputElement>) => {
        const input = e.currentTarget;
        if (editingCategoryId && input.value.trim()) {
            onRenameCategory(editingCategoryId, input.value.trim());
        }
        setEditingCategoryId(null);
    };
    
    const Popover: React.FC<{ children: React.ReactNode; targetRef: React.RefObject<HTMLElement> }> = ({ children, targetRef }) => {
        const [position, setPosition] = useState<{ top: string, right: string } | null>(null);
        
        useEffect(() => {
            if (targetRef.current) {
                const rect = targetRef.current.getBoundingClientRect();
                setPosition({ top: `${rect.bottom + 4}px`, right: `${window.innerWidth - rect.right}px` });
            }
        }, [targetRef]);
        
        if (!position) return null;
        
        return (
            <div
                ref={popoverRef}
                className="fixed z-50 w-32"
                style={position}
                onClick={(e) => e.stopPropagation()}
            >
                {children}
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full">
            <div className="flex-shrink-0 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 p-2 border-b border-neutral-200 dark:border-neutral-800">
                {/* Category Tabs */}
                <div className="flex items-center gap-1 overflow-x-auto pb-1 -mb-1">
                    {categories.map(cat => (
                        <div key={cat.id} className="relative group">
                             {editingCategoryId === cat.id ? (
                                <input
                                    type="text" defaultValue={cat.name} onBlur={handleRename}
                                    onKeyDown={e => e.key === 'Enter' && handleRename(e)} autoFocus
                                    className="px-3 py-1.5 text-sm font-medium bg-white dark:bg-black border border-neutral-400 dark:border-neutral-600 rounded-lg focus:ring-1 focus:ring-black dark:focus:ring-white outline-none"
                                />
                            ) : (
                                <button
                                    onClick={() => onSetActiveCategoryId(cat.id)}
                                    onDoubleClick={() => setEditingCategoryId(cat.id)}
                                    className={`px-3 py-1.5 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
                                        activeCategoryId === cat.id ? 'bg-black text-white dark:bg-white dark:text-black' : 'bg-neutral-200 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-300 hover:bg-neutral-300 dark:hover:bg-neutral-700'
                                    }`}
                                >
                                    {cat.name}
                                </button>
                            )}
                             {categories.length > 1 && (
                                <button
                                    onClick={() => setDeleteConfirm({ id: cat.id, name: cat.name })}
                                    className="absolute -top-1.5 -right-1.5 p-0.5 bg-neutral-500 dark:bg-neutral-600 hover:bg-red-600 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
                                    aria-label={`Delete category ${cat.name}`}
                                >
                                    <CloseIcon className="w-3 h-3" />
                                </button>
                            )}
                        </div>
                    ))}
                    <button onClick={handleAddCategory} className="p-1.5 bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700 rounded-lg text-neutral-500 dark:text-neutral-400 hover:text-black dark:hover:text-white transition-colors">
                        <PlusIcon className="w-5 h-5"/>
                    </button>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-4 flex-shrink-0">
                    <div className="flex items-center gap-2">
                        <label htmlFor="cartwall-ducking" className="text-sm font-medium text-neutral-500 dark:text-neutral-400">Ducking</label>
                        <input type="range" id="cartwall-ducking" value={duckingLevel} onChange={(e) => onSetDuckingLevel(parseFloat(e.target.value))} min="0" max="1" step="0.01" className="w-24 h-2 bg-neutral-300 dark:bg-neutral-700 rounded-lg appearance-none cursor-pointer"/>
                    </div>
                    <div className="flex items-center gap-2">
                        <label htmlFor="cartwall-slots" className="text-sm font-medium text-neutral-500 dark:text-neutral-400">Slots</label>
                        <input type="number" id="cartwall-slots" value={itemCount} onChange={(e) => { const val = parseInt(e.target.value, 10); if (!isNaN(val)) { onSetItemCount(val); } }} min="1" max="100" className="w-16 bg-white dark:bg-black border border-neutral-300 dark:border-neutral-700 rounded-md px-2 py-1 text-black dark:text-white text-center"/>
                    </div>
                </div>
            </div>

            {/* Grid */}
            <div className="flex-grow p-2 overflow-y-auto">
                <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
                    {activeCategory?.items.map(item => {
                        const track = item.trackId ? findTrackInTree(mediaLibrary, item.trackId) : null;
                        const isPlaying = item.id === playingCartwallId;
                        const isDragOver = dragOverId === item.id;
                        const textColor = getContrastingTextColor(item.color);
                        const progressPercentage = (cartwallProgress / (cartwallDuration || 1)) * 100;
                        const itemRef = useRef<HTMLButtonElement>(null);
                        
                        const baseStyle: React.CSSProperties = {};
                        if(track && item.color && !isPlaying) {
                            baseStyle.backgroundColor = item.color;
                        }
                        
                        return (
                            <li key={item.id}>
                                <div
                                    onDrop={(e) => handleDrop(e, item.id)}
                                    onDragOver={handleDragOver}
                                    onDragEnter={() => setDragOverId(item.id)}
                                    onDragLeave={() => setDragOverId(null)}
                                    onClick={() => track && onPlayItem(item.id, track.id)}
                                    style={baseStyle}
                                    className={`relative group flex flex-col justify-center p-3 rounded-lg transition-all duration-200 aspect-square text-center border-2 shadow-sm overflow-hidden cursor-pointer
                                        ${ isDragOver
                                            ? 'border-black dark:border-white bg-green-500/20 dark:bg-green-900/50'
                                            : isPlaying
                                                ? `bg-green-500 border-green-400 shadow-lg shadow-green-500/30 ${getContrastingTextColor('#22c55e')}`
                                                : track
                                                    ? item.color ? `border-transparent ${textColor}` : 'bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300/70 dark:hover:bg-neutral-700/70 border-neutral-300 dark:border-neutral-700'
                                                    : 'bg-neutral-100/50 dark:bg-neutral-900/50 hover:border-neutral-400 dark:hover:border-neutral-700 border-dashed border-neutral-300 dark:border-neutral-800'
                                        }
                                    `}
                                >
                                    {isPlaying && (
                                        <div className="absolute inset-0 bg-black/20 backdrop-blur-sm">
                                            <AudioSpectrum isPlaying={true} />
                                        </div>
                                    )}
                                    <div className="relative z-10 w-full overflow-hidden">
                                        {track ? (
                                            <>
                                                <p className={`text-sm font-semibold truncate w-full`}>
                                                    {track.title}
                                                </p>
                                                <p className={`text-xs truncate w-full ${item.color ? 'opacity-80' : 'text-neutral-600 dark:text-neutral-400'}`}>
                                                    {track.artist}
                                                </p>
                                            </>
                                        ) : (
                                            <div className="text-neutral-400 dark:text-neutral-600 group-hover:text-black dark:group-hover:text-white transition-colors">
                                                <PlusIcon className="w-8 h-8 mx-auto" />
                                            </div>
                                        )}
                                    </div>
                                    {track && (
                                        <button 
                                            ref={itemRef}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setColorPickerState(null);
                                                setMenuState(prev => prev?.cartId === item.id ? null : { cartId: item.id, ref: itemRef });
                                            }}
                                            className="absolute top-1 right-1 p-1 rounded-full text-current opacity-0 group-hover:opacity-70 hover:opacity-100 hover:bg-black/20 transition-all z-20"
                                        >
                                            <MoreVerticalIcon className="w-5 h-5"/>
                                        </button>
                                    )}
                                    {isPlaying && (
                                        <div className="absolute bottom-0 left-0 h-1 w-full bg-black/20">
                                            <div className="h-full bg-white/80" style={{ width: `${progressPercentage}%` }}></div>
                                        </div>
                                    )}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            </div>
            
            {menuState && (
                <Popover targetRef={menuState.ref}>
                    <CartItemMenu
                        onSetColor={() => {
                            setColorPickerState({ cartId: menuState.cartId, ref: menuState.ref });
                            setMenuState(null);
                        }}
                        onClear={() => {
                            if (activeCategoryId) onClearItem(activeCategoryId, menuState.cartId);
                            setMenuState(null);
                        }}
                    />
                </Popover>
            )}

            {colorPickerState && (
                <Popover targetRef={colorPickerState.ref}>
                    <ColorPicker onSelect={(color) => {
                        if (activeCategoryId) onSetItemColor(activeCategoryId, colorPickerState.cartId, color);
                        setColorPickerState(null);
                    }}/>
                </Popover>
            )}

            <ConfirmationDialog isOpen={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} onConfirm={() => { if (deleteConfirm) onDeleteCategory(deleteConfirm.id); setDeleteConfirm(null); }} title={`Delete Category "${deleteConfirm?.name}"`}>
                Are you sure you want to delete this category? This action cannot be undone.
            </ConfirmationDialog>
        </div>
    );
};

export default React.memo(Cartwall);