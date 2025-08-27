import React, { useRef, useState, useEffect } from 'react';
import { type PlayoutPolicy } from '../types';
import { DownloadIcon } from './icons/DownloadIcon';
import ConfirmationDialog from './ConfirmationDialog';
import { UploadIcon } from './icons/UploadIcon';
import { FolderIcon } from './icons/FolderIcon';
import { CloseIcon } from './icons/CloseIcon';
import { Toggle } from './Toggle';

interface SettingsProps {
    policy: PlayoutPolicy;
    onUpdatePolicy: (newPolicy: PlayoutPolicy) => void;
    currentUser: { email: string; nickname: string; } | null;
    onImportData: (data: any) => void;
    onExportData: () => void;
    isNowPlayingExportEnabled: boolean;
    onSetIsNowPlayingExportEnabled: (enabled: boolean) => void;
    onSetNowPlayingFile: () => Promise<void>;
    nowPlayingFileName: string | null;
    metadataFormat: string;
    onSetMetadataFormat: (format: string) => void;
    allTags: string[];
    isAutoBackupEnabled: boolean;
    onSetIsAutoBackupEnabled: (enabled: boolean) => void;
    isAutoBackupOnStartupEnabled: boolean;
    onSetIsAutoBackupOnStartupEnabled: (enabled: boolean) => void;
    autoBackupInterval: number;
    onSetAutoBackupInterval: (interval: number) => void;
    onSetAutoBackupFolder: () => Promise<void>;
    autoBackupFolderPath: string | null;
}

const TagInput: React.FC<{
    tags: string[];
    setTags: (tags: string[]) => void;
    allTags: string[];
}> = ({ tags, setTags, allTags }) => {
    const [inputValue, setInputValue] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    const handleAddTag = (tagToAdd: string) => {
        const trimmedTag = tagToAdd.trim();
        if (trimmedTag && !tags.includes(trimmedTag)) {
            setTags([...tags, trimmedTag]);
        }
        setInputValue('');
    };
    
    const handleRemoveTag = (tagToRemove: string) => {
        setTags(tags.filter(t => t !== tagToRemove));
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            handleAddTag(inputValue);
        }
    };
    
    const filteredSuggestions = allTags.filter(
        tag => tag.toLowerCase().includes(inputValue.toLowerCase()) && !tags.includes(tag)
    ).slice(0, 10); // Limit suggestions

    return (
        <div className="w-full bg-white dark:bg-black border border-neutral-300 dark:border-neutral-700 rounded-md p-2 flex flex-wrap gap-2 items-center" onClick={() => inputRef.current?.focus()}>
            {tags.map(tag => (
                <span key={tag} className="flex items-center gap-1 bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 text-sm font-medium px-2 py-1 rounded-full">
                    {tag}
                    <button onClick={() => handleRemoveTag(tag)} className="text-blue-500 hover:text-blue-700 dark:hover:text-blue-400">
                        <CloseIcon className="w-3 h-3"/>
                    </button>
                </span>
            ))}
            <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Add a tag..."
                list="autofill-tag-suggestions"
                className="flex-grow bg-transparent outline-none text-sm text-black dark:text-white"
            />
            <datalist id="autofill-tag-suggestions">
                {filteredSuggestions.map(tag => (
                    <option key={tag} value={tag} />
                ))}
            </datalist>
        </div>
    );
};

const Settings: React.FC<SettingsProps> = ({ 
    policy, 
    onUpdatePolicy, 
    currentUser, 
    onImportData,
    onExportData,
    isNowPlayingExportEnabled,
    onSetIsNowPlayingExportEnabled,
    onSetNowPlayingFile,
    nowPlayingFileName,
    metadataFormat,
    onSetMetadataFormat,
    allTags,
    isAutoBackupEnabled,
    onSetIsAutoBackupEnabled,
    isAutoBackupOnStartupEnabled,
    onSetIsAutoBackupOnStartupEnabled,
    autoBackupInterval,
    onSetAutoBackupInterval,
    onSetAutoBackupFolder,
    autoBackupFolderPath,
}) => {
    const importInputRef = useRef<HTMLInputElement>(null);
    const [importData, setImportData] = useState<any | null>(null);
    const [isImportConfirmOpen, setIsImportConfirmOpen] = useState(false);
    
    const handlePolicyChange = (key: keyof PlayoutPolicy, value: any) => {
        onUpdatePolicy({ ...policy, [key]: value });
    };

    const handleImportClick = () => {
        importInputRef.current?.click();
    };

    const handleFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const text = e.target?.result as string;
                const parsedData = JSON.parse(text);

                if (parsedData.type !== 'radiohost.cloud_backup' || !parsedData.data) {
                    throw new Error('Invalid backup file format.');
                }
                
                setImportData(parsedData.data);
                setIsImportConfirmOpen(true);

            } catch (error) {
                console.error("Error parsing import file:", error);
                alert(error instanceof Error ? error.message : "Could not read or parse the selected file.");
            }
        };
        reader.onerror = () => {
             alert('Failed to read the file.');
        };
        reader.readAsText(file);
        
        event.target.value = '';
    };

    const handleConfirmImport = () => {
        if (importData) {
            onImportData(importData);
        }
        setIsImportConfirmOpen(false);
        setImportData(null);
    };


    return (
        <div className="p-4 space-y-6 text-black dark:text-white">
            <input type="file" ref={importInputRef} onChange={handleFileSelected} className="hidden" accept=".json" />
            
            <div>
                <h2 className="text-xl font-semibold">Playout Policy</h2>
                <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
                    Configure rules to prevent songs and artists from repeating too closely together when generating playlists.
                </p>
            </div>

            <div className="space-y-6">
                <div className="space-y-3">
                    <label htmlFor="artist-separation" className="flex justify-between text-sm font-medium">
                        <span>Artist Separation</span>
                        <span className="font-mono">{policy.artistSeparation} min</span>
                    </label>
                    <input
                        id="artist-separation" type="range" min="0" max="240" step="5"
                        value={policy.artistSeparation}
                        onChange={(e) => handlePolicyChange('artistSeparation', parseInt(e.target.value, 10))}
                        className="w-full h-2 bg-neutral-200 dark:bg-neutral-700 rounded-lg appearance-none cursor-pointer"
                    />
                </div>

                <div className="space-y-3">
                    <label htmlFor="title-separation" className="flex justify-between text-sm font-medium">
                        <span>Song Title Separation</span>
                        <span className="font-mono">{policy.titleSeparation} min</span>
                    </label>
                    <input
                        id="title-separation" type="range" min="0" max="480" step="10"
                        value={policy.titleSeparation}
                        onChange={(e) => handlePolicyChange('titleSeparation', parseInt(e.target.value, 10))}
                        className="w-full h-2 bg-neutral-200 dark:bg-neutral-700 rounded-lg appearance-none cursor-pointer"
                    />
                </div>
            </div>

            <hr className="border-neutral-200 dark:border-neutral-800" />

            <div>
                <h2 className="text-xl font-semibold">Automation</h2>
                <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
                    Enable smart features to automate your broadcast.
                </p>
            </div>
            
             <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <label htmlFor="remove-played" className="text-sm font-medium block cursor-pointer">Remove Played Tracks</label>
                        <p className="text-xs text-neutral-500">Automatically remove tracks from the playlist after they finish playing.</p>
                    </div>
                    <Toggle id="remove-played" checked={policy.removePlayedTracks} onChange={(v) => handlePolicyChange('removePlayedTracks', v)} />
                </div>

                <div className="flex items-center justify-between">
                    <div>
                        <label htmlFor="autofill-playlist" className="text-sm font-medium block cursor-pointer">Auto-fill Playlist</label>
                        <p className="text-xs text-neutral-500">Automatically add songs to fill the playlist.</p>
                    </div>
                    <Toggle id="autofill-playlist" checked={policy.autoFillPlaylist} onChange={(v) => handlePolicyChange('autoFillPlaylist', v)} />
                </div>
                 
                 {policy.autoFillPlaylist && (
                    <div className="space-y-6 pl-4 pt-4 mt-4 border-l-2 border-neutral-200 dark:border-neutral-800">
                        <div>
                            <label className="block text-sm font-medium">Auto-fill Tags</label>
                            <p className="text-xs text-neutral-500 mb-2">Tags to use when auto-filling. Defaults to 'auto'.</p>
                            <TagInput
                                tags={policy.autoFillTags || []}
                                setTags={(newTags) => handlePolicyChange('autoFillTags', newTags)}
                                allTags={allTags}
                            />
                        </div>
                        <div className="space-y-3">
                            <label htmlFor="autofill-lookahead" className="flex justify-between text-sm font-medium">
                                <span>Auto-fill Trigger Time</span>
                                <span className="font-mono">{policy.autoFillLookahead} min</span>
                            </label>
                            <p className="text-xs text-neutral-500">How many minutes before the next hour to generate a playlist if no clock is scheduled. Also acts as a safety buffer if the playlist is about to run out of music.</p>
                            <input
                                id="autofill-lookahead" type="range" min="5" max="60" step="5"
                                value={policy.autoFillLookahead}
                                onChange={(e) => handlePolicyChange('autoFillLookahead', parseInt(e.target.value, 10))}
                                className="w-full h-2 bg-neutral-200 dark:bg-neutral-700 rounded-lg appearance-none cursor-pointer"
                            />
                        </div>
                    </div>
                )}
                                  
                 <hr className="border-neutral-200 dark:border-neutral-800" />

                 <div className="flex items-center justify-between">
                    <div>
                        <label htmlFor="crossfade-enabled" className="text-sm font-medium block cursor-pointer">Enable Crossfade</label>
                        <p className="text-xs text-neutral-500">Smoothly transition between tracks.</p>
                    </div>
                    <Toggle id="crossfade-enabled" checked={policy.crossfadeEnabled} onChange={(v) => handlePolicyChange('crossfadeEnabled', v)} />
                </div>

                {policy.crossfadeEnabled && (
                    <div className="space-y-3 pt-2">
                        <label htmlFor="crossfade-duration" className="flex justify-between text-sm font-medium">
                            <span>Crossfade Duration</span>
                            <span className="font-mono">{policy.crossfadeDuration} s</span>
                        </label>
                        <input
                            id="crossfade-duration"
                            type="range"
                            min="1"
                            max="10"
                            step="1"
                            value={policy.crossfadeDuration}
                            onChange={(e) => handlePolicyChange('crossfadeDuration', parseInt(e.target.value, 10))}
                            className="w-full h-2 bg-neutral-200 dark:bg-neutral-700 rounded-lg appearance-none cursor-pointer"
                        />
                    </div>
                )}
             </div>

             <hr className="border-neutral-200 dark:border-neutral-800" />
            
            <div>
                <h2 className="text-xl font-semibold">Now Playing Export</h2>
                <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
                    Automatically export the current track's artist and title to a local text file for use with other broadcasting software.
                </p>
            </div>

            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <label htmlFor="nowplaying-export-enabled" className="text-sm font-medium block cursor-pointer">Enable Export</label>
                        <p className="text-xs text-neutral-500">Continuously update the selected file.</p>
                    </div>
                    <Toggle id="nowplaying-export-enabled" checked={isNowPlayingExportEnabled} onChange={onSetIsNowPlayingExportEnabled} />
                </div>
                
                {isNowPlayingExportEnabled && (
                    <div className="space-y-4">
                        <div className="flex items-center gap-4 p-3 bg-neutral-200 dark:bg-neutral-800/50 rounded-md">
                            <button
                                onClick={onSetNowPlayingFile}
                                className="inline-flex items-center justify-center gap-2 px-4 py-2 border border-neutral-300 dark:border-neutral-600 text-sm font-medium rounded-md shadow-sm bg-white dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700"
                            >
                                <UploadIcon className="w-5 h-5" />
                                Set Export File
                            </button>
                            <div className="text-sm text-neutral-600 dark:text-neutral-400">
                                <span className="font-medium text-neutral-800 dark:text-neutral-300">Status:</span> 
                                {nowPlayingFileName 
                                    ? <span className="font-mono text-green-600 dark:text-green-400 ml-2">{nowPlayingFileName}</span>
                                    : <span className="ml-2">No file selected.</span>
                                }
                            </div>
                        </div>
                        <div>
                            <label htmlFor="metadata-format" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                                Metadata Format
                            </label>
                            <input
                                id="metadata-format"
                                type="text"
                                value={metadataFormat}
                                onChange={e => onSetMetadataFormat(e.target.value)}
                                className="w-full bg-white dark:bg-black border border-neutral-300 dark:border-neutral-700 rounded-md px-3 py-2 text-black dark:text-white font-mono"
                            />
                            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                                Use <code className="bg-neutral-200 dark:bg-neutral-700 p-0.5 rounded">%artist%</code> and <code className="bg-neutral-200 dark:bg-neutral-700 p-0.5 rounded">%title%</code> as placeholders.
                            </p>
                        </div>
                    </div>
                )}
            </div>

            <hr className="border-neutral-200 dark:border-neutral-800" />

            <div>
                <h2 className="text-xl font-semibold">Data Management</h2>
                <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
                    Export or import all your settings, library, playlists, and schedules. Keep a backup or use it to migrate to another device.
                </p>
            </div>

            <div className="flex items-center gap-4">
                 <button
                    onClick={onExportData}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-black bg-white hover:bg-neutral-200"
                >
                    <DownloadIcon className="w-5 h-5" />
                    Export All Data
                </button>
                 <button
                    onClick={handleImportClick}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 border border-neutral-300 dark:border-neutral-600 text-sm font-medium rounded-md shadow-sm bg-white dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700"
                >
                    <UploadIcon className="w-5 h-5" />
                    Import Data
                </button>
            </div>
            
            <hr className="border-neutral-200 dark:border-neutral-800" />

             <div>
                <h2 className="text-xl font-semibold">Automatic Backups</h2>
                <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
                    Automatically save a backup of your data to a local folder. Requires browser permission.
                </p>
            </div>
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <label htmlFor="autobackup-enabled" className="text-sm font-medium block cursor-pointer">Enable Automatic Interval Backups</label>
                        <p className="text-xs text-neutral-500">Periodically save a full backup file.</p>
                    </div>
                    <Toggle id="autobackup-enabled" checked={isAutoBackupEnabled} onChange={onSetIsAutoBackupEnabled} />
                </div>
                 <div className="flex items-center justify-between">
                    <div>
                        <label htmlFor="autobackup-on-startup" className="text-sm font-medium block cursor-pointer">Backup on Startup</label>
                        <p className="text-xs text-neutral-500">Create a backup every time the application starts.</p>
                    </div>
                    <Toggle id="autobackup-on-startup" checked={isAutoBackupOnStartupEnabled} onChange={onSetIsAutoBackupOnStartupEnabled} />
                </div>

                {(isAutoBackupEnabled || isAutoBackupOnStartupEnabled) && (
                    <div className="space-y-6 pl-4 pt-4 mt-4 border-l-2 border-neutral-200 dark:border-neutral-800">
                        {isAutoBackupEnabled && (
                            <div className="space-y-3">
                                <label htmlFor="autobackup-interval" className="flex justify-between text-sm font-medium">
                                    <span>Backup Frequency</span>
                                    <span className="font-mono">{autoBackupInterval > 0 ? `${autoBackupInterval} hour${autoBackupInterval !== 1 ? 's' : ''}` : 'Disabled'}</span>
                                </label>
                                <input
                                    id="autobackup-interval"
                                    type="range" min="0" max="24" step="1"
                                    value={autoBackupInterval}
                                    onChange={(e) => onSetAutoBackupInterval(parseInt(e.target.value, 10))}
                                    className="w-full h-2 bg-neutral-200 dark:bg-neutral-700 rounded-lg appearance-none cursor-pointer"
                                />
                            </div>
                        )}
                        <div>
                            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Backup Folder</label>
                            <div className="flex items-center gap-4 p-3 bg-neutral-200 dark:bg-neutral-800/50 rounded-md">
                                <button
                                    onClick={onSetAutoBackupFolder}
                                    className="inline-flex items-center justify-center gap-2 px-4 py-2 border border-neutral-300 dark:border-neutral-600 text-sm font-medium rounded-md shadow-sm bg-white dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700"
                                >
                                    <FolderIcon className="w-5 h-5" />
                                    Select Folder
                                </button>
                                <div className="text-sm text-neutral-600 dark:text-neutral-400 truncate">
                                    {autoBackupFolderPath
                                        ? <span className="font-mono">{autoBackupFolderPath}</span>
                                        : <span>No folder selected.</span>
                                    }
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <ConfirmationDialog
                isOpen={isImportConfirmOpen}
                onClose={() => setIsImportConfirmOpen(false)}
                onConfirm={handleConfirmImport}
                title="Import Data"
                confirmText="Import and Overwrite"
                confirmButtonClass="bg-yellow-600 hover:bg-yellow-500 text-black"
            >
                Are you sure you want to import data from this file? 
                <strong className="block mt-2 text-yellow-600 dark:text-yellow-400">This will overwrite your current library, playlists, schedule, and settings for this user.</strong> This action cannot be undone.
            </ConfirmationDialog>
        </div>
    );
};

export default React.memo(Settings);