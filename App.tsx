





import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { type Track, TrackType, type Folder, type LibraryItem, type ScheduledBlock, type PlayoutPolicy, type PlayoutHistoryEntry, type SequenceItem, type TimeFixMarker, type CartwallItem, type CartwallCategory, type ClockStartMarker, type RandomFromFolderMarker, type AutoFillMarker, type AudioBus, type MixerConfig, type AudioSourceId, type AudioBusId, type RandomFromTagMarker, type HourBoundaryMarker, type TimelineItem } from './types';
import Header from './components/Header';
import MediaLibrary from './components/MediaLibrary';
import Playlist from './components/Playlist';
import Auth from './components/Auth';
import RemoteStudio, { type RemoteStudioRef } from './components/RemoteStudio';
import RotationScheduler from './components/RotationScheduler';
import { generatePlaylistFromFolder, generatePlaylistFromTags } from './services/playlistService';
import { getTrack as getTrackFromDB, deleteTrack as deleteTrackFromDB, setConfig, getConfig } from './services/dbService';
import Settings from './components/Settings';
import { SettingsIcon } from './components/icons/SettingsIcon';
import { ClockIcon } from './components/icons/ClockIcon';
import Cartwall from './components/Cartwall';
import { GridIcon } from './components/icons/GridIcon';
import Resizer from './components/Resizer';
import ConfirmationDialog from './components/ConfirmationDialog';
import MetadataSettingsModal from './components/MetadataSettingsModal';
import { ChevronUpIcon } from './components/icons/ChevronUpIcon';
import { ChevronDownIcon } from './components/icons/ChevronDownIcon';
import { ChevronLeftIcon } from './components/icons/ChevronLeftIcon';
import { ChevronRightIcon } from './components/icons/ChevronRightIcon';
import AudioMixer from './components/AudioMixer';
import { MixerIcon } from './components/icons/MixerIcon';
import TrackMetadataModal from './components/TrackMetadataModal';


const CURRENT_USER_SESSION_KEY = 'radiohost_currentUserEmail';
const USERS_STORAGE_KEY = 'radiohost_users';

// User-specific keys
const USER_LIBRARIES_STORAGE_KEY = 'radiohost_userLibraries';
const USER_SETTINGS_KEY = 'radiohost_userSettings';
const USER_PLAYLISTS_STORAGE_KEY = 'radiohost_userPlaylists';
const USER_SCHEDULES_STORAGE_KEY = 'radiohost_userSchedules';
const USER_CARTWALL_STORAGE_KEY = 'radiohost_userCartwall';
const USER_PLAYBACK_STATE_KEY = 'radiohost_userPlaybackState';
const USER_AUDIO_CONFIG_KEY = 'radiohost_userAudioConfig';

// Guest-specific keys
const GUEST_LIBRARY_KEY = 'radiohost_guestLibrary';
const GUEST_SETTINGS_KEY = 'radiohost_guestSettings';
const GUEST_PLAYLIST_KEY = 'radiohost_guestPlaylist';
const GUEST_SCHEDULE_KEY = 'radiohost_guestSchedule';
const GUEST_CARTWALL_KEY = 'radiohost_guestCartwall';
const GUEST_PLAYBACK_STATE_KEY = 'radiohost_guestPlaybackState';
const GUEST_AUDIO_CONFIG_KEY = 'radiohost_guestAudioConfig';


const createInitialLibrary = (): Folder => ({
    id: 'root',
    name: 'Media Library',
    type: 'folder',
    children: [],
});

const createInitialCartwall = (itemCount: number = 16): CartwallCategory[] => {
    return [{
        id: `cat-${Date.now()}`,
        name: 'Default',
        items: Array.from({ length: itemCount }, (_, i) => ({
            id: `cart-default-${i}`,
            trackId: null,
        }))
    }];
};

const defaultPlayoutPolicy: PlayoutPolicy = {
    artistSeparation: 60, // 60 minutes
    titleSeparation: 120, // 120 minutes
    autoFillPlaylist: true,
    autoFillTags: ['auto'],
    autoFillLookahead: 15, // in minutes
    removePlayedTracks: false,
    normalizationEnabled: false,
    normalizationTargetDb: -24,
    equalizerEnabled: false,
    equalizerBands: {
        bass: 0,
        mid: 0,
        treble: 0,
    },
    crossfadeEnabled: false,
    crossfadeDuration: 2,
    micDuckingLevel: 0.2,
    micDuckingFadeDuration: 0.5, // 500ms fade for smoothness
    pflDuckingLevel: 0.1,
};

const initialBuses: AudioBus[] = [
    { id: 'main', name: 'Main Output', outputDeviceId: 'default', gain: 1, muted: false },
    { id: 'monitor', name: 'Monitor/PFL', outputDeviceId: 'default', gain: 1, muted: false },
];

const initialMixerConfig: MixerConfig = {
    mainPlayer: { gain: 1, muted: false, sends: { main: { enabled: true, gain: 1 }, monitor: { enabled: true, gain: 1 } } },
    cartwall: { gain: 1, muted: false, sends: { main: { enabled: true, gain: 1 }, monitor: { enabled: true, gain: 1 } } },
    mic: { gain: 1, muted: false, sends: { main: { enabled: false, gain: 1 }, monitor: { enabled: false, gain: 1 } } },
    pfl: { gain: 1, muted: false, sends: { main: { enabled: false, gain: 1 }, monitor: { enabled: true, gain: 1 } } },
};


const getProminentColors = (img: HTMLImageElement): string[] => {
    const canvas = document.createElement('canvas');
    const MAX_WIDTH = 100; // Resize for faster processing
    const scale = MAX_WIDTH / img.width;
    canvas.width = MAX_WIDTH;
    canvas.height = img.height * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) return [];
    
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    
    const colorCounts: { [key: string]: number } = {};
    
    for (let i = 0; i < imageData.length; i += 4 * 4) { // Sample every 4th pixel for performance
        const r = imageData[i];
        const g = imageData[i + 1];
        const b = imageData[i + 2];
        const a = imageData[i + 3];

        if (a < 128) continue; // Skip transparent/semi-transparent pixels

        // Simple binning to group similar colors (reduce 256^3 colors to 16^3)
        const r_bin = Math.round(r / 16) * 16;
        const g_bin = Math.round(g / 16) * 16;
        const b_bin = Math.round(b / 16) * 16;
        const key = `${r_bin},${g_bin},${b_bin}`;

        colorCounts[key] = (colorCounts[key] || 0) + 1;
    }

    const sortedColors = Object.keys(colorCounts).sort((a, b) => colorCounts[b] - colorCounts[a]);

    // Filter out colors that are too dark, too light, or desaturated (greys)
    const filteredColors = sortedColors.filter(key => {
        const [r, g, b] = key.split(',').map(Number);
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        
        // Luminance check (filter out near-black and near-white)
        if ((r + g + b) / 3 < 25 || (r + g + b) / 3 > 230) return false;
        
        // Saturation check (filter out greys)
        if (max - min < 15) return false;
        
        return true;
    });

    const prominentColors = filteredColors.slice(0, 3).map(key => `rgb(${key})`);

    // Fallback if no suitable colors are found
    if (prominentColors.length < 2) return ['#3f3f46', '#18181b'];
    
    return prominentColors;
};

// --- Recursive Helper Functions for Immutable Tree Updates ---

const addItemToTree = (node: Folder, parentId: string, itemToAdd: LibraryItem): Folder => {
    if (node.id === parentId) {
        return { ...node, children: [...node.children, itemToAdd] };
    }
    return {
        ...node,
        children: node.children.map(child =>
            child.type === 'folder' ? addItemToTree(child, parentId, itemToAdd) : child
        ),
    };
};

const addMultipleItemsToTree = (node: Folder, parentId: string, itemsToAdd: LibraryItem[]): Folder => {
    if (node.id === parentId) {
        return { ...node, children: [...node.children, ...itemsToAdd] };
    }
    return {
        ...node,
        children: node.children.map(child =>
            child.type === 'folder' ? addMultipleItemsToTree(child, parentId, itemsToAdd) : child
        ),
    };
};

const removeItemFromTree = (node: Folder, itemIdToRemove: string): Folder => {
    const newChildren = node.children.filter(child => child.id !== itemIdToRemove);
    return {
        ...node,
        children: newChildren.map(child =>
            child.type === 'folder' ? removeItemFromTree(child, itemIdToRemove) : child
        ),
    };
};

const removeItemsFromTree = (node: Folder, itemIdsToRemove: Set<string>): Folder => {
    const newChildren = node.children
        .filter(child => !itemIdsToRemove.has(child.id))
        .map(child =>
            child.type === 'folder' ? removeItemsFromTree(child, itemIdsToRemove) : child
        );
    return { ...node, children: newChildren };
};

const updateFolderInTree = (node: Folder, folderId: string, updateFn: (folder: Folder) => Folder): Folder => {
    let updatedNode = node;
    if (node.id === folderId) {
        updatedNode = updateFn(node);
    }
    return {
        ...updatedNode,
        children: updatedNode.children.map(child =>
            child.type === 'folder' ? updateFolderInTree(child, folderId, updateFn) : child
        ),
    };
};

const updateTrackInTree = (node: Folder, trackId: string, updateFn: (track: Track) => Track): Folder => {
    return {
        ...node,
        children: node.children.map(child => {
            if (child.type === 'folder') {
                return updateTrackInTree(child, trackId, updateFn);
            }
            if (child.id === trackId) {
                return updateFn(child);
            }
            return child;
        }),
    };
};


const collectAllChildTracks = (item: LibraryItem): Track[] => {
    if (item.type !== 'folder') {
        return [item as Track];
    }
    let tracks: Track[] = [];
    for (const child of item.children) {
        tracks = tracks.concat(collectAllChildTracks(child));
    }
    return tracks;
};


const findAndRemoveItem = (node: Folder, itemId: string): { updatedNode: Folder; foundItem: LibraryItem | null } => {
    let foundItem: LibraryItem | null = null;
    
    const children = node.children.filter(child => {
        if (child.id === itemId) {
            foundItem = child;
            return false;
        }
        return true;
    });

    if (foundItem) {
        return { updatedNode: { ...node, children }, foundItem };
    }

    for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (child.type === 'folder') {
            const result = findAndRemoveItem(child, itemId);
            if (result.foundItem) {
                children[i] = result.updatedNode;
                return { updatedNode: { ...node, children }, foundItem: result.foundItem };
            }
        }
    }

    return { updatedNode: node, foundItem: null };
};

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

const findFolderInTree = (node: Folder, folderId: string): Folder | null => {
    if (node.id === folderId) {
        return node;
    }
    for (const child of node.children) {
        if (child.type === 'folder') {
            const found = findFolderInTree(child, folderId);
            if (found) return found;
        }
    }
    return null;
};

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

const getSuppressionSettings = (trackId: string, library: Folder): { enabled: boolean; customText?: string } | null => {
    const path = findTrackAndPath(library, trackId, []);
    if (!path) return null;

    // Find the deepest setting in the hierarchy (most specific) by iterating backwards.
    for (let i = path.length - 1; i >= 0; i--) {
        const folder = path[i];
        if (folder.suppressMetadata?.enabled) {
            return folder.suppressMetadata;
        }
    }

    return null;
};


const getAllFolders = (node: Folder): { id: string; name: string }[] => {
    let folders = [{ id: node.id, name: node.name }];
    for (const child of node.children) {
        if (child.type === 'folder') {
            folders = folders.concat(getAllFolders(child));
        }
    }
    return folders;
};

const getAllTracks = (node: Folder): Track[] => {
    let tracks: Track[] = [];
    for (const child of node.children) {
        if (child.type === 'folder') {
            tracks = tracks.concat(getAllTracks(child));
        } else {
            tracks.push(child);
        }
    }
    return tracks;
};

const getAllTags = (node: Folder): string[] => {
    const tagSet = new Set<string>();
    const traverse = (item: LibraryItem) => {
        if (item.tags) {
            item.tags.forEach(tag => tagSet.add(tag));
        }
        if (item.type === 'folder') {
            item.children.forEach(traverse);
        }
    };
    traverse(node);
    return Array.from(tagSet).sort();
};

function shuffleArray<T>(array: T[]): T[] {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}

/**
 * Finds the most specific scheduled block for a given hour and date.
 * Priority: Day of Month > Day of Week > Default.
 */
const findBlockForHour = (schedule: ScheduledBlock[], hour: number, date: Date): ScheduledBlock | undefined => {
    const dayOfMonth = date.getDate();
    const dayOfWeek = date.getDay();

    const blocksForHour = schedule.filter(b => b.hour === hour);

    const dayOfMonthMatch = blocksForHour.find(b => b.daysOfMonth?.includes(dayOfMonth));
    if (dayOfMonthMatch) return dayOfMonthMatch;

    const dayOfWeekMatch = blocksForHour.find(b => b.daysOfWeek?.includes(dayOfWeek));
    if (dayOfWeekMatch) return dayOfWeekMatch;

    const defaultMatch = blocksForHour.find(b => !b.daysOfWeek && !b.daysOfMonth);
    return defaultMatch;
};


/**
 * Filters a list of tracks based on artist and title separation rules.
 */
const applySeparationPolicy = (tracks: Track[], policy: PlayoutPolicy, history: PlayoutHistoryEntry[]): Track[] => {
    if (!history || history.length === 0) return tracks;
    
    const now = Date.now();
    const recentHistory = history.slice(-50); // Optimization: only check recent history

    const availableTracks = tracks.filter(track => {
        // Don't filter non-song items
        if (track.type !== TrackType.SONG) return true;
        
        const titleViolation = recentHistory.some(entry =>
            entry.title.toLowerCase() === track.title.toLowerCase() &&
            now - entry.playedAt < policy.titleSeparation * 60 * 1000
        );
        if (titleViolation) return false;

        const artistViolation = recentHistory.some(entry =>
            entry.artist && track.artist && entry.artist.toLowerCase() === track.artist.toLowerCase() &&
            now - entry.playedAt < policy.artistSeparation * 60 * 1000
        );
        if (artistViolation) return false;

        return true;
    });

    // If filtering removes all tracks, return the original unfiltered list to prevent empty playlists
    return availableTracks.length > 0 ? availableTracks : tracks;
};


// --- App Component ---

const AppInternal: React.FC = () => {
    const [currentUser, setCurrentUser] = useState<{ email: string; nickname: string; } | null>(null);
    const [mediaLibrary, setMediaLibrary] = useState<Folder>(createInitialLibrary());
    const [playlist, setPlaylist] = useState<SequenceItem[]>([]);
    const [cartwallCategories, setCartwallCategories] = useState<CartwallCategory[]>(createInitialCartwall());
    const [activeCartwallCategoryId, setActiveCartwallCategoryId] = useState<string | null>(null);
    const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
    const [currentPlayingItemId, setCurrentPlayingItemId] = useState<string | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isAutoplayEnabled, setIsAutoplayEnabled] = useState(true); // This is the old state, now used for "play next" logic
    const [isPresenterLive, setIsPresenterLive] = useState(false);
    const [trackProgress, setTrackProgress] = useState(0);
    const [schedule, setSchedule] = useState<ScheduledBlock[]>([]);
    const [activeRightColumnTab, setActiveRightColumnTab] = useState<'scheduler' | 'cartwall' | 'mixer' | 'settings'>('cartwall');
    const [isMicPanelCollapsed, setIsMicPanelCollapsed] = useState(false);
    const [stopAfterTrackId, setStopAfterTrackId] = useState<string | null>(null);
    const [playoutPolicy, setPlayoutPolicy] = useState<PlayoutPolicy>(defaultPlayoutPolicy);
    const [playoutHistory, setPlayoutHistory] = useState<PlayoutHistoryEntry[]>([]);
    const [logoSrc, setLogoSrc] = useState<string | null>(null);
    const [headerGradient, setHeaderGradient] = useState<string | null>(null);
    const [availableAudioDevices, setAvailableAudioDevices] = useState<MediaDeviceInfo[]>([]);
    const [isNowPlayingExportEnabled, setIsNowPlayingExportEnabled] = useState(false);
    const [nowPlayingFileName, setNowPlayingFileName] = useState<string | null>(null);
    const [metadataFormat, setMetadataFormat] = useState<string>('%artist% - %title%');
    const [playingCartwallId, setPlayingCartwallId] = useState<string | null>(null);
    const [cartwallTrackProgress, setCartwallTrackProgress] = useState(0);
    const [cartwallTrackDuration, setCartwallTrackDuration] = useState(0);
    const [playlistLoadRequest, setPlaylistLoadRequest] = useState<{ hour: number; generatedPlaylist: SequenceItem[] } | null>(null);
    const [editingMetadataFolder, setEditingMetadataFolder] = useState<Folder | null>(null);
    const [editingTrack, setEditingTrack] = useState<Track | null>(null);
    const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false);
    const [isLibraryCollapsed, setIsLibraryCollapsed] = useState(false);
    const [skippedItemIds, setSkippedItemIds] = useState<Set<string>>(new Set());
    const [autoFilledItemIds, setAutoFilledItemIds] = useState<Set<string>>(new Set());

    
    // --- PFL (Pre-Fade Listen) State ---
    const [pflTrackId, setPflTrackId] = useState<string | null>(null);
    const [isPflPlaying, setIsPflPlaying] = useState(false);
    const [pflProgress, setPflProgress] = useState(0);
    
    // --- Auto Backup State ---
    const [isAutoBackupEnabled, setIsAutoBackupEnabled] = useState(false);
    const [isAutoBackupOnStartupEnabled, setIsAutoBackupOnStartupEnabled] = useState(false);
    const [autoBackupInterval, setAutoBackupInterval] = useState<number>(24);
    const [autoBackupFolderPath, setAutoBackupFolderPath] = useState<string | null>(null);
     
    // --- Dual Audio Player Refs for seamless playback ---
    const playerARef = useRef<HTMLAudioElement>(null);
    const playerBRef = useRef<HTMLAudioElement>(null);
    const [activePlayer, setActivePlayer] = useState<'A' | 'B'>('A');
    const playerALoadedIdRef = useRef<string | null>(null);
    const playerBLoadedIdRef = useRef<string | null>(null);
    const playerAUrlRef = useRef<string | null>(null);
    const playerBUrlRef = useRef<string | null>(null);

    const pflAudioRef = useRef<HTMLAudioElement>(null);
    const pflAudioUrlRef = useRef<string | null>(null);
    const cartwallAudioRef = useRef<HTMLAudioElement>(null);
    const cartwallAudioUrlRef = useRef<string | null>(null);
    const remoteStudioRef = useRef<RemoteStudioRef>(null);
    const isCrossfadingRef = useRef(false);
    const lastTriggeredMarkerIdRef = useRef<string | null>(null);
    const nowPlayingFileHandleRef = useRef<FileSystemFileHandle | null>(null);
    const autoBackupFolderHandleRef = useRef<FileSystemDirectoryHandle | null>(null);
    const audioBufferRef = useRef<Map<string, Blob>>(new Map());
    
    // --- NEW Audio Mixer State ---
    const [audioBuses, setAudioBuses] = useState<AudioBus[]>(initialBuses);
    const [mixerConfig, setMixerConfig] = useState<MixerConfig>(initialMixerConfig);
    const [audioLevels, setAudioLevels] = useState<Partial<Record<AudioSourceId | AudioBusId, number>>>({});

    const mainBusAudioRef = useRef<HTMLAudioElement>(null);
    const monitorBusAudioRef = useRef<HTMLAudioElement>(null);

    // Refs to provide stable functions to useEffects
    const currentUserRef = useRef(currentUser);
    currentUserRef.current = currentUser;
    const playlistRef = useRef(playlist);
    playlistRef.current = playlist;
    const currentTrackIndexRef = useRef(currentTrackIndex);
    currentTrackIndexRef.current = currentTrackIndex;
    const currentPlayingItemIdRef = useRef(currentPlayingItemId);
    currentPlayingItemIdRef.current = currentPlayingItemId;
    const trackProgressRef = useRef(trackProgress);
    trackProgressRef.current = trackProgress;
    const isPlayingRef = useRef(isPlaying);
    isPlayingRef.current = isPlaying;
    const scheduleRef = useRef(schedule);
    scheduleRef.current = schedule;
    const mediaLibraryRef = useRef(mediaLibrary);
    mediaLibraryRef.current = mediaLibrary;
    const playoutPolicyRef = useRef(playoutPolicy);
    playoutPolicyRef.current = playoutPolicy;
    const playoutHistoryRef = useRef(playoutHistory);
    playoutHistoryRef.current = playoutHistory;
    const isAutoplayEnabledRef = useRef(isAutoplayEnabled);
    isAutoplayEnabledRef.current = isAutoplayEnabled;
    const isAutoBackupEnabledRef = useRef(isAutoBackupEnabled);
    isAutoBackupEnabledRef.current = isAutoBackupEnabled;
    const isAutoBackupOnStartupEnabledRef = useRef(isAutoBackupOnStartupEnabled);
    isAutoBackupOnStartupEnabledRef.current = isAutoBackupOnStartupEnabled;
    const autoBackupIntervalRef = useRef(autoBackupInterval);
    autoBackupIntervalRef.current = autoBackupInterval;
    const cartwallCategoriesRef = useRef(cartwallCategories);
    cartwallCategoriesRef.current = cartwallCategories;
    const stopAfterTrackIdRef = useRef(stopAfterTrackId);
    stopAfterTrackIdRef.current = stopAfterTrackId;
    const skippedItemIdsRef = useRef(skippedItemIds);
    skippedItemIdsRef.current = skippedItemIds;
    const autoFilledItemIdsRef = useRef(autoFilledItemIds);
    autoFilledItemIdsRef.current = autoFilledItemIds;


    // --- AUDIO WORKLET ---
    // This code runs in a separate, high-priority audio thread to prevent UI lag from affecting playback.
    const mixerWorkletCode = `
    class MixerProcessor extends AudioWorkletProcessor {
      static get parameterDescriptors() {
        return [
          { name: 'gainA', defaultValue: 1.0, automationRate: 'a-rate' },
          { name: 'gainB', defaultValue: 0.0, automationRate: 'a-rate' },
        ];
      }

      process(inputs, outputs, parameters) {
        const output = outputs[0];
        const inputA = inputs[0];
        const inputB = inputs[1];
        const gainA = parameters.gainA;
        const gainB = parameters.gainB;

        // Don't process if no inputs are connected
        if (inputA.length === 0 && inputB.length === 0) {
          return true;
        }

        for (let channel = 0; channel < output.length; ++channel) {
          const outputChannel = output[channel];
          const inputAChannel = inputA.length > channel ? inputA[channel] : undefined;
          const inputBChannel = inputB.length > channel ? inputB[channel] : undefined;
          const gainALen = gainA.length;
          const gainBLen = gainB.length;

          for (let i = 0; i < outputChannel.length; ++i) {
            const sampleA = inputAChannel ? inputAChannel[i] * gainA[gainALen > 1 ? i : 0] : 0;
            const sampleB = inputBChannel ? inputBChannel[i] * gainB[gainBLen > 1 ? i : 0] : 0;
            outputChannel[i] = sampleA + sampleB;
          }
        }
        return true;
      }
    }
    registerProcessor('mixer-processor', MixerProcessor);
    `;

    type AdvancedAudioGraph = {
        context: AudioContext | null;
        sources: {
            playerA?: MediaElementAudioSourceNode;
            playerB?: MediaElementAudioSourceNode;
            cartwall?: MediaElementAudioSourceNode;
            mic?: MediaStreamAudioSourceNode;
            pfl?: MediaElementAudioSourceNode;
        };
        playerMixerNode: AudioWorkletNode | null;
        sourceGains: Partial<Record<AudioSourceId, GainNode>>;
        routingGains: Partial<Record<`${AudioSourceId}_to_${AudioBusId}`, GainNode>>;
        duckingGains: Partial<Record<`${AudioSourceId}_to_${AudioBusId}`, GainNode>>;
        busGains: Partial<Record<AudioBusId, GainNode>>;
        busDestinations: Partial<Record<AudioBusId, MediaStreamAudioDestinationNode>>;
        analysers: Partial<Record<AudioSourceId | AudioBusId, AnalyserNode>>;
        mainBusCompressor?: DynamicsCompressorNode;
        mainBusEq?: {
            bass: BiquadFilterNode;
            mid: BiquadFilterNode;
            treble: BiquadFilterNode;
        };
        isInitialized: boolean;
    };
    
    const audioGraphRef = useRef<AdvancedAudioGraph>({
        context: null,
        sources: {},
        playerMixerNode: null,
        sourceGains: {},
        routingGains: {},
        duckingGains: {},
        busGains: {},
        busDestinations: {},
        analysers: {},
        isInitialized: false,
    });
    
    // --- Resizable Layout State ---
    const [columnWidths, setColumnWidths] = useState<number[]>([20, 55, 25]);
    const mainRef = useRef<HTMLElement>(null);


    const currentItem = useMemo(() => playlist[currentTrackIndex], [playlist, currentTrackIndex]);
    const currentTrack = useMemo(() => (currentItem?.type !== 'marker' && currentItem?.type !== 'clock_start_marker' && currentItem?.type !== 'autofill_marker' && currentItem?.type !== 'random_from_folder' && currentItem?.type !== 'random_from_tag' ? currentItem as Track : undefined), [currentItem]);

    const displayTrack = useMemo(() => {
        if (!currentTrack) return undefined;
        const suppression = getSuppressionSettings(currentTrack.id, mediaLibrary);

        if (suppression?.enabled) {
            const customText = suppression.customText || 'radiohost.cloud';
            const parts = customText.split(' - ');
            const title = parts[0];
            const artist = parts.length > 1 ? parts.slice(1).join(' - ') : 'Now Playing';

            return {
                id: 'suppressed',
                title: title,
                artist: artist,
                duration: currentTrack.duration,
                type: TrackType.JINGLE,
                src: '',
            };
        }
        return currentTrack;
    }, [currentTrack, mediaLibrary]);


     // Service Worker Registration for PWA capabilities
    useEffect(() => {
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('/service-worker.js')
                    .then(registration => console.log('ServiceWorker registration successful with scope: ', registration.scope))
                    .catch(err => console.error('ServiceWorker registration failed: ', err));
            });
        }
    }, []);

    const verifyPermission = async (fileHandle: FileSystemDirectoryHandle | FileSystemFileHandle) => {
        const options = { mode: 'readwrite' as const };
        if ((await (fileHandle as any).queryPermission(options)) === 'granted') {
            return true;
        }
        if ((await (fileHandle as any).requestPermission(options)) === 'granted') {
            return true;
        }
        return false;
    };
    
    // Check for saved user session or guest session on initial load
    useEffect(() => {
        const loadInitialData = () => {
            const savedUserEmail = localStorage.getItem(CURRENT_USER_SESSION_KEY);
            
            let initialLibrary: Folder;
            let initialPlaylist: SequenceItem[];
            let initialSchedule: ScheduledBlock[];
            let initialSettings: any = {};
            let initialCartwall: CartwallCategory[];
            let initialPlaybackState: any | null = null;
            let loggedInUser: { email: string; nickname: string; } | null = null;
            let initialAudioConfig: {buses: AudioBus[], mixer: MixerConfig} | null = null;

            if (savedUserEmail) {
                const storedUsers = JSON.parse(localStorage.getItem(USERS_STORAGE_KEY) || '[]');
                const user = storedUsers.find((u: any) => u.email === savedUserEmail);

                if (user) {
                    loggedInUser = { email: user.email, nickname: user.nickname || user.email.split('@')[0] };
                    const allPlaylists = JSON.parse(localStorage.getItem(USER_PLAYLISTS_STORAGE_KEY) || '{}');
                    initialPlaylist = allPlaylists[savedUserEmail] || [];
                    
                    initialPlaybackState = (JSON.parse(localStorage.getItem(USER_PLAYBACK_STATE_KEY) || '{}'))[savedUserEmail] || null;

                    const allLibraries = JSON.parse(localStorage.getItem(USER_LIBRARIES_STORAGE_KEY) || '{}');
                    initialLibrary = allLibraries[savedUserEmail] || createInitialLibrary();
                    
                    initialSettings = (JSON.parse(localStorage.getItem(USER_SETTINGS_KEY) || '{}'))[savedUserEmail] || {};
                    
                    const allSchedules = JSON.parse(localStorage.getItem(USER_SCHEDULES_STORAGE_KEY) || '{}');
                    initialSchedule = allSchedules[savedUserEmail] || [];

                    initialCartwall = (JSON.parse(localStorage.getItem(USER_CARTWALL_STORAGE_KEY) || '{}'))[savedUserEmail] || createInitialCartwall();
                    initialAudioConfig = (JSON.parse(localStorage.getItem(USER_AUDIO_CONFIG_KEY) || '{}'))[savedUserEmail] || null;
                } else {
                    localStorage.removeItem(CURRENT_USER_SESSION_KEY);
                    return; // Abort loading, will show login screen
                }
            } else {
                // Load Guest Data
                initialPlaylist = JSON.parse(localStorage.getItem(GUEST_PLAYLIST_KEY) || '[]');
                initialPlaybackState = JSON.parse(localStorage.getItem(GUEST_PLAYBACK_STATE_KEY) || 'null');
                initialLibrary = JSON.parse(localStorage.getItem(GUEST_LIBRARY_KEY) || 'null') || createInitialLibrary();
                initialSettings = JSON.parse(localStorage.getItem(GUEST_SETTINGS_KEY) || '{}');
                initialSchedule = JSON.parse(localStorage.getItem(GUEST_SCHEDULE_KEY) || '[]');
                initialCartwall = JSON.parse(localStorage.getItem(GUEST_CARTWALL_KEY) || 'null') || createInitialCartwall();
                initialAudioConfig = JSON.parse(localStorage.getItem(GUEST_AUDIO_CONFIG_KEY) || 'null');
            }

            // --- Set base state first ---
            if (loggedInUser) setCurrentUser(loggedInUser);
            setMediaLibrary(initialLibrary);
            setSchedule(initialSchedule);
            setCartwallCategories(initialCartwall);
            setActiveCartwallCategoryId(initialCartwall[0]?.id || null);
            setPlayoutPolicy({ ...defaultPlayoutPolicy, ...initialSettings.playoutPolicy });
            setIsAutoplayEnabled(initialSettings.isAutoplayEnabled ?? true);
            setLogoSrc(initialSettings.logoSrc || null);
            setHeaderGradient(initialSettings.headerGradient || null);
            setIsNowPlayingExportEnabled(initialSettings.isNowPlayingExportEnabled || false);
            setMetadataFormat(initialSettings.metadataFormat || '%artist% - %title%');
            if (initialSettings.columnWidths) setColumnWidths(initialSettings.columnWidths);
            setIsMicPanelCollapsed(initialSettings.isMicPanelCollapsed ?? false);
            setIsHeaderCollapsed(initialSettings.isHeaderCollapsed ?? false);
            setIsLibraryCollapsed(initialSettings.isLibraryCollapsed ?? false);
            setIsAutoBackupEnabled(initialSettings.isAutoBackupEnabled || false);
            setIsAutoBackupOnStartupEnabled(initialSettings.isAutoBackupOnStartupEnabled || false);
            setAutoBackupInterval(initialSettings.autoBackupInterval ?? 24);
            
            if (initialAudioConfig) {
                // Merge buses: Start with initial defaults, then overwrite with any saved properties.
                // This ensures new properties in updates are not lost.
                const mergedBuses = initialBuses.map(defaultBus => {
                    const savedBus = initialAudioConfig.buses?.find(b => b.id === defaultBus.id);
                    return { ...defaultBus, ...(savedBus || {}) };
                });
                setAudioBuses(mergedBuses);

                // Merge mixer config: A deep merge is needed to handle nested `sends`.
                const mergedMixerConfig = { ...initialMixerConfig };
                (Object.keys(initialMixerConfig) as Array<AudioSourceId>).forEach(sourceId => {
                    const savedSourceConfig = initialAudioConfig.mixer?.[sourceId];
                    if (savedSourceConfig) {
                        mergedMixerConfig[sourceId] = {
                            ...initialMixerConfig[sourceId], // Start with defaults for this source
                            ...savedSourceConfig,            // Overwrite with saved properties (like gain, muted)
                            sends: {                         // Deep merge the sends
                                ...initialMixerConfig[sourceId].sends,
                                ...(savedSourceConfig.sends || {}),
                            },
                        };
                    }
                });
                setMixerConfig(mergedMixerConfig);
            }

            // --- Decide how to handle playlist and playback state ---
            // If the playlist is empty, or if the player was paused when last closed, regenerate a fresh playlist.
            // This ensures the user always starts with a fresh schedule unless they refresh during active playback.
            const shouldRegeneratePlaylist = initialPlaylist.length === 0 || !initialPlaybackState?.isPlaying;

            if (shouldRegeneratePlaylist) {
                const now = new Date();
                const currentHour = now.getHours();
                const block = findBlockForHour(initialSchedule, currentHour, now);
                const policyForGeneration = { ...defaultPlayoutPolicy, ...initialSettings.playoutPolicy };
                const minutes = now.getMinutes();
                const seconds = now.getSeconds();
                const secondsRemainingInHour = 3600 - (minutes * 60 + seconds);
                
                let generatedPlaylist: SequenceItem[] = [];

                if (block) { // Primary method: Scheduled block
                    if (block.type === 'sequence' && block.sequenceItems) {
                        generatedPlaylist = resolveSequenceItems(block.sequenceItems, initialLibrary, policyForGeneration, []);
                    } else if (block.type === 'folder' && block.folderId) {
                        generatedPlaylist = generatePlaylistFromFolder(block.folderId, initialLibrary, policyForGeneration, [], secondsRemainingInHour);
                    }

                    const initialDuration = generatedPlaylist.reduce((sum, item) => {
                        if (item.type !== 'marker' && item.type !== 'clock_start_marker' && item.type !== 'random_from_folder' && item.type !== 'random_from_tag' && item.type !== 'autofill_marker') {
                            return sum + (item as Track).duration;
                        }
                        return sum;
                    }, 0);

                    if (policyForGeneration.autoFillPlaylist && initialDuration > 0 && initialDuration < secondsRemainingInHour) {
                        const remainingDuration = secondsRemainingInHour - initialDuration;
                        const autoTracks = generatePlaylistFromTags(policyForGeneration.autoFillTags, initialLibrary, policyForGeneration, [], remainingDuration);
            
                        if (autoTracks.length > 0) {
                            const autoFillMarker: AutoFillMarker = {
                                id: `autofill-${Date.now()}`,
                                type: 'autofill_marker',
                                title: `Auto-filled from '${policyForGeneration.autoFillTags.join(', ')}' tag(s)`
                            };
                            generatedPlaylist = [...generatedPlaylist, autoFillMarker, ...autoTracks];
                        }
                    }
                } else { // Fallback method: 'auto' tag
                    generatedPlaylist = generatePlaylistFromTags(policyForGeneration.autoFillTags, initialLibrary, policyForGeneration, [], secondsRemainingInHour);
                }

                if (generatedPlaylist.length > 0) {
                    const newMarker: ClockStartMarker = {
                        id: `clock-start-${currentHour}-${Date.now()}`,
                        type: 'clock_start_marker',
                        hour: currentHour,
                        title: block?.title || 'Auto-Filled Playlist',
                        loadMode: block?.loadMode || 'soft',
                    };
                    generatedPlaylist.unshift(newMarker);
                    
                    setPlaylist(generatedPlaylist);
                    const firstPlayableIndex = generatedPlaylist.findIndex(item => item.type !== 'marker' && item.type !== 'clock_start_marker' && item.type !== 'random_from_folder' && item.type !== 'random_from_tag' && item.type !== 'autofill_marker');
                    
                    if (firstPlayableIndex > -1) {
                        setCurrentTrackIndex(firstPlayableIndex);
                        setStopAfterTrackId(null);
                        // Always start in a paused state after a fresh regeneration
                        setCurrentPlayingItemId(null);
                        setIsPlaying(false);
                    }
                } else {
                    // If regeneration yields no tracks, start with an empty playlist.
                    setPlaylist([]);
                    setCurrentTrackIndex(0);
                    setCurrentPlayingItemId(null);
                    setIsPlaying(false);
                    setStopAfterTrackId(null);
                }
            } else {
                // --- Restore saved state because playback was active on refresh ---
                setPlaylist(initialPlaylist);
                if (initialPlaybackState) {
                    setIsPlaying(initialPlaybackState.isPlaying ?? false);
                    setCurrentPlayingItemId(initialPlaybackState.currentPlayingItemId ?? null);
                    setCurrentTrackIndex(initialPlaybackState.currentTrackIndex ?? 0);
                    setStopAfterTrackId(initialPlaybackState.stopAfterTrackId ?? null);
                } else if (initialPlaylist.length > 0) {
                    const firstPlayableIndex = initialPlaylist.findIndex(item => item.type !== 'marker' && item.type !== 'clock_start_marker' && item.type !== 'autofill_marker' && item.type !== 'random_from_folder' && item.type !== 'random_from_tag');
                    setCurrentTrackIndex(firstPlayableIndex > -1 ? firstPlayableIndex : 0);
                    setCurrentPlayingItemId(null);
                    setIsPlaying(false);
                    setStopAfterTrackId(null);
                }
            }
        };

        loadInitialData();

        const loadConfig = async () => {
            // Load Now Playing Export Config
            const npFileHandle = await getConfig<FileSystemFileHandle>('nowPlayingFileHandle');
            if (npFileHandle) {
                if (await verifyPermission(npFileHandle)) {
                    nowPlayingFileHandleRef.current = npFileHandle;
                    const npFileName = await getConfig<string>('nowPlayingFileName');
                    setNowPlayingFileName(npFileName || npFileHandle.name);
                } else {
                    console.warn("Permission lost for 'Now Playing' file. Please set it again.");
                    await setConfig('nowPlayingFileHandle', null);
                    await setConfig('nowPlayingFileName', null);
                }
            }

             // Load Auto Backup Config
            const backupFolderHandle = await getConfig<FileSystemDirectoryHandle>('autoBackupFolderHandle');
            if (backupFolderHandle) {
                if (await verifyPermission(backupFolderHandle)) {
                    autoBackupFolderHandleRef.current = backupFolderHandle;
                    const backupFolderPath = await getConfig<string>('autoBackupFolderPath');
                    setAutoBackupFolderPath(backupFolderPath || backupFolderHandle.name);
                } else {
                    console.warn("Permission lost for auto-backup folder. Please set it again.");
                    setIsAutoBackupEnabled(false);
                    await setConfig('autoBackupFolderHandle', null);
                    await setConfig('autoBackupFolderPath', null);
                }
            }
        };
        loadConfig();

        const getAudioDevices = async () => {
             if (!navigator.mediaDevices?.enumerateDevices) { return; }
             try {
                await navigator.mediaDevices.getUserMedia({ audio: true });
                const devices = await navigator.mediaDevices.enumerateDevices();
                setAvailableAudioDevices(devices.filter(d => d.kind === 'audiooutput'));
             } catch(e) {
                console.error("Could not get audio devices", e);
             }
        }
        getAudioDevices();
        navigator.mediaDevices.addEventListener('devicechange', getAudioDevices);
        return () => navigator.mediaDevices.removeEventListener('devicechange', getAudioDevices);

    }, []);
    
    // --- DEBOUNCED PERSISTENCE EFFECTS ---
    const useDebouncedEffect = (effect: () => void, deps: React.DependencyList, delay: number) => {
        useEffect(() => {
            const handler = setTimeout(() => effect(), delay);
            return () => clearTimeout(handler);
        }, [JSON.stringify(deps)]); // Stringify complex dependencies to compare them
    };

    useDebouncedEffect(() => {
        if (currentUser) {
            const allLibraries = JSON.parse(localStorage.getItem(USER_LIBRARIES_STORAGE_KEY) || '{}');
            allLibraries[currentUser.email] = mediaLibrary;
            localStorage.setItem(USER_LIBRARIES_STORAGE_KEY, JSON.stringify(allLibraries));
        } else {
            localStorage.setItem(GUEST_LIBRARY_KEY, JSON.stringify(mediaLibrary));
        }
    }, [mediaLibrary, currentUser], 500);

    useDebouncedEffect(() => {
        const settingsToSave = { 
            playoutPolicy, 
            isAutoplayEnabled,
            logoSrc, 
            headerGradient, 
            isNowPlayingExportEnabled,
            metadataFormat,
            columnWidths,
            isMicPanelCollapsed,
            isHeaderCollapsed,
            isLibraryCollapsed,
            isAutoBackupEnabled,
            isAutoBackupOnStartupEnabled,
            autoBackupInterval,
        };
        if (currentUser) {
            const allSettings = JSON.parse(localStorage.getItem(USER_SETTINGS_KEY) || '{}');
            allSettings[currentUser.email] = settingsToSave;
            localStorage.setItem(USER_SETTINGS_KEY, JSON.stringify(allSettings));

            const audioConfig = { buses: audioBuses, mixer: mixerConfig };
            const allAudioConfigs = JSON.parse(localStorage.getItem(USER_AUDIO_CONFIG_KEY) || '{}');
            allAudioConfigs[currentUser.email] = audioConfig;
            localStorage.setItem(USER_AUDIO_CONFIG_KEY, JSON.stringify(allAudioConfigs));

        } else {
            localStorage.setItem(GUEST_SETTINGS_KEY, JSON.stringify(settingsToSave));
            localStorage.setItem(GUEST_AUDIO_CONFIG_KEY, JSON.stringify({ buses: audioBuses, mixer: mixerConfig }));
        }
    }, [playoutPolicy, isAutoplayEnabled, logoSrc, headerGradient, isNowPlayingExportEnabled, metadataFormat, columnWidths, isMicPanelCollapsed, isHeaderCollapsed, isLibraryCollapsed, currentUser, audioBuses, mixerConfig, isAutoBackupEnabled, isAutoBackupOnStartupEnabled, autoBackupInterval], 500);

    useDebouncedEffect(() => {
        const playlistToSave = playlist.filter(item => {
            // Do not persist local files with temporary object URLs
            if (item.type !== 'marker' && item.type !== 'clock_start_marker' && item.type !== 'random_from_folder' && item.type !== 'random_from_tag' && item.type !== 'autofill_marker' && item.type === TrackType.LOCAL_FILE) {
                return false; 
            }
            return true;
        });

        if (currentUser) {
            const allPlaylists = JSON.parse(localStorage.getItem(USER_PLAYLISTS_STORAGE_KEY) || '{}');
            allPlaylists[currentUser.email] = playlistToSave;
            localStorage.setItem(USER_PLAYLISTS_STORAGE_KEY, JSON.stringify(allPlaylists));
        } else {
            localStorage.setItem(GUEST_PLAYLIST_KEY, JSON.stringify(playlistToSave));
        }
    }, [playlist, currentUser], 500);

    useDebouncedEffect(() => {
        if (currentUser) {
            const allCartwalls = JSON.parse(localStorage.getItem(USER_CARTWALL_STORAGE_KEY) || '{}');
            allCartwalls[currentUser.email] = cartwallCategories;
            localStorage.setItem(USER_CARTWALL_STORAGE_KEY, JSON.stringify(allCartwalls));
        } else {
            localStorage.setItem(GUEST_CARTWALL_KEY, JSON.stringify(cartwallCategories));
        }
    }, [cartwallCategories, currentUser], 500);
    
    useDebouncedEffect(() => {
        if (currentUser) {
            const allSchedules = JSON.parse(localStorage.getItem(USER_SCHEDULES_STORAGE_KEY) || '{}');
            allSchedules[currentUser.email] = schedule;
            localStorage.setItem(USER_SCHEDULES_STORAGE_KEY, JSON.stringify(allSchedules));
        } else {
            localStorage.setItem(GUEST_SCHEDULE_KEY, JSON.stringify(schedule));
        }
    }, [schedule, currentUser], 500);

    useDebouncedEffect(() => {
        const playbackState = {
            isPlaying,
            currentPlayingItemId,
            currentTrackIndex,
            stopAfterTrackId,
        };
        if (currentUser) {
            const allStates = JSON.parse(localStorage.getItem(USER_PLAYBACK_STATE_KEY) || '{}');
            allStates[currentUser.email] = playbackState;
            localStorage.setItem(USER_PLAYBACK_STATE_KEY, JSON.stringify(allStates));
        } else {
            localStorage.setItem(GUEST_PLAYBACK_STATE_KEY, JSON.stringify(playbackState));
        }
    }, [isPlaying, currentPlayingItemId, currentTrackIndex, stopAfterTrackId, currentUser], 500);
    
    
    // --- MEMORY MANAGEMENT ---
    useEffect(() => {
        return () => {
            // This cleanup runs when the App component unmounts.
            playlistRef.current.forEach(item => {
                 const track = item as Track;
                if (track.src && track.src.startsWith('blob:')) {
                    URL.revokeObjectURL(track.src);
                }
            });
            if (playerAUrlRef.current) URL.revokeObjectURL(playerAUrlRef.current);
            if (playerBUrlRef.current) URL.revokeObjectURL(playerBUrlRef.current);
            if (cartwallAudioUrlRef.current) URL.revokeObjectURL(cartwallAudioUrlRef.current);
            if (pflAudioUrlRef.current) URL.revokeObjectURL(pflAudioUrlRef.current);
            
            audioBufferRef.current.forEach(blob => {
                if (blob instanceof File) {
                    const url = URL.createObjectURL(blob);
                    URL.revokeObjectURL(url);
                }
            });
            audioBufferRef.current.clear();
        };
    }, []);

    const findNextPlayableIndex = useCallback((startIndex: number, direction: number = 1, sourcePlaylist?: SequenceItem[], noLoop = false): number => {
        const listToSearch = sourcePlaylist || playlistRef.current;
        const len = listToSearch.length;
        if (len === 0) return -1;
        const skippedIds = skippedItemIdsRef.current;

        if (noLoop) {
            let index = startIndex + direction;
            while(index >= 0 && index < len) {
                const item = listToSearch[index];
                if (!skippedIds.has(item.id) && item?.type !== 'marker' && item?.type !== 'clock_start_marker' && item?.type !== 'random_from_folder' && item?.type !== 'random_from_tag' && item?.type !== 'autofill_marker') {
                    return index;
                }
                index += direction;
            }
            return -1; // Reached end, no playable track found
        } 
        
        // Looping logic (original)
        let nextIndex = startIndex;
        for (let i = 0; i < len; i++) {
            nextIndex = (nextIndex + direction + len) % len;
            const item = listToSearch[nextIndex];
            if (!skippedIds.has(item.id) && item?.type !== 'marker' && item?.type !== 'clock_start_marker' && item?.type !== 'random_from_folder' && item?.type !== 'random_from_tag' && item?.type !== 'autofill_marker') {
                return nextIndex;
            }
        }
        return -1; // No playable item found in the whole list
    }, []);

    const stopPfl = useCallback(() => {
        const player = pflAudioRef.current;
        if (player) {
            player.pause();
            if (pflAudioUrlRef.current && pflAudioUrlRef.current.startsWith('blob:')) {
                URL.revokeObjectURL(pflAudioUrlRef.current);
            }
            player.src = '';
            pflAudioUrlRef.current = null;
        }
        setIsPflPlaying(false);
        setPflTrackId(null);
        setPflProgress(0);
    }, []);

    const performHardLoad = useCallback((newPlaylist: SequenceItem[], play: boolean) => {
        stopPfl();
        setPlaylist(newPlaylist);

        const firstPlayableIndex = newPlaylist.findIndex(item => item.type !== 'marker' && item.type !== 'clock_start_marker' && item.type !== 'random_from_folder' && item.type !== 'random_from_tag' && item.type !== 'autofill_marker');
        
        // Stop current playback
        playerARef.current?.pause();
        playerBRef.current?.pause();
        if (playerARef.current) playerARef.current.src = '';
        if (playerBRef.current) playerBRef.current.src = '';
        playerALoadedIdRef.current = null;
        playerBLoadedIdRef.current = null;

        if (firstPlayableIndex > -1) {
            setCurrentTrackIndex(firstPlayableIndex);
            setTrackProgress(0);
            if (play && isAutoplayEnabledRef.current) {
                setIsPlaying(true);
                setCurrentPlayingItemId(newPlaylist[firstPlayableIndex].id);
            } else {
                 setIsPlaying(false);
                 setCurrentPlayingItemId(null);
            }
        } else {
            // No playable tracks in new playlist
            setCurrentTrackIndex(0);
            setIsPlaying(false);
            setCurrentPlayingItemId(null);
            setTrackProgress(0);
        }
        setStopAfterTrackId(null);
    }, [stopPfl]);

    const handleNext = useCallback(() => {
        const nextIndex = findNextPlayableIndex(currentTrackIndexRef.current, 1);
    
        if (nextIndex !== -1) {
            if (playoutPolicyRef.current.removePlayedTracks && nextIndex > currentTrackIndexRef.current) {
                const newPlaylist = playlistRef.current.slice(nextIndex);
                setPlaylist(newPlaylist);
                setCurrentTrackIndex(0);
            } else {
                setCurrentTrackIndex(nextIndex);
            }
            setActivePlayer(p => p === 'A' ? 'B' : 'A');
        } else {
            // Playlist ended
            setIsPlaying(false);
            setCurrentPlayingItemId(null);
            if (playoutPolicyRef.current.removePlayedTracks) {
                setPlaylist([]);
            }
        }
    }, [findNextPlayableIndex]);

    const handlePrevious = useCallback(() => {
        const prevIndex = findNextPlayableIndex(currentTrackIndexRef.current, -1);
        if (prevIndex !== -1) {
            setActivePlayer(p => p === 'A' ? 'B' : 'A');
            setCurrentTrackIndex(prevIndex);
        }
    }, [findNextPlayableIndex]);
    
    const handleTogglePlay = useCallback(async () => {
        if (!audioGraphRef.current.isInitialized) {
            await initializeAudioGraph();
        }
        if (playlistRef.current.length === 0) return;

        const shouldPlay = !isPlayingRef.current;
        if (shouldPlay) {
            stopPfl();
        }
        setIsPlaying(shouldPlay);

        if (shouldPlay) {
            const currentItem = playlistRef.current[currentTrackIndexRef.current];
            if (currentItem?.id !== currentPlayingItemId) {
                setCurrentPlayingItemId(currentItem?.id || null);
            }
        }
    }, [stopPfl]);
    
    const handlePlayTrack = useCallback(async (itemId: string) => {
        if (!audioGraphRef.current.isInitialized) {
            await initializeAudioGraph();
        }
        
        const targetIndex = playlistRef.current.findIndex(item => item.id === itemId);
        if (targetIndex === -1) return;

        const newTrack = playlistRef.current[targetIndex];
        if (newTrack?.type === 'marker' || newTrack?.type === 'clock_start_marker' || newTrack?.type === 'random_from_folder' || newTrack?.type === 'random_from_tag' || newTrack?.type === 'autofill_marker') return;

        stopPfl();
        
        const isForwardJump = targetIndex > currentTrackIndexRef.current;

        if (playoutPolicyRef.current.removePlayedTracks && isForwardJump) {
            const newPlaylist = playlistRef.current.slice(targetIndex);
            setPlaylist(newPlaylist);
            // After slicing, the target track is at index 0
            setCurrentTrackIndex(0);
        } else {
            setCurrentTrackIndex(targetIndex);
        }

        if (currentTrackIndexRef.current !== targetIndex) {
             setActivePlayer(p => p === 'A' ? 'B' : 'A');
        }
        setCurrentPlayingItemId(newTrack.id);
        setIsPlaying(true);
    }, [stopPfl]);
    
    // --- Audio Player & Web Audio API Logic ---

    const getTrackSrc = useCallback(async (track: Track): Promise<string | null> => {
        if (track.type === TrackType.URL || (track.type === TrackType.LOCAL_FILE && track.src.startsWith('blob:'))) {
            return track.src;
        }
        const file = await getTrackFromDB(track.id);
        return file ? URL.createObjectURL(file) : null;
    }, []);

    const initializeAudioGraph = useCallback(async () => {
       if (audioGraphRef.current.isInitialized || !playerARef.current || !playerBRef.current || !cartwallAudioRef.current || !pflAudioRef.current) return;
    
        try {
            const context = new AudioContext();
            audioGraphRef.current.context = context;
            
            // --- Create Sources ---
            const sources: AdvancedAudioGraph['sources'] = {
                playerA: context.createMediaElementSource(playerARef.current),
                playerB: context.createMediaElementSource(playerBRef.current),
                cartwall: context.createMediaElementSource(cartwallAudioRef.current),
                pfl: context.createMediaElementSource(pflAudioRef.current),
            };
            audioGraphRef.current.sources = sources;

            // --- Create Nodes ---
            const sourceGains: AdvancedAudioGraph['sourceGains'] = {};
            const routingGains: AdvancedAudioGraph['routingGains'] = {};
            const duckingGains: AdvancedAudioGraph['duckingGains'] = {};
            const busGains: AdvancedAudioGraph['busGains'] = {};
            const busDestinations: AdvancedAudioGraph['busDestinations'] = {};
            const analysers: AdvancedAudioGraph['analysers'] = {};

            // Player A/B are mixed before main gain for crossfading
            const playerMixerBlob = new Blob([mixerWorkletCode], { type: 'application/javascript' });
            const playerMixerUrl = URL.createObjectURL(playerMixerBlob);
            await context.audioWorklet.addModule(playerMixerUrl);
            URL.revokeObjectURL(playerMixerUrl);
            const playerMixerNode = new AudioWorkletNode(context, 'mixer-processor', { numberOfInputs: 2 });
            sources.playerA.connect(playerMixerNode, 0, 0);
            sources.playerB.connect(playerMixerNode, 0, 1);
            audioGraphRef.current.playerMixerNode = playerMixerNode;
            
            const sourceIds: AudioSourceId[] = ['mainPlayer', 'cartwall', 'mic', 'pfl'];
            sourceIds.forEach(id => {
                sourceGains[id] = context.createGain();
                analysers[id] = context.createAnalyser();
                analysers[id]!.fftSize = 256;
                sourceGains[id]!.connect(analysers[id]!);
            });

            playerMixerNode.connect(sourceGains.mainPlayer!);
            sources.cartwall.connect(sourceGains.cartwall!);
            sources.pfl.connect(sourceGains.pfl!);

            // Create buses, bus analysers, and processing nodes for the main bus
            audioBuses.forEach(bus => {
                busGains[bus.id] = context.createGain();
                busDestinations[bus.id] = context.createMediaStreamDestination();
                analysers[bus.id] = context.createAnalyser();
                analysers[bus.id]!.fftSize = 256;

                if (bus.id === 'main') {
                    const compressor = context.createDynamicsCompressor();
                    const eqBass = context.createBiquadFilter();
                    const eqMid = context.createBiquadFilter();
                    const eqTreble = context.createBiquadFilter();

                    eqBass.type = 'lowshelf'; eqBass.frequency.value = 120;
                    eqMid.type = 'peaking'; eqMid.frequency.value = 1000; eqMid.Q.value = 1;
                    eqTreble.type = 'highshelf'; eqTreble.frequency.value = 8000;
                    
                    // Connect the processing chain for the main bus
                    analysers[bus.id]!.connect(compressor);
                    compressor.connect(eqBass);
                    eqBass.connect(eqMid);
                    eqMid.connect(eqTreble);
                    eqTreble.connect(busGains[bus.id]!);

                    audioGraphRef.current.mainBusCompressor = compressor;
                    audioGraphRef.current.mainBusEq = { bass: eqBass, mid: eqMid, treble: eqTreble };
                } else {
                    // For other buses (e.g., monitor), connect directly without processing
                    analysers[bus.id]!.connect(busGains[bus.id]!);
                }
                
                busGains[bus.id]!.connect(busDestinations[bus.id]!);
            });

            // Create routing gains and connect graph
            sourceIds.forEach(sourceId => {
                audioBuses.forEach(bus => {
                    const routingGain = context.createGain();
                    routingGains[`${sourceId}_to_${bus.id}`] = routingGain;
                    analysers[sourceId]!.connect(routingGain);

                    // Insert a dedicated ducking node for music channels on the main bus
                    if ((sourceId === 'mainPlayer' || sourceId === 'cartwall') && bus.id === 'main') {
                        const duckingGain = context.createGain();
                        duckingGains[`${sourceId}_to_${bus.id}`] = duckingGain;
                        routingGain.connect(duckingGain);
                        duckingGain.connect(analysers[bus.id]!);
                    } else {
                        routingGain.connect(analysers[bus.id]!);
                    }
                });
            });

            audioGraphRef.current = {
                ...audioGraphRef.current, sourceGains, routingGains, duckingGains, busGains, busDestinations, analysers, isInitialized: true,
            };

            // Connect bus outputs to audio elements
            if(mainBusAudioRef.current && busDestinations.main) mainBusAudioRef.current.srcObject = busDestinations.main.stream;
            if(monitorBusAudioRef.current && busDestinations.monitor) monitorBusAudioRef.current.srcObject = busDestinations.monitor.stream;

            // Ensure the context is running
            if (context.state === 'suspended') {
                await context.resume();
            }

        } catch (error) {
            console.error("Failed to initialize Audio graph:", error);
        }
    }, [audioBuses, mixerWorkletCode]);

    useEffect(() => {
        let animationFrameId: number;

        const measureLevels = () => {
            const graph = audioGraphRef.current;
            if (!graph.isInitialized || !graph.analysers) {
                animationFrameId = requestAnimationFrame(measureLevels);
                return;
            }

            const newLevels: Partial<Record<AudioSourceId | AudioBusId, number>> = {};
            
            for (const key in graph.analysers) {
                const id = key as (AudioSourceId | AudioBusId);
                const analyser = graph.analysers[id];
                if (analyser) {
                    const bufferLength = analyser.frequencyBinCount;
                    const dataArray = new Uint8Array(bufferLength);
                    analyser.getByteTimeDomainData(dataArray);

                    let sumSquares = 0.0;
                    for (const amplitude of dataArray) {
                        const normalizedAmplitude = (amplitude / 128.0) - 1.0;
                        sumSquares += normalizedAmplitude * normalizedAmplitude;
                    }
                    const rms = Math.sqrt(sumSquares / bufferLength);
                    const volumeLevel = Math.min(100, rms * 300); 
                    newLevels[id] = volumeLevel;
                }
            }
            setAudioLevels(newLevels);
            animationFrameId = requestAnimationFrame(measureLevels);
        };

        animationFrameId = requestAnimationFrame(measureLevels);

        return () => {
            cancelAnimationFrame(animationFrameId);
        };
    }, []);

    type NextAction = 
        | { type: 'STOP' }
        | { type: 'JUMP', index: number }
        | { type: 'LOAD_CLOCK', fromIndex: number };

    const determineNextAction = useCallback((currentIndex: number, currentPlaylist: SequenceItem[]): NextAction => {
        // 1. Check for a soft clock change first.
        const nextSoftClockMarkerIndex = currentPlaylist.findIndex((item, i) =>
            i > currentIndex && item.type === 'clock_start_marker' && item.loadMode === 'soft'
        );
        if (nextSoftClockMarkerIndex !== -1) {
            return { type: 'LOAD_CLOCK', fromIndex: nextSoftClockMarkerIndex };
        }
    
        // 2. Find the simple next playable track.
        const simpleNextIndex = findNextPlayableIndex(currentIndex, 1, currentPlaylist);
    
        if (simpleNextIndex !== -1 && simpleNextIndex !== currentIndex) { // ensure it's not looping on a single track playlist
            return { type: 'JUMP', index: simpleNextIndex };
        }
        
        // 3. No next track at all.
        return { type: 'STOP' };
    }, [findNextPlayableIndex]);

    const performCrossfade = useCallback(async (nextIndex: number) => {
        const graph = audioGraphRef.current;
        const playerMixerNode = graph.playerMixerNode;
        if (!graph.isInitialized || !graph.context || !playerMixerNode || isCrossfadingRef.current) return;
    
        isCrossfadingRef.current = true;
        stopPfl();
    
        const policy = playoutPolicyRef.current;
        const crossfadeDuration = policy.crossfadeDuration;
        const { context } = graph;
        const now = context.currentTime;
    
        const inactivePlayerRef = activePlayer === 'A' ? playerBRef : playerARef;
        const inactiveUrlRef = activePlayer === 'A' ? playerBUrlRef : playerAUrlRef;
        const inactiveLoadedIdRef = activePlayer === 'A' ? playerBLoadedIdRef : playerALoadedIdRef;
    
        const nextItem = playlistRef.current[nextIndex];
        if (!nextItem || nextItem.type === 'marker' || nextItem.type === 'clock_start_marker' || nextItem.type === 'random_from_folder' || nextItem.type === 'random_from_tag' || nextItem.type === 'autofill_marker') {
            isCrossfadingRef.current = false;
            return;
        }
    
        const src = await getTrackSrc(nextItem as Track);
        const inactivePlayer = inactivePlayerRef.current;
    
        if (!src || !inactivePlayer) {
            isCrossfadingRef.current = false;
            return;
        }
    
        if (inactiveUrlRef.current && inactiveUrlRef.current.startsWith('blob:')) {
            URL.revokeObjectURL(inactiveUrlRef.current);
        }
        inactivePlayer.src = src;
        inactiveUrlRef.current = src;
        inactiveLoadedIdRef.current = nextItem.id;
        inactivePlayer.load();
    
        try {
            const gainAParam = playerMixerNode.parameters.get('gainA')!;
            const gainBParam = playerMixerNode.parameters.get('gainB')!;
            const activeParam = activePlayer === 'A' ? gainAParam : gainBParam;
            const inactiveParam = activePlayer === 'A' ? gainBParam : gainAParam;
            
            await inactivePlayer.play();
    
            activeParam.cancelScheduledValues(now);
            activeParam.linearRampToValueAtTime(0, now + crossfadeDuration);
    
            inactiveParam.cancelScheduledValues(now);
            inactiveParam.linearRampToValueAtTime(1.0, now + crossfadeDuration);
    
            setTimeout(() => {
                const oldIndex = currentTrackIndexRef.current;
                const oldPlaylist = playlistRef.current;
                const endedItem = oldPlaylist[oldIndex];
                
                if (endedItem.type !== 'marker' && endedItem.type !== 'clock_start_marker' && endedItem.type !== 'random_from_folder' && endedItem.type !== 'random_from_tag' && endedItem.type !== 'autofill_marker') {
                    setPlayoutHistory(prev => [...prev, { trackId: endedItem.id, title: endedItem.title, artist: endedItem.artist, playedAt: Date.now() }].slice(-100));
                }

                setCurrentPlayingItemId(nextItem.id);
                setActivePlayer(p => p === 'A' ? 'B' : 'A');

                if (playoutPolicyRef.current.removePlayedTracks) {
                    const newPlaylist = playlistRef.current.slice(nextIndex);
                    setPlaylist(newPlaylist);
                    setCurrentTrackIndex(0);
                } else {
                    setCurrentTrackIndex(nextIndex);
                }

                isCrossfadingRef.current = false;

            }, crossfadeDuration * 1000 + 100);
    
        } catch (e) {
            console.error("Crossfade playback failed:", e);
            isCrossfadingRef.current = false;
        }
    }, [activePlayer, getTrackSrc, stopPfl]);

    // Main playback effect to load and play tracks
    useEffect(() => {
        const activePlayerRef = activePlayer === 'A' ? playerARef : playerBRef;
        const activeLoadedIdRef = activePlayer === 'A' ? playerALoadedIdRef : playerBLoadedIdRef;
        const activeUrlRef = activePlayer === 'A' ? playerAUrlRef : playerBUrlRef;

        const loadAndPlay = async () => {
             if (isPlaying) {
                stopPfl();
            }
            if (!currentItem || currentItem.type === 'marker' || currentItem.type === 'clock_start_marker' || currentItem.type === 'random_from_folder' || currentItem.type === 'random_from_tag' || currentItem.type === 'autofill_marker') {
                if (isPlaying) setIsPlaying(false);
                 setCurrentPlayingItemId(null);
                return;
            }

            const currentPlayer = activePlayerRef.current;
            if (!currentPlayer) return;

            if (activeLoadedIdRef.current !== currentItem.id) {
                currentPlayer.pause();
                
                if (activeUrlRef.current && activeUrlRef.current.startsWith('blob:')) {
                    URL.revokeObjectURL(activeUrlRef.current);
                }
                
                const src = await getTrackSrc(currentItem as Track);
                if (src) {
                    currentPlayer.src = src;
                    activeUrlRef.current = src;
                    activeLoadedIdRef.current = currentItem.id;
                    currentPlayer.load();
                } else {
                    console.error(`Could not load track: ${currentItem.title}`);
                    if (isAutoplayEnabledRef.current) handleNext(); // Fallback to simple next
                    return;
                }
            }

            if (isPlaying && currentPlayer.paused) {
                try {
                    await currentPlayer.play();
                    setCurrentPlayingItemId(currentItem.id);
                } catch (e) {
                    console.error("Playback failed:", e);
                    setIsPlaying(false);
                    setCurrentPlayingItemId(null);
                }
            } else if (!isPlaying && !currentPlayer.paused) {
                currentPlayer.pause();
            }
        };

        loadAndPlay();
        
    }, [currentItem, isPlaying, activePlayer, handleNext, getTrackSrc, stopPfl]);

    const timeline = useMemo(() => {
        const timelineMap = new Map<string, { startTime: Date, endTime: Date, duration: number, isSkipped?: boolean, shortenedBy?: number }>();
        if (playlist.length === 0) return timelineMap;

        let currentTime = new Date().getTime();
        const playingIndex = playlist.findIndex(item => item.id === currentPlayingItemId);

        if (playingIndex !== -1) {
            currentTime -= (trackProgress * 1000);
        }

        const getTrackDuration = (item: SequenceItem): number => {
            if (item.type !== 'marker' && item.type !== 'clock_start_marker' && item.type !== 'autofill_marker' && item.type !== 'random_from_folder' && item.type !== 'random_from_tag') {
                return (item as Track).duration * 1000;
            }
            return 0;
        };

        // Find the first hard marker in the future to calculate shortening
        let firstHardMarker: { item: TimeFixMarker; time: Date } | null = null;
        for (const item of playlist) {
            if (item.type === 'marker' && item.markerType === 'hard') {
                const [h, m, s] = item.time.split(':').map(Number);
                const markerTime = new Date();
                markerTime.setHours(h, m, s || 0, 0);
                if (markerTime < new Date()) {
                    markerTime.setDate(markerTime.getDate() + 1);
                }
                firstHardMarker = { item, time: markerTime };
                break;
            }
        }
        
        // Calculate forwards from current track
        let forwardTime = currentTime;
        for (let i = playingIndex; i < playlist.length; i++) {
            if (i < 0) continue;
            const item = playlist[i];
            const isSkipped = skippedItemIds.has(item.id);

            if (item.type === 'marker') {
                const [hours, minutes, seconds] = item.time.split(':').map(Number);
                const markerTimeDate = new Date(forwardTime);
                markerTimeDate.setHours(hours, minutes, seconds || 0, 0);
                
                if (markerTimeDate.getTime() < forwardTime) {
                    markerTimeDate.setDate(markerTimeDate.getDate() + 1);
                }

                if (item.markerType === 'hard') {
                    forwardTime = markerTimeDate.getTime();
                } else { // Soft marker
                    forwardTime = Math.max(forwardTime, markerTimeDate.getTime());
                }
                timelineMap.set(item.id, { startTime: new Date(forwardTime), endTime: new Date(forwardTime), duration: 0, isSkipped });

            } else {
                const originalDuration = getTrackDuration(item);
                const startTimeMs = forwardTime;
                let endTimeMs = forwardTime + (isSkipped ? 0 : originalDuration);
                let shortenedBy: number | undefined = undefined;

                if (firstHardMarker && !isSkipped && startTimeMs < firstHardMarker.time.getTime() && endTimeMs > firstHardMarker.time.getTime()) {
                    shortenedBy = (endTimeMs - firstHardMarker.time.getTime()) / 1000;
                    endTimeMs = firstHardMarker.time.getTime();
                }

                timelineMap.set(item.id, {
                    startTime: new Date(startTimeMs),
                    endTime: new Date(endTimeMs),
                    duration: (endTimeMs - startTimeMs) / 1000,
                    isSkipped,
                    shortenedBy
                });
                forwardTime = endTimeMs;
            }
        }

        // Calculate backwards from current track
        let backwardTime = currentTime;
        for (let i = playingIndex - 1; i >= 0; i--) {
            const item = playlist[i];
            const itemDuration = getTrackDuration(item);
            const startTime = new Date(backwardTime - itemDuration);
            const endTime = new Date(backwardTime);
            timelineMap.set(item.id, { startTime, endTime, duration: itemDuration / 1000 });
            backwardTime = startTime.getTime();
        }
        
        return timelineMap;
    }, [playlist, currentPlayingItemId, trackProgress, skippedItemIds]);
    const timelineRef = useRef(timeline);
    timelineRef.current = timeline;

    // Effect for player event listeners (time updates, track end)
    useEffect(() => {
        const playerA = playerARef.current;
        const playerB = playerBRef.current;

        const handleTimeUpdate = (e: Event) => {
            const player = e.target as HTMLAudioElement;
            const activePlayerRef = activePlayer === 'A' ? playerARef : playerBRef;
            if (player === activePlayerRef.current) {
                setTrackProgress(player.currentTime);

                const policy = playoutPolicyRef.current;
                if (policy.crossfadeEnabled && !isCrossfadingRef.current && player.duration > 0 && player.duration - player.currentTime < policy.crossfadeDuration) {
                     const nextAction = determineNextAction(currentTrackIndexRef.current, playlistRef.current);
                     if (nextAction.type === 'JUMP') {
                        performCrossfade(nextAction.index);
                    }
                }
            }
        };

        const handleEnded = (e: Event) => {
            const player = e.target as HTMLAudioElement;

            const duration = player.duration;
            if (!isNaN(duration) && duration > 2 && player.currentTime < duration - 2) {
                console.warn(`Ignored premature 'ended' event. CurrentTime: ${player.currentTime.toFixed(2)}, Duration: ${duration.toFixed(2)}`);
                if (player.paused) { player.play().catch(err => console.error("Could not resume stalled player:", err)); }
                return;
            }

            const activePlayerRef = activePlayer === 'A' ? playerARef : playerBRef;
            if (player !== activePlayerRef.current || isCrossfadingRef.current) return;
            
            const endedItem = playlistRef.current[currentTrackIndexRef.current];
            if (!endedItem) return;
            
            if (endedItem.type !== 'marker' && endedItem.type !== 'clock_start_marker' && endedItem.type !== 'random_from_folder' && endedItem.type !== 'random_from_tag' && endedItem.type !== 'autofill_marker') {
                setPlayoutHistory(prev => [...prev, { trackId: endedItem.id, title: endedItem.title, artist: endedItem.artist, playedAt: Date.now() }].slice(-100));
            }
            
            if (stopAfterTrackIdRef.current && stopAfterTrackIdRef.current === endedItem.id) {
                setIsPlaying(false); setStopAfterTrackId(null);
                if (remoteStudioRef.current) remoteStudioRef.current.connectMic();
                return;
            }

            // --- SOFT MARKER JUMP LOGIC ---
            const activeSoftMarkerIndex = playlistRef.current.findIndex((item, i) =>
                item.type === 'marker' && item.markerType === 'soft' && i > currentTrackIndexRef.current
            );
            
            if (activeSoftMarkerIndex !== -1) {
                const timelineData = timelineRef.current.get(playlistRef.current[activeSoftMarkerIndex].id);
                if (timelineData && timelineData.startTime <= new Date()) {
                    const nextIndexAfterMarker = findNextPlayableIndex(activeSoftMarkerIndex, 1);
                    if (nextIndexAfterMarker !== -1) {
                        setCurrentTrackIndex(nextIndexAfterMarker);
                        setActivePlayer(p => p === 'A' ? 'B' : 'A');
                        return;
                    }
                }
            }
            // --- END SOFT MARKER JUMP LOGIC ---


            if (!isAutoplayEnabledRef.current) { setIsPlaying(false); return; }

            const currentIndex = currentTrackIndexRef.current;
            const currentPlaylist = playlistRef.current;
            const policy = playoutPolicyRef.current;

            const nextAction = determineNextAction(currentIndex, currentPlaylist);
            if (policy.removePlayedTracks) {
                let nextIndex = -1;
                if(nextAction.type === 'JUMP') nextIndex = nextAction.index;
                if(nextAction.type === 'LOAD_CLOCK') nextIndex = nextAction.fromIndex;

                if (nextIndex !== -1 && nextIndex > currentIndex) {
                    const newPlaylist = currentPlaylist.slice(nextIndex);
                    setPlaylist(newPlaylist);
                    setCurrentTrackIndex(0);
                    setActivePlayer(p => p === 'A' ? 'B' : 'A');
                } else if (nextIndex !== -1) { // Loop back
                    setCurrentTrackIndex(nextIndex);
                    setActivePlayer(p => p === 'A' ? 'B' : 'A');
                } else { // Stop
                    setIsPlaying(false);
                    setCurrentPlayingItemId(null);
                    setPlaylist([]);
                }

            } else {
                switch (nextAction.type) {
                    case 'STOP': {
                        setIsPlaying(false);
                        setCurrentPlayingItemId(null);
                        setCurrentTrackIndex(0);
                        break;
                    }
                    case 'JUMP': {
                        setActivePlayer(p => p === 'A' ? 'B' : 'A');
                        setCurrentTrackIndex(nextAction.index);
                        break;
                    }
                    case 'LOAD_CLOCK': {
                        const newClockPlaylist = currentPlaylist.slice(nextAction.fromIndex);
                        const finalIndex = findNextPlayableIndex(-1, 1, newClockPlaylist);

                        setPlaylist(newClockPlaylist);
                        if (finalIndex !== -1) {
                            setActivePlayer(p => p === 'A' ? 'B' : 'A');
                            setCurrentTrackIndex(finalIndex);
                        } else {
                            setIsPlaying(false);
                            setCurrentPlayingItemId(null);
                        }
                        break;
                    }
                }
            }
        };
        
        const players = [playerA, playerB];
        players.forEach(p => { if (p) { p.addEventListener('timeupdate', handleTimeUpdate); p.addEventListener('ended', handleEnded); } });
        return () => { players.forEach(p => { if (p) { p.removeEventListener('timeupdate', handleTimeUpdate); p.removeEventListener('ended', handleEnded); } }); };
    }, [activePlayer, findNextPlayableIndex, performCrossfade, determineNextAction]);

    // Effect to manage mic send STATE based on live status for UI feedback
    useEffect(() => {
        setMixerConfig(prev => {
            // Only update if the state is different to avoid loops
            if (prev.mic.sends.main.enabled === isPresenterLive) {
                return prev;
            }
            const newConfig = JSON.parse(JSON.stringify(prev));
            newConfig.mic.sends.main.enabled = isPresenterLive;
            return newConfig;
        });
    }, [isPresenterLive]);

    // Effect to manage ducking audio ramps directly on the audio graph
    useEffect(() => {
        const graph = audioGraphRef.current;
        if (!graph.isInitialized || !graph.context || !graph.duckingGains) return;

        const now = graph.context.currentTime;
        const fadeDuration = playoutPolicy.micDuckingFadeDuration ?? 0.5;

        // --- Ducking for Main Player ---
        const mainPlayerDuckingNode = graph.duckingGains['mainPlayer_to_main'];
        if (mainPlayerDuckingNode) {
            const micMultiplier = isPresenterLive ? playoutPolicy.micDuckingLevel : 1.0;
            const cartwallMultiplier = playingCartwallId ? 0.2 : 1.0;
            const targetGain = micMultiplier * cartwallMultiplier;
            mainPlayerDuckingNode.gain.cancelScheduledValues(now);
            mainPlayerDuckingNode.gain.linearRampToValueAtTime(targetGain, now + fadeDuration);
        }

        // --- Ducking for Cartwall (only by mic) ---
        const cartwallDuckingNode = graph.duckingGains['cartwall_to_main'];
        if (cartwallDuckingNode) {
            const targetGain = isPresenterLive ? playoutPolicy.micDuckingLevel : 1.0;
            cartwallDuckingNode.gain.cancelScheduledValues(now);
            cartwallDuckingNode.gain.linearRampToValueAtTime(targetGain, now + fadeDuration);
        }
    }, [isPresenterLive, playingCartwallId, playoutPolicy.micDuckingLevel, playoutPolicy.micDuckingFadeDuration]);
    
    // PFL Ducking
    useEffect(() => {
        setMixerConfig(prev => {
            const newConfig = JSON.parse(JSON.stringify(prev));
            const monitorGain = isPflPlaying ? playoutPolicy.pflDuckingLevel : 1.0;
            newConfig.mainPlayer.sends.monitor.gain = monitorGain;
            newConfig.cartwall.sends.monitor.gain = monitorGain;
            return newConfig;
        })
    }, [isPflPlaying, playoutPolicy.pflDuckingLevel]);


    // Effect to manage GAIN of individual players during non-crossfade transitions
    useEffect(() => {
        const graph = audioGraphRef.current;
        const playerMixerNode = graph.playerMixerNode;
        if (!graph.isInitialized || !graph.context || !playerMixerNode || isCrossfadingRef.current) return;

        const now = graph.context.currentTime;
        const gainAParam = playerMixerNode.parameters.get('gainA')!;
        const gainBParam = playerMixerNode.parameters.get('gainB')!;

        if (activePlayer === 'A') {
            gainAParam.cancelScheduledValues(now);
            gainAParam.linearRampToValueAtTime(1.0, now + 0.1);
            gainBParam.cancelScheduledValues(now);
            gainBParam.linearRampToValueAtTime(0.0, now + 0.5);
        } else { // activePlayer is 'B'
            gainBParam.cancelScheduledValues(now);
            gainBParam.linearRampToValueAtTime(1.0, now + 0.1);
            gainAParam.cancelScheduledValues(now);
            gainAParam.linearRampToValueAtTime(0.0, now + 0.5);
        }
    }, [activePlayer]);

    // Effect for Hard Time Fix Markers
    useEffect(() => {
        if (!isPlaying) return;

        const timer = setInterval(() => {
            const now = new Date();
            const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
            const currentPlaylist = playlistRef.current;
            
            const markerIndex = currentPlaylist.findIndex(item => 
                item.type === 'marker' && 
                item.markerType === 'hard' && 
                item.time === currentTime &&
                item.id !== lastTriggeredMarkerIdRef.current
            );

            if (markerIndex !== -1) {
                const marker = currentPlaylist[markerIndex];
                lastTriggeredMarkerIdRef.current = marker.id;
                setTimeout(() => { if (lastTriggeredMarkerIdRef.current === marker.id) lastTriggeredMarkerIdRef.current = null; }, 61000);

                const nextPlayableIndex = findNextPlayableIndex(markerIndex, 1);
                if (nextPlayableIndex !== -1) {
                     if (playoutPolicyRef.current.crossfadeEnabled) {
                        performCrossfade(nextPlayableIndex);
                     } else {
                        const graph = audioGraphRef.current;
                        const playerMixerNode = graph.playerMixerNode;
                        const activePlayerRef = activePlayer === 'A' ? playerARef : playerBRef;
                        
                        if (graph.context && playerMixerNode) {
                            const now = graph.context.currentTime;
                            const activeParam = activePlayer === 'A' ? playerMixerNode.parameters.get('gainA')! : playerMixerNode.parameters.get('gainB')!;
                            activeParam.cancelScheduledValues(now);
                            activeParam.linearRampToValueAtTime(0, now + 0.5); // 0.5 second fade out
                            
                            setTimeout(() => {
                                activePlayerRef.current?.pause();
                                setActivePlayer(p => p === 'A' ? 'B' : 'A');
                                setCurrentTrackIndex(nextPlayableIndex);
                            }, 500);

                        } else {
                            // Fallback to hard stop if audio graph isn't ready
                            activePlayerRef.current?.pause();
                            setActivePlayer(p => p === 'A' ? 'B' : 'A');
                            setCurrentTrackIndex(nextPlayableIndex);
                        }
                     }
                }
            }
        }, 1000);

        return () => clearInterval(timer);
    }, [isPlaying, activePlayer, findNextPlayableIndex, performCrossfade]);
    
    // Effect for managing skipped items based on markers
    useEffect(() => {
        const updateSkippedItems = () => {
            const now = new Date();
            const playlist = playlistRef.current;
            const currentIndex = currentTrackIndexRef.current;

            if (!isPlayingRef.current || currentIndex < 0 || currentIndex >= playlist.length) {
                if (skippedItemIdsRef.current.size > 0) {
                    setSkippedItemIds(new Set());
                }
                return;
            }

            const newSkippedIds = new Set<string>();

            // Find the first marker of any type after the current track.
            let firstMarkerIndex = -1;
            let firstMarker: TimeFixMarker | null = null;
            for (let i = currentIndex + 1; i < playlist.length; i++) {
                const item = playlist[i];
                if (item.type === 'marker') {
                    firstMarkerIndex = i;
                    firstMarker = item;
                    break;
                }
            }
            
            if (firstMarker) {
                let shouldSkip = false;
                if (firstMarker.markerType === 'hard') {
                    // Hard markers always cause a positional skip for items before them.
                    shouldSkip = true;
                } else { // Soft marker
                    // Soft markers only skip if their time has been reached.
                    const [h, m, s] = firstMarker.time.split(':').map(Number);
                    const markerTime = new Date(now);
                    markerTime.setHours(h, m, s || 0, 0);

                    // Handle day rollover
                    if (now.getTime() - markerTime.getTime() > 12 * 60 * 60 * 1000) {
                        markerTime.setDate(markerTime.getDate() + 1);
                    }

                    if (now >= markerTime) {
                        shouldSkip = true;
                    }
                }

                if (shouldSkip) {
                    // Mark all items between the current track and the marker as skipped.
                    for (let j = currentIndex + 1; j < firstMarkerIndex; j++) {
                        newSkippedIds.add(playlist[j].id);
                    }
                }
            }

            // Compare with current state to avoid unnecessary re-renders.
            const currentSkipped = skippedItemIdsRef.current;
            if (newSkippedIds.size !== currentSkipped.size || ![...newSkippedIds].every(id => currentSkipped.has(id))) {
                setSkippedItemIds(newSkippedIds);
            }
        };

        updateSkippedItems();
        const timer = setInterval(updateSkippedItems, 2000);

        return () => clearInterval(timer);
    }, [playlist, currentTrackIndex, isPlaying]);
    
    const resolveSequenceItems = useCallback((
        items: SequenceItem[], 
        library: Folder,
        policy?: PlayoutPolicy,
        history?: PlayoutHistoryEntry[]
    ): SequenceItem[] => {
        const allTracks = getAllTracks(library);

        const resolved = items.flatMap((item): SequenceItem | SequenceItem[] => {
            if (item.type === 'marker' || item.type === 'clock_start_marker' || item.type === 'autofill_marker') {
                return [item];
            }
    
            if (item.type === 'random_from_folder') {
                const folder = findFolderInTree(library, item.folderId);
                if (!folder) return []; 
                
                let tracksInFolder = collectAllChildTracks(folder);
                if (policy && history) {
                    tracksInFolder = applySeparationPolicy(tracksInFolder, policy, history);
                }
                if (tracksInFolder.length === 0) return []; 
                
                const randomTrack = tracksInFolder[Math.floor(Math.random() * tracksInFolder.length)];
                return randomTrack ? [randomTrack] : [];
            }

            if (item.type === 'random_from_tag') {
                let taggedTracks = allTracks.filter(t => t.tags?.includes(item.tag));
                 if (policy && history) {
                    taggedTracks = applySeparationPolicy(taggedTracks, policy, history);
                }
                if (taggedTracks.length === 0) return [];

                const randomTrack = taggedTracks[Math.floor(Math.random() * taggedTracks.length)];
                return randomTrack ? [randomTrack] : [];
            }
    
            const track = findTrackInTree(library, item.id);
            return track ? [track] : [];
        });
    
        return resolved.flat().filter((i): i is SequenceItem => i !== null);
    }, []);

    // --- AUTOMATION: Unified Timeline Manager ---
    useEffect(() => {
        const timelineAutomation = () => {
            // Use refs for latest state without re-triggering the effect
            const now = new Date();
            const playlist = playlistRef.current;
            const timelineMap = timelineRef.current;
            const policy = playoutPolicyRef.current;
            const schedule = scheduleRef.current;
            const mediaLibrary = mediaLibraryRef.current;
            const playoutHistory = playoutHistoryRef.current;
            
            // --- Priority 1: Pre-load scheduled clocks ---
            for (const block of schedule) {
                if (!block.preloadTime || block.preloadTime <= 0) continue;

                const blockStartTime = new Date();
                blockStartTime.setHours(block.hour, 0, 0, 0);

                // If block hour is in the past for today, assume it's for tomorrow
                if (blockStartTime < now) {
                    blockStartTime.setDate(blockStartTime.getDate() + 1);
                }
                
                // Check if this specific clock instance has already been loaded
                const hasBeenLoaded = playlist.some(item => 
                    item.type === 'clock_start_marker' && 
                    item.hour === block.hour &&
                    timelineMap.get(item.id)?.startTime.toDateString() === blockStartTime.toDateString()
                );
                
                if (hasBeenLoaded) continue;

                const preloadTimestamp = blockStartTime.getTime() - (block.preloadTime * 60 * 1000);

                if (now.getTime() >= preloadTimestamp) {
                    console.log(`[Automation] Pre-loading clock for ${block.hour}:00`);
                    let generatedPlaylist: SequenceItem[] = [];
                    const durationToGenerateSecs = 3600;

                    if (block.type === 'sequence' && block.sequenceItems) {
                        generatedPlaylist = resolveSequenceItems(block.sequenceItems, mediaLibrary, policy, playoutHistory);
                    } else if (block.type === 'folder' && block.folderId) {
                        generatedPlaylist = generatePlaylistFromFolder(block.folderId, mediaLibrary, policy, playoutHistory, durationToGenerateSecs);
                    }
                    
                    if (generatedPlaylist.length > 0) {
                        const newMarker: ClockStartMarker = {
                            id: `clock-start-${block.hour}-${blockStartTime.getTime()}`,
                            type: 'clock_start_marker', hour: block.hour, title: block.title || 'Scheduled Playlist', loadMode: block.loadMode || 'soft',
                        };
                        const finalPlaylist = [newMarker, ...generatedPlaylist];
                        setPlaylist(prev => [...prev, ...finalPlaylist]);
                        // Action taken, exit for this cycle
                        return; 
                    }
                }
            }

            // --- Priority 2: Auto-fill if playlist is running short ---
            if (!policy.autoFillPlaylist) {
                return;
            }

            let playlistEndTime = new Date(now.getTime());
            if (playlist.length > 0) {
                const lastItemId = playlist[playlist.length - 1].id;
                const lastItemTiming = timelineMap.get(lastItemId);
                if (lastItemTiming) {
                    playlistEndTime = lastItemTiming.endTime;
                } else {
                    // If timing info isn't ready, wait for the next cycle.
                    return;
                }
            }
            
            const remainingDurationMs = playlistEndTime.getTime() - now.getTime();
            const lookaheadMs = policy.autoFillLookahead * 60 * 1000;

            if (remainingDurationMs > lookaheadMs) {
                // Playlist is long enough, no need to auto-fill yet.
                return;
            }
            
            // Determine the point in time we need to generate content for.
            const generationPointInTime = playlist.length > 0 ? new Date(playlistEndTime.getTime() + 1000) : now;
            const hourToGenerate = generationPointInTime.getHours();
            const dateToGenerate = generationPointInTime;

            // PREVENT AUTO-FILL COLLISION: Check if the hour we're about to fill has a scheduled block.
            const blockForNextHour = findBlockForHour(schedule, hourToGenerate, dateToGenerate);
            if (blockForNextHour) {
                console.log(`[Automation] Auto-fill paused. A scheduled block is coming up for ${hourToGenerate}:00.`);
                return; // Let the pre-loader handle the upcoming scheduled block.
            }
            
            // Check if the last item added was an autofill marker for this hour, to prevent duplicates
            const lastItem = playlist.length > 0 ? playlist[playlist.length - 1] : null;
            if(lastItem && lastItem.type === 'autofill_marker' && lastItem.title.includes(`${String(hourToGenerate).padStart(2, '0')}:00`)) {
                return;
            }

            console.log(`[Automation] Playlist is short. Auto-filling for ${hourToGenerate}:00`);

            // Calculate duration to fill until the end of the current hour.
            const endOfHour = new Date(generationPointInTime);
            endOfHour.setHours(generationPointInTime.getHours() + 1, 0, 0, 0);
            const durationToGenerateSecs = Math.max(0, (endOfHour.getTime() - generationPointInTime.getTime()) / 1000);

            if (durationToGenerateSecs < 60) { // Don't bother filling less than a minute.
                return;
            }

            let generatedPlaylist = generatePlaylistFromTags(policy.autoFillTags, mediaLibrary, policy, playoutHistory, durationToGenerateSecs);
            
            if (generatedPlaylist.length > 0) {
                const newMarker: AutoFillMarker = {
                    id: `autofill-${hourToGenerate}-${Date.now()}`,
                    type: 'autofill_marker',
                    title: `Auto-filled for ${String(hourToGenerate).padStart(2, '0')}:00`
                };
                
                const newAutoFilledIds = new Set(generatedPlaylist.map(t => t.id));
                setAutoFilledItemIds(prev => new Set([...prev, ...newAutoFilledIds]));

                const finalPlaylist = [newMarker, ...generatedPlaylist];
                setPlaylist(prev => [...prev, ...finalPlaylist]);
            }
        };

        // Run automation shortly after startup and then on a regular interval.
        const initialTimeout = setTimeout(timelineAutomation, 5000);
        const interval = setInterval(timelineAutomation, 10000); // Check every 10 seconds

        return () => {
            clearTimeout(initialTimeout);
            clearInterval(interval);
        };
    }, [resolveSequenceItems]);


    // Effect for Hard Clock Execution
    useEffect(() => {
        if (!isPlaying) return;

        const timer = setInterval(() => {
            const now = new Date();
            // Trigger at the top of the hour
            if (now.getMinutes() !== 0 || now.getSeconds() > 2) return;

            const currentPlaylist = playlistRef.current;
            const markerIndex = currentPlaylist.findIndex(item =>
                item.type === 'clock_start_marker' &&
                item.hour === now.getHours() &&
                item.loadMode === 'hard'
            );

            if (markerIndex !== -1 && markerIndex > 0) { // Ensure it's not the very first item
                const newPlaylist = currentPlaylist.slice(markerIndex);
                const nextPlayableIndexInNew = findNextPlayableIndex(-1, 1, newPlaylist);

                if (nextPlayableIndexInNew !== -1) {
                    if (playoutPolicyRef.current.crossfadeEnabled) {
                        const absoluteNextIndex = markerIndex + nextPlayableIndexInNew;
                        performCrossfade(absoluteNextIndex);

                        // Schedule playlist update after crossfade completes
                        setTimeout(() => {
                            setPlaylist(newPlaylist);
                            setCurrentTrackIndex(nextPlayableIndexInNew);
                        }, (playoutPolicyRef.current.crossfadeDuration * 1000) + 150);
                    } else {
                         performHardLoad(newPlaylist, true);
                    }
                }
            }
        }, 1000);

        return () => clearInterval(timer);
    }, [isPlaying, activePlayer, findNextPlayableIndex, performCrossfade, performHardLoad]);

    // --- NEW AUDIO MIXER EFFECTS ---

    // Effect to connect mic stream to graph
    const handleMicStream = useCallback((stream: MediaStream | null) => {
        const graph = audioGraphRef.current;
        if (graph.isInitialized && graph.context) {
            // Disconnect old source if it exists
            if (graph.sources.mic) {
                graph.sources.mic.disconnect();
            }

            if (stream) {
                try {
                    const micSource = graph.context.createMediaStreamSource(stream);
                    micSource.connect(graph.sourceGains.mic!);
                    graph.sources.mic = micSource;
                } catch (e) {
                    console.error("Error creating mic audio source:", e);
                }
            } else {
                delete graph.sources.mic;
            }
        }
    }, []);

    // Effect to sync mixer state to Web Audio nodes
    useEffect(() => {
        const graph = audioGraphRef.current;
        if (!graph.isInitialized || !graph.context) return;
        const now = graph.context.currentTime;
        
        // Sync source gains
        for (const sourceId in mixerConfig) {
            const gainNode = graph.sourceGains[sourceId as AudioSourceId];
            if (gainNode) {
                const config = mixerConfig[sourceId as AudioSourceId];
                const targetGain = config.muted ? 0 : config.gain;
                if(Math.abs(gainNode.gain.value - targetGain) > 0.01) {
                   gainNode.gain.linearRampToValueAtTime(targetGain, now + 0.05);
                }
            }
        }

        // Sync bus gains
        audioBuses.forEach(bus => {
            const gainNode = graph.busGains[bus.id];
            if (gainNode) {
                const targetGain = bus.muted ? 0 : bus.gain;
                if(Math.abs(gainNode.gain.value - targetGain) > 0.01) {
                    gainNode.gain.linearRampToValueAtTime(targetGain, now + 0.05);
                }
            }
        });

        // Sync routing gains
        for (const routingId in graph.routingGains) {
            const [sourceId, , busId] = routingId.split('_') as [AudioSourceId, 'to', AudioBusId];
            const gainNode = graph.routingGains[routingId as keyof typeof graph.routingGains];
            if (gainNode) {
                const sendConfig = mixerConfig[sourceId]?.sends[busId];
                const targetGain = sendConfig?.enabled ? sendConfig.gain : 0;
                 if(Math.abs(gainNode.gain.value - targetGain) > 0.01) {
                    gainNode.gain.linearRampToValueAtTime(targetGain, now + 0.05);
                }
            }
        }

    }, [mixerConfig, audioBuses]);
    
    // Effect to set output devices for buses
    useEffect(() => {
        const busPlayers = {
            main: mainBusAudioRef.current,
            monitor: monitorBusAudioRef.current,
        };
        audioBuses.forEach(bus => {
            const player = busPlayers[bus.id];
            if (player && typeof (player as any).setSinkId === 'function') {
                (player as any).setSinkId(bus.outputDeviceId).catch((e: Error) => {
                    if (e.name !== "NotAllowedError") console.error(`Failed to set sinkId for ${bus.name}`, e);
                });
            }
        });
    }, [audioBuses]);

    // Update audio graph settings when policy changes (EQ, Normalization)
    useEffect(() => {
        const graph = audioGraphRef.current;
        if (!graph.isInitialized || !graph.context) return;
        const { context } = graph;
        const now = context.currentTime;
        const RAMP_TIME = 0.05;

        // Master Output Processing (Main Bus only)
        if (graph.mainBusCompressor) {
            const { normalizationEnabled, normalizationTargetDb } = playoutPolicy;
            const compressor = graph.mainBusCompressor;

            compressor.threshold.linearRampToValueAtTime(normalizationEnabled ? normalizationTargetDb : 0, now + RAMP_TIME);
            compressor.knee.linearRampToValueAtTime(normalizationEnabled ? 5 : 0, now + RAMP_TIME);
            compressor.ratio.linearRampToValueAtTime(normalizationEnabled ? 12 : 1, now + RAMP_TIME);
            compressor.attack.setValueAtTime(0.003, now);
            compressor.release.setValueAtTime(0.25, now);
        }
        
        if (graph.mainBusEq) {
            const { equalizerEnabled, equalizerBands } = playoutPolicy;
            const eq = graph.mainBusEq;

            eq.bass.gain.linearRampToValueAtTime(equalizerEnabled ? equalizerBands.bass : 0, now + RAMP_TIME);
            eq.mid.gain.linearRampToValueAtTime(equalizerEnabled ? equalizerBands.mid : 0, now + RAMP_TIME);
            eq.treble.gain.linearRampToValueAtTime(equalizerEnabled ? equalizerBands.treble : 0, now + RAMP_TIME);
        }
    }, [playoutPolicy]);


    useEffect(() => {
        const writeNowPlaying = async () => {
            if (!isNowPlayingExportEnabled || !nowPlayingFileHandleRef.current) {
                if (nowPlayingFileHandleRef.current) {
                     const writable = await nowPlayingFileHandleRef.current.createWritable();
                     await writable.write('');
                     await writable.close();
                }
                return;
            }
            
            let text = 'Silence';
            if (isPlaying && currentTrack) {
                const suppression = getSuppressionSettings(currentTrack.id, mediaLibrary);
                if (suppression?.enabled) {
                    text = suppression.customText || 'radiohost.cloud';
                } else {
                    text = metadataFormat
                        .replace(/%artist%/g, currentTrack.artist || '')
                        .replace(/%title%/g, currentTrack.title || '');
                }
            }
            
            try {
                const writable = await nowPlayingFileHandleRef.current.createWritable();
                await writable.write(text);
                await writable.close();
            } catch (e) {
                console.error("Failed to write to 'Now Playing' file:", e);
            }
        };

        writeNowPlaying();
    }, [isPlaying, currentTrack, isNowPlayingExportEnabled, mediaLibrary, metadataFormat]);
    
    // --- PFL Handler and Effects ---
    const handlePflTrack = useCallback(async (trackId: string) => {
        const player = pflAudioRef.current;
        if (!player) return;

        // If clicking the same track that is already PFL-ing, stop it.
        if (pflTrackId === trackId) {
            stopPfl();
            return;
        }

        // Stop any currently playing PFL track before starting the new one.
        if (isPflPlaying) {
            stopPfl(); // This resets state synchronously
        }

        const graph = audioGraphRef.current;
        if (graph.context && graph.context.state === 'suspended') {
            await graph.context.resume();
        }

        const track = findTrackInTree(mediaLibraryRef.current, trackId);
        if (!track) {
            console.error("PFL track not found in library:", trackId);
            return;
        }
        
        const src = await getTrackSrc(track);
        if (src) {
            if (pflAudioUrlRef.current && pflAudioUrlRef.current.startsWith('blob:')) {
                URL.revokeObjectURL(pflAudioUrlRef.current);
            }
            player.src = src;
            pflAudioUrlRef.current = src;
            try {
                await player.play();
                setPflTrackId(track.id);
                setIsPflPlaying(true);
            } catch (e) {
                console.error("PFL playback failed:", e);
                stopPfl();
            }
        } else {
            console.error(`Could not load PFL track: ${track.title}`);
            stopPfl();
        }
    }, [getTrackSrc, isPflPlaying, pflTrackId, stopPfl]);

    useEffect(() => {
        const player = pflAudioRef.current;
        if (!player) return;

        const handleTimeUpdate = () => {
            setPflProgress(player.currentTime);
        };

        const handleEnded = () => {
            // This is for when looping glitches; ensures state is correct.
            setPflProgress(0);
        };
        
        player.addEventListener('timeupdate', handleTimeUpdate);
        player.addEventListener('ended', handleEnded);

        return () => {
            player.removeEventListener('timeupdate', handleTimeUpdate);
            player.removeEventListener('ended', handleEnded);
        };
    }, []);


    // --- Playlist & Library Handlers ---
    const handleAddToPlaylist = useCallback((track: Track) => {
        setPlaylist(prev => [...prev, track]);
    }, []);

    const handleInsertTrackInPlaylist = useCallback((track: Track, beforeItemId: string | null) => {
        setPlaylist(prev => {
            const newPlaylist = [...prev];
            const insertIndex = beforeItemId ? newPlaylist.findIndex(item => item.id === beforeItemId) : newPlaylist.length;

            if (insertIndex !== -1) {
                newPlaylist.splice(insertIndex, 0, track);
            } else {
                newPlaylist.push(track);
            }
            
            if (currentPlayingItemId) {
                 const newCurrentIndex = newPlaylist.findIndex(item => item.id === currentPlayingItemId);
                 if (newCurrentIndex !== -1) {
                     setCurrentTrackIndex(newCurrentIndex);
                 }
            }
            
            return newPlaylist;
        });
    }, [currentPlayingItemId]);

    const handleRemoveFromPlaylist = useCallback((itemIdToRemove: string) => {
        const oldPlaylist = playlistRef.current;
        const itemToRemove = oldPlaylist.find(item => item.id === itemIdToRemove);
        
        // Memory cleanup
        if (itemToRemove) {
            const track = itemToRemove as Track;
            if (track.src && track.src.startsWith('blob:')) {
                URL.revokeObjectURL(track.src);
            }
        }
        
        const newPlaylist = oldPlaylist.filter(item => item.id !== itemIdToRemove);

        setPlaylist(newPlaylist);

        if (currentPlayingItemId) {
            if (currentPlayingItemId === itemIdToRemove) {
                setIsPlaying(false);
                setCurrentPlayingItemId(null);
                const firstPlayable = findNextPlayableIndex(-1, 1, newPlaylist);
                setCurrentTrackIndex(firstPlayable > -1 ? firstPlayable : 0);
            } else {
                const newIndex = newPlaylist.findIndex(item => item.id === currentPlayingItemId);
                if (newIndex !== -1) {
                    setCurrentTrackIndex(newIndex);
                }
            }
        }
    }, [currentPlayingItemId, findNextPlayableIndex]);

    const handleReorderPlaylist = useCallback((draggedId: string, dropTargetId: string | null) => {
        setPlaylist(prev => {
            const newPlaylist = [...prev];
            const dragIndex = newPlaylist.findIndex(item => item.id === draggedId);
            if (dragIndex === -1) return prev;

            const [draggedItem] = newPlaylist.splice(dragIndex, 1);
            
            const dropIndex = dropTargetId ? newPlaylist.findIndex(item => item.id === dropTargetId) : newPlaylist.length;
            
            if (dropIndex === -1) {
                newPlaylist.push(draggedItem);
            } else {
                newPlaylist.splice(dropIndex, 0, draggedItem);
            }

            if (currentPlayingItemId) {
                const newCurrentIndex = newPlaylist.findIndex(item => item.id === currentPlayingItemId);
                if (newCurrentIndex !== -1) {
                    setCurrentTrackIndex(newCurrentIndex);
                }
            }
            return newPlaylist;
        });
    }, [currentPlayingItemId]);


    const handleClearPlaylist = useCallback(() => {
        // Memory cleanup before clearing
        playlistRef.current.forEach(item => {
            const track = item as Track;
            if (track.src && track.src.startsWith('blob:')) {
                URL.revokeObjectURL(track.src);
            }
        });

        // If there is a current item (playing or paused), keep it.
        if (currentItem) {
            setPlaylist([currentItem]);
            setCurrentTrackIndex(0);
        } else {
            // If the playlist is empty or has no valid "current" item, clear everything.
            setPlaylist([]);
            setCurrentTrackIndex(0);
            setCurrentPlayingItemId(null);
            setIsPlaying(false);
            setTrackProgress(0);
            setStopAfterTrackId(null);
        }
         setAutoFilledItemIds(new Set());
    }, [currentItem]);

    const handleToggleAutoFill = useCallback(() => {
        setPlayoutPolicy(p => ({ ...p, autoFillPlaylist: !p.autoFillPlaylist }));
    }, []);

    const handleAddTracksToLibrary = useCallback((tracks: Track[], destinationFolderId: string) => {
        setMediaLibrary(prevLibrary => addMultipleItemsToTree(prevLibrary, destinationFolderId, tracks));
    }, []);

    const handleAddUrlTrackToLibrary = useCallback((track: Track, destinationFolderId: string) => {
        setMediaLibrary(prevLibrary => addItemToTree(prevLibrary, destinationFolderId, track));
    }, []);
    
    const handleRemoveFromLibrary = useCallback(async (id: string) => {
        const item = findTrackInTree(mediaLibrary, id);
        if (item) {
             await deleteTrackFromDB(id);
        }
        setMediaLibrary(prev => removeItemFromTree(prev, id));
    }, [mediaLibrary]);

    const handleRemoveMultipleFromLibrary = useCallback(async (ids: string[]) => {
        for(const id of ids){
            await deleteTrackFromDB(id);
        }
        setMediaLibrary(prev => removeItemsFromTree(prev, new Set(ids)));
    }, []);

    const handleCreateFolder = useCallback((parentId: string, folderName: string) => {
        const newFolder: Folder = {
            id: `folder-${Date.now()}`,
            name: folderName,
            type: 'folder',
            children: [],
        };
        setMediaLibrary(prev => addItemToTree(prev, parentId, newFolder));
    }, []);

    const handleMoveItemInLibrary = useCallback((itemId: string, destinationFolderId: string) => {
        setMediaLibrary(prev => {
            const { updatedNode, foundItem } = findAndRemoveItem(prev, itemId);
            if (foundItem) {
                return addItemToTree(updatedNode, destinationFolderId, foundItem);
            }
            return prev;
        });
    }, []);

    const handleUpdateFolderMetadataSettings = useCallback((folderId: string, settings: { enabled: boolean; customText?: string; suppressDuplicateWarning?: boolean }) => {
        setMediaLibrary(prevLibrary =>
            updateFolderInTree(prevLibrary, folderId, folder => ({
                ...folder,
                suppressMetadata: settings,
            }))
        );
    }, []);

    const handleUpdateTrackMetadata = useCallback((trackId: string, newMetadata: { title: string; artist: string; type: TrackType }) => {
        setMediaLibrary(prevLibrary =>
            updateTrackInTree(prevLibrary, trackId, track => ({
                ...track,
                ...newMetadata,
            }))
        );
    }, []);

    const handleUpdateTrackTags = useCallback((trackId: string, tags: string[]) => {
        setMediaLibrary(prevLibrary =>
            updateTrackInTree(prevLibrary, trackId, track => ({
                ...track,
                tags: tags.length > 0 ? tags.sort() : undefined,
            }))
        );
    }, []);
    
    const handleUpdateFolderTags = useCallback((folderId: string, newTags: string[]) => {
        let oldTags: string[] = [];
        const targetFolder = findFolderInTree(mediaLibrary, folderId);
        if (targetFolder) {
            oldTags = targetFolder.tags || [];
        }

        const oldTagsSet = new Set(oldTags);
        const newTagsSet = new Set(newTags);

        const tagsToAdd = newTags.filter(tag => !oldTagsSet.has(tag));
        const tagsToRemove = oldTags.filter(tag => !newTagsSet.has(tag));

        if (tagsToAdd.length === 0 && tagsToRemove.length === 0) {
            setMediaLibrary(prevLibrary =>
                updateFolderInTree(prevLibrary, folderId, folder => ({
                    ...folder,
                    tags: newTags.length > 0 ? newTags.sort() : undefined,
                }))
            );
            return;
        }
        
        const applyTagChangesRecursively = (item: LibraryItem): LibraryItem => {
            const currentTags = new Set(item.tags || []);
            tagsToRemove.forEach(tag => currentTags.delete(tag));
            tagsToAdd.forEach(tag => currentTags.add(tag));
            
            const sortedTags = Array.from(currentTags).sort();
            const newItem: LibraryItem = { 
                ...item, 
                tags: sortedTags.length > 0 ? sortedTags : undefined 
            };
            
            if (newItem.type === 'folder') {
                newItem.children = newItem.children.map(applyTagChangesRecursively);
            }
            
            return newItem;
        };

        setMediaLibrary(prevLibrary => 
            updateFolderInTree(prevLibrary, folderId, folder => {
                const updatedFolder = { ...folder, tags: newTags.length > 0 ? newTags.sort() : undefined };
                updatedFolder.children = updatedFolder.children.map(applyTagChangesRecursively);
                return updatedFolder;
            })
        );
    }, [mediaLibrary]);

    const handleAddMarker = useCallback((data: { time: string; markerType: 'hard' | 'soft', title?: string, index?: number }) => {
        const newMarker: TimeFixMarker = {
            id: `marker-${Date.now()}`,
            type: 'marker',
            time: data.time,
            markerType: data.markerType,
            title: data.title,
        };
        setPlaylist(prev => {
            const newPlaylist = [...prev];
            const insertIndex = data.index ?? (prev.length > 0 ? currentTrackIndexRef.current + 1 : 0);
            newPlaylist.splice(insertIndex, 0, newMarker);
            return newPlaylist;
        });
    }, []);

    const handleUpdateMarker = useCallback((markerId: string, data: { time: string; markerType: 'hard' | 'soft', title?: string }) => {
        setPlaylist(prev => prev.map(item => {
            if (item.id === markerId && item.type === 'marker') {
                return { ...item, ...data };
            }
            return item;
        }));
    }, []);

    const handleUpdateScheduleBlock = useCallback((block: ScheduledBlock) => {
        setSchedule(prevSchedule => {
            const existingIndex = prevSchedule.findIndex(b => b.id === block.id);
            if (existingIndex !== -1) {
                // Update existing
                const newSchedule = [...prevSchedule];
                newSchedule[existingIndex] = block;
                return newSchedule;
            } else {
                // Add new
                return [...prevSchedule, block];
            }
        });
    }, []);

    const handleClearScheduleBlock = useCallback((id: string) => {
        setSchedule(p => p.filter(b => b.id !== id));
    }, []);
    
    const handleLoadPlaylistFromSchedule = useCallback(async (hour: number) => {
        const block = findBlockForHour(schedule, hour, new Date());
        if (!block) {
            alert(`No schedule found for ${hour}:00 on the selected date.`);
            return;
        }

        let generatedPlaylist: SequenceItem[] = [];

        if (block.type === 'sequence' && block.sequenceItems) {
            generatedPlaylist = resolveSequenceItems(block.sequenceItems, mediaLibrary);
        } else if (block.type === 'folder' && block.folderId) {
            generatedPlaylist = generatePlaylistFromFolder(block.folderId, mediaLibrary, playoutPolicy, playoutHistory);
        }

        const initialDuration = generatedPlaylist.reduce((sum, item) => {
            if (item.type !== 'marker' && item.type !== 'clock_start_marker' && item.type !== 'random_from_folder' && item.type !== 'random_from_tag' && item.type !== 'autofill_marker') {
                return sum + (item as Track).duration;
            }
            return sum;
        }, 0);
    
        if (playoutPolicy.autoFillPlaylist && initialDuration > 0 && initialDuration < 3600) {
            const remainingDuration = 3600 - initialDuration;
            const autoTracks = generatePlaylistFromTags(playoutPolicy.autoFillTags, mediaLibrary, playoutPolicy, playoutHistory, remainingDuration);

            if (autoTracks.length > 0) {
                const autoFillMarker: AutoFillMarker = {
                    id: `autofill-${Date.now()}`,
                    type: 'autofill_marker',
                    title: `Auto-filled from '${playoutPolicy.autoFillTags.join(', ')}' tag(s)`
                };
                generatedPlaylist = [...generatedPlaylist, autoFillMarker, ...autoTracks];
            }
        }

        if (generatedPlaylist.length === 0) {
            alert(`Could not generate a playlist for ${hour}:00. The folder might be empty or the sequence contains deleted tracks.`);
            return;
        }

        setPlaylistLoadRequest({ hour, generatedPlaylist });
    }, [schedule, mediaLibrary, playoutPolicy, playoutHistory, resolveSequenceItems]);

    const confirmLoadPlaylist = useCallback(() => {
        if (!playlistLoadRequest) return;
        performHardLoad(playlistLoadRequest.generatedPlaylist, isPlaying);
        setPlaylistLoadRequest(null);
    }, [playlistLoadRequest, isPlaying, performHardLoad]);

    // Auth Handlers
    const handleLogin = useCallback((email: string) => {
        localStorage.setItem(CURRENT_USER_SESSION_KEY, email);
        window.location.reload();
    }, []);
    const handleSignup = useCallback((email: string) => {
        localStorage.setItem(CURRENT_USER_SESSION_KEY, email);
        window.location.reload();
    }, []);
    const handleLogout = useCallback(() => {
        localStorage.removeItem(CURRENT_USER_SESSION_KEY);
        window.location.reload();
    }, []);

    const handleLogoChange = useCallback((file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const dataUrl = e.target?.result as string;
            setLogoSrc(dataUrl);

            // Also update header gradient
            const img = new Image();
            img.onload = () => {
                const colors = getProminentColors(img);
                setHeaderGradient(`linear-gradient(135deg, ${colors[0]} 0%, ${colors[1]} 100%)`);
            };
            img.src = dataUrl;
        };
        reader.readAsDataURL(file);
    }, []);

    // --- Resizer Logic ---
    const handleMouseDown = useCallback((index: number) => (e: React.MouseEvent) => {
        e.preventDefault();

        const handleMouseMove = (moveEvent: MouseEvent) => {
            setColumnWidths(currentWidths => {
                if (!mainRef.current) return currentWidths;

                const mainRect = mainRef.current.getBoundingClientRect();
                const totalWidth = mainRect.width;
                
                const mouseX = moveEvent.clientX;
                if (mouseX < mainRect.left || mouseX > mainRect.right) return currentWidths;

                const mousePercent = ((mouseX - mainRect.left) / totalWidth) * 100;

                let leadingWidth = 0;
                for (let i = 0; i < index; i++) {
                    leadingWidth += currentWidths[i];
                }
                
                let newLeftWidth = mousePercent - leadingWidth;
                
                const combinedWidth = currentWidths[index] + currentWidths[index + 1];
                let newRightWidth = combinedWidth - newLeftWidth;

                const minWidthPercent = 15;

                if (newLeftWidth < minWidthPercent) {
                    newLeftWidth = minWidthPercent;
                    newRightWidth = combinedWidth - newLeftWidth;
                } else if (newRightWidth < minWidthPercent) {
                    newRightWidth = minWidthPercent;
                    newLeftWidth = combinedWidth - newRightWidth;
                }

                const newWidths = [...currentWidths];
                newWidths[index] = newLeftWidth;
                newWidths[index + 1] = newRightWidth;
                return newWidths;
            });
        };

        const handleMouseUp = () => {
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
        
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp, { once: true });

    }, []);
    
    // --- Settings Handlers ---
    const handleSetNowPlayingFile = useCallback(async () => {
        if (!('showSaveFilePicker' in window)) {
            alert("Your browser doesn't support the File System Access API. This feature is only available in modern browsers like Chrome or Edge.");
            return;
        }
        try {
            const handle = await (window as any).showSaveFilePicker({
                types: [{
                    description: 'Text Files',
                    accept: { 'text/plain': ['.txt'] },
                }],
            });
            if (await verifyPermission(handle)) {
                nowPlayingFileHandleRef.current = handle;
                setNowPlayingFileName(handle.name);
                await setConfig('nowPlayingFileHandle', handle);
                await setConfig('nowPlayingFileName', handle.name);
            }
        } catch (err) {
            if ((err as Error).name !== 'AbortError') {
                console.error("Error setting 'Now Playing' file:", err);
            }
        }
    }, []);
    
    // --- Cartwall Handlers ---
    useEffect(() => {
        const player = cartwallAudioRef.current;
        if (!player) return;
        const onEnded = () => {
            setPlayingCartwallId(null);
            setCartwallTrackProgress(0);
            setCartwallTrackDuration(0);
        };
        const onTimeUpdate = () => {
            setCartwallTrackProgress(player.currentTime);
        };
        const onLoadedMetadata = () => {
            setCartwallTrackDuration(player.duration);
        };
        player.addEventListener('ended', onEnded);
        player.addEventListener('timeupdate', onTimeUpdate);
        player.addEventListener('loadedmetadata', onLoadedMetadata);
        return () => {
            player.removeEventListener('ended', onEnded);
            player.removeEventListener('timeupdate', onTimeUpdate);
            player.removeEventListener('loadedmetadata', onLoadedMetadata);
        };
    }, []);

    const handlePlayCartwallItem = useCallback(async (cartId: string, trackId: string) => {
        const player = cartwallAudioRef.current;
        if (!player) return;

        if (playingCartwallId === cartId) {
            player.pause();
            player.currentTime = 0;
            setPlayingCartwallId(null);
            setCartwallTrackProgress(0);
            setCartwallTrackDuration(0);
        } else {
            const track = findTrackInTree(mediaLibraryRef.current, trackId);
            if (!track) return;

            if (playingCartwallId) player.pause();
            
            setCartwallTrackProgress(0);
            setCartwallTrackDuration(0);

            const src = await getTrackSrc(track);
            if(src) {
                if (cartwallAudioUrlRef.current && cartwallAudioUrlRef.current.startsWith('blob:')) {
                    URL.revokeObjectURL(cartwallAudioUrlRef.current);
                }
                player.src = src;
                cartwallAudioUrlRef.current = src;
                player.load();
                try {
                    await player.play();
                    setPlayingCartwallId(cartId);
                } catch (e) { console.error("Cartwall play failed", e); }
            }
        }
    }, [getTrackSrc, playingCartwallId]);

    const handleAssignCartwallItem = useCallback((categoryId: string, cartId: string, track: Track) => {
        setCartwallCategories(prev => prev.map(cat => 
            cat.id !== categoryId ? cat : { ...cat, items: cat.items.map(item => item.id === cartId ? { ...item, trackId: track.id } : item) }
        ));
    }, []);

    const handleClearCartwallItem = useCallback((categoryId: string, cartId: string) => {
         setCartwallCategories(prev => prev.map(cat => 
            cat.id !== categoryId ? cat : { ...cat, items: cat.items.map(item => item.id === cartId ? { ...item, trackId: null, color: undefined } : item) }
        ));
    }, []);

    const handleSetCartwallItemColor = useCallback((categoryId: string, cartId: string, color: string | undefined) => {
        setCartwallCategories(prev => prev.map(cat => 
            cat.id !== categoryId ? cat : { ...cat, items: cat.items.map(item => item.id === cartId ? { ...item, color } : item) }
        ));
    }, []);

    const handleAddCartwallCategory = useCallback((name: string) => {
        const activeCategory = cartwallCategoriesRef.current.find(c => c.id === activeCartwallCategoryId);
        const newCategory: CartwallCategory = {
            id: `cat-${Date.now()}`,
            name,
            items: activeCategory?.items.map((_, i) => ({ id: `cart-${name.replace(/\s+/g, '-')}-${i}`, trackId: null })) || createInitialCartwall()[0].items
        };
        setCartwallCategories(prev => {
            const newCategories = [...prev, newCategory];
            setActiveCartwallCategoryId(newCategory.id);
            return newCategories;
        });
    }, [activeCartwallCategoryId]);
    
    const handleRenameCartwallCategory = useCallback((categoryId: string, newName: string) => {
        setCartwallCategories(prev => prev.map(cat => cat.id === categoryId ? { ...cat, name: newName } : cat));
    }, []);

    const handleDeleteCartwallCategory = useCallback((categoryId: string) => {
        setCartwallCategories(prev => {
            const newCategories = prev.filter(cat => cat.id !== categoryId);
            if (activeCartwallCategoryId === categoryId) {
                setActiveCartwallCategoryId(newCategories[0]?.id || null);
            }
            return newCategories;
        });
    }, [activeCartwallCategoryId]);

    const handleSetCartwallItemCount = useCallback((count: number) => {
        const cleanCount = Math.max(1, Math.min(100, count));
        const activeCatId = activeCartwallCategoryId;
        setCartwallCategories(prev => prev.map(cat => {
            if (cat.id !== activeCatId) return cat;
            const currentItems = cat.items;
            const currentCount = currentItems.length;
            if (cleanCount > currentCount) {
                const newItems = Array.from({ length: cleanCount - currentCount }, (_, i) => ({
                    id: `cart-${cat.id}-${currentCount + i}`,
                    trackId: null,
                }));
                return { ...cat, items: [...currentItems, ...newItems] };
            } else {
                return { ...cat, items: currentItems.slice(0, cleanCount) };
            }
        }));
    }, [activeCartwallCategoryId]);

    // --- Collapsible UI Logic ---
    const handleToggleLibraryCollapse = useCallback(() => {
        setIsLibraryCollapsed(p => !p);
    }, []);

    const displayedColumnWidths = useMemo(() => {
        if (isLibraryCollapsed) {
            const [libWidth, playlistWidth, rightColWidth] = columnWidths;
            const totalRemaining = playlistWidth + rightColWidth;
            if (libWidth > 0 && totalRemaining > 0) {
                const newPlaylistWidth = playlistWidth + (libWidth * (playlistWidth / totalRemaining));
                const newRightColWidth = rightColWidth + (libWidth * (rightColWidth / totalRemaining));
                return [0, newPlaylistWidth, newRightColWidth];
            }
            return [0, 70, 30]; // Fallback
        }
        return columnWidths;
    }, [isLibraryCollapsed, columnWidths]);

    // --- Data Backup & Export ---
    const generateBackupData = useCallback(() => {
        const user = currentUserRef.current;
        const playlistToSave = playlistRef.current.filter(item => {
            if (item.type !== 'marker' && item.type !== 'clock_start_marker' && item.type !== 'random_from_folder' && item.type !== 'random_from_tag' && item.type !== 'autofill_marker' && item.type === TrackType.LOCAL_FILE) {
                return false;
            }
            return true;
        });
        const settingsToSave = { 
            playoutPolicy: playoutPolicyRef.current, isAutoplayEnabled: isAutoplayEnabledRef.current,
            logoSrc, headerGradient, isNowPlayingExportEnabled, metadataFormat, columnWidths,
            isMicPanelCollapsed, isHeaderCollapsed, isLibraryCollapsed, isAutoBackupEnabled, 
            isAutoBackupOnStartupEnabled, autoBackupInterval,
        };
        
        return {
            type: "radiohost.cloud_backup",
            version: 1,
            timestamp: new Date().toISOString(),
            userType: user ? 'user' : 'guest',
            email: user?.email || null,
            data: {
                library: mediaLibraryRef.current,
                settings: settingsToSave,
                playlist: playlistToSave,
                schedule: scheduleRef.current,
                cartwall: cartwallCategoriesRef.current,
            }
        };
    }, [logoSrc, headerGradient, isNowPlayingExportEnabled, metadataFormat, columnWidths, isMicPanelCollapsed, isHeaderCollapsed, isLibraryCollapsed, isAutoBackupEnabled, isAutoBackupOnStartupEnabled, autoBackupInterval]);

    const handleExportData = useCallback(() => {
        try {
            const exportData = generateBackupData();
            const jsonString = JSON.stringify(exportData, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const date = new Date().toISOString().slice(0, 10);
            const userName = currentUserRef.current?.nickname?.replace(/\s/g, '_') || 'guest';
            a.href = url;
            a.download = `radiohost_backup_${userName}_${date}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error("Error during export:", error);
            alert("An error occurred while exporting data. Please check the console for details.");
        }
    }, [generateBackupData]);
    
    const handleSetAutoBackupFolder = useCallback(async () => {
        if (!('showDirectoryPicker' in window)) {
            alert("Your browser doesn't support this feature. Please use a modern browser like Chrome or Edge.");
            return;
        }
        try {
            const handle = await (window as any).showDirectoryPicker();
            if (await verifyPermission(handle)) {
                autoBackupFolderHandleRef.current = handle;
                setAutoBackupFolderPath(handle.name);
                await setConfig('autoBackupFolderHandle', handle);
                await setConfig('autoBackupFolderPath', handle.name);
            }
        } catch (err) {
            if ((err as Error).name !== 'AbortError') {
                console.error("Error setting auto-backup folder:", err);
            }
        }
    }, []);
    
    // Auto-backup Effect
    const startupBackupPerformed = useRef(false);
    useEffect(() => {
        // This function contains the core backup logic
        const performBackupAction = async (reason: 'startup' | 'interval') => {
             try {
                if (!autoBackupFolderHandleRef.current || !(await verifyPermission(autoBackupFolderHandleRef.current))) {
                    console.error(`[AutoBackup] Permission for backup folder lost or folder not set. Disabling auto-backup. Reason: ${reason}`);
                    setIsAutoBackupEnabled(false);
                    return;
                }

                const backupData = generateBackupData();
                const jsonString = JSON.stringify(backupData, null, 2);
                
                const date = new Date();
                const dateString = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                const timeString = `${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}`;
                const userName = currentUserRef.current?.nickname?.replace(/\s/g, '_') || 'guest';
                const fileName = `radiohost_backup_${userName}_${dateString}_${timeString}.json`;

                const fileHandle = await autoBackupFolderHandleRef.current.getFileHandle(fileName, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(jsonString);
                await writable.close();

                const user = currentUserRef.current;
                const key = user ? `autoBackupTimestamp_${user.email}` : 'autoBackupTimestamp_guest';
                localStorage.setItem(key, Date.now().toString());
                console.log(`[AutoBackup] Successful (${reason}). Saved to ${fileName}`);

            } catch (error) {
                console.error(`[AutoBackup] Failed (${reason}):`, error);
            }
        };

        // --- Logic for Startup Backup ---
        if (isAutoBackupOnStartupEnabledRef.current && autoBackupFolderHandleRef.current && !startupBackupPerformed.current) {
            startupBackupPerformed.current = true;
            console.log("[AutoBackup] Performing backup on application startup.");
            // Delay slightly to ensure all initial state is settled
            setTimeout(() => performBackupAction('startup'), 3000);
        }

        // --- Logic for Interval Backup ---
        const intervalId = setInterval(() => {
            if (!isAutoBackupEnabledRef.current || !autoBackupFolderHandleRef.current) return;
            
            const user = currentUserRef.current;
            const key = user ? `autoBackupTimestamp_${user.email}` : 'autoBackupTimestamp_guest';
            const lastBackupTimestamp = parseInt(localStorage.getItem(key) || '0', 10);
            const now = Date.now();
            const intervalHours = autoBackupIntervalRef.current;
            
            if (intervalHours <= 0) return; // An interval of 0 hours means it's disabled.
            
            const intervalMillis = intervalHours * 60 * 60 * 1000;

            if (now - lastBackupTimestamp > intervalMillis) {
                performBackupAction('interval');
            }
        }, 1000 * 60 * 5); // Check every 5 minutes

        return () => clearInterval(intervalId);
    }, [generateBackupData]); // Rerun if generateBackupData function identity changes


    const allFolders = useMemo(() => getAllFolders(mediaLibrary), [mediaLibrary]);
    const allTags = useMemo(() => getAllTags(mediaLibrary), [mediaLibrary]);

    const enrichedPlaylist = useMemo(() => {
        const enriched: TimelineItem[] = [];
        if (playlist.length === 0) return [];
    
        let lastPushedHour: number | null = null;
    
        for (const item of playlist) {
            // These are control markers and should not be displayed directly in the timeline UI.
            if (item.type === 'clock_start_marker' || item.type === 'autofill_marker' || item.type === 'random_from_folder' || item.type === 'random_from_tag') {
                continue;
            }
    
            const timelineData = timeline.get(item.id);
            const itemStartTime = timelineData?.startTime;
    
            if (itemStartTime) {
                const itemHour = itemStartTime.getHours();
    
                if (lastPushedHour === null || itemHour !== lastPushedHour) {
                    // Find the original source of this hour block by looking backwards in the raw playlist
                    const originalIndex = playlist.findIndex(p => p.id === item.id);
                    let source: 'schedule' | 'autofill' = 'autofill'; // Default to autofill
                    let sourceTitle = 'Auto-Filled Playlist';
                    
                    for (let j = originalIndex; j >= 0; j--) {
                        const precedingItem = playlist[j];
                        if (precedingItem.type === 'clock_start_marker') {
                            source = 'schedule';
                            sourceTitle = precedingItem.title || `Scheduled for ${precedingItem.hour}:00`;
                            break;
                        }
                        if (precedingItem.type === 'autofill_marker') {
                            source = 'autofill';
                            sourceTitle = precedingItem.title;
                            break;
                        }
                    }
                    
                    enriched.push({
                        id: `hour-boundary-${itemHour}-${itemStartTime.getTime()}`,
                        type: 'hour_boundary_marker',
                        hour: itemHour,
                        source,
                        title: sourceTitle,
                    });
                    lastPushedHour = itemHour;
                }
            }
            
            const enrichedItem: TimelineItem = { ...item };
            if (timelineData?.shortenedBy) {
                enrichedItem.shortenedBy = timelineData.shortenedBy;
            }

            enriched.push(enrichedItem);
        }
        
        return enriched;
    }, [playlist, timeline]);
    
    return (
        <div className="flex flex-col h-screen bg-white dark:bg-black text-black dark:text-white font-sans overflow-hidden">
            {!currentUser ? (
                <Auth onLogin={handleLogin} onSignup={handleSignup} />
            ) : (
                <>
                    <div className="relative flex-shrink-0">
                        <div className={`overflow-hidden transition-[max-height] duration-300 ease-in-out ${isHeaderCollapsed ? 'max-h-0' : 'max-h-[6rem]'}`}>
                            <Header
                                currentUser={currentUser}
                                onLogout={handleLogout}
                                currentTrack={displayTrack}
                                onNext={handleNext}
                                onPrevious={handlePrevious}
                                isPlaying={isPlaying}
                                onTogglePlay={handleTogglePlay}
                                isPresenterLive={isPresenterLive}
                                progress={trackProgress}
                                logoSrc={logoSrc}
                                onLogoChange={handleLogoChange}
                                onLogoReset={() => { setLogoSrc(null); setHeaderGradient(null); }}
                                headerGradient={headerGradient}
                                isAutoFillEnabled={playoutPolicy.autoFillPlaylist}
                                onToggleAutoFill={handleToggleAutoFill}
                            />
                        </div>
                        <div className="relative h-0 border-b border-neutral-200 dark:border-neutral-800">
                             <button
                                 onClick={() => setIsHeaderCollapsed(p => !p)}
                                 title={isHeaderCollapsed ? 'Show player' : 'Hide player'}
                                 className="absolute top-[-16px] left-1/2 -translate-x-1/2 z-10 p-1.5 rounded-full bg-neutral-200 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-700 text-black dark:text-white"
                             >
                                 {isHeaderCollapsed ? <ChevronDownIcon className="w-5 h-5"/> : <ChevronUpIcon className="w-5 h-5"/>}
                             </button>
                        </div>
                    </div>
                    <main ref={mainRef} className="flex-grow flex p-4 pt-6 min-h-0">
                        {/* Left Column: Media Library */}
                        <div style={{ flexBasis: `${displayedColumnWidths[0]}%` }} className={`flex-shrink-0 h-full overflow-hidden transition-all duration-300 ease-in-out ${!isLibraryCollapsed && 'border border-neutral-200 dark:border-neutral-800 rounded-lg shadow-md bg-neutral-100 dark:bg-neutral-900'}`}>
                            <MediaLibrary
                                rootFolder={mediaLibrary}
                                onAddToPlaylist={handleAddToPlaylist}
                                onAddTracksToLibrary={handleAddTracksToLibrary}
                                onAddUrlTrackToLibrary={handleAddUrlTrackToLibrary}
                                onRemoveFromLibrary={handleRemoveFromLibrary}
                                onRemoveMultipleFromLibrary={handleRemoveMultipleFromLibrary}
                                onCreateFolder={handleCreateFolder}
                                onMoveItem={handleMoveItemInLibrary}
                                onOpenMetadataSettings={(folder) => setEditingMetadataFolder(folder)}
                                onOpenTrackMetadataEditor={(track) => setEditingTrack(track)}
                                onUpdateTrackTags={handleUpdateTrackTags}
                                onUpdateFolderTags={handleUpdateFolderTags}
                                onPflTrack={handlePflTrack}
                                pflTrackId={pflTrackId}
                            />
                        </div>

                        <div className="relative flex-shrink-0 w-2 h-full flex items-center justify-center">
                            {!isLibraryCollapsed && (
                                <Resizer onMouseDown={handleMouseDown(0)} />
                            )}
                            <button
                                onClick={handleToggleLibraryCollapse}
                                title={isLibraryCollapsed ? 'Show Library' : 'Hide Library'}
                                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 p-1.5 rounded-full bg-neutral-200 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-700 text-black dark:text-white"
                            >
                                {isLibraryCollapsed ? <ChevronRightIcon className="w-5 h-5" /> : <ChevronLeftIcon className="w-5 h-5" />}
                            </button>
                        </div>


                        {/* Center Column: Playlist */}
                        <div style={{ flexBasis: `${displayedColumnWidths[1]}%` }} className="flex-shrink-0 h-full border border-neutral-200 dark:border-neutral-800 rounded-lg shadow-md bg-neutral-100 dark:bg-neutral-900 overflow-hidden">
                            <Playlist
                                items={enrichedPlaylist}
                                rawPlaylist={playlist}
                                currentPlayingItemId={currentPlayingItemId}
                                onRemove={handleRemoveFromPlaylist}
                                onReorder={handleReorderPlaylist}
                                onPlayTrack={handlePlayTrack}
                                onAddTrack={handleAddToPlaylist}
                                onInsertTrack={handleInsertTrackInPlaylist}
                                onAddMarker={handleAddMarker}
                                onUpdateMarker={handleUpdateMarker}
                                isPlaying={isPlaying}
                                stopAfterTrackId={stopAfterTrackId}
                                onSetStopAfterTrackId={setStopAfterTrackId}
                                trackProgress={trackProgress}
                                onClearPlaylist={handleClearPlaylist}
                                onPflTrack={handlePflTrack}
                                pflTrackId={pflTrackId}
                                isPflPlaying={isPflPlaying}
                                pflProgress={pflProgress}
                                mediaLibrary={mediaLibrary}
                                timeline={timeline}
                                isAutoFillEnabled={playoutPolicy.autoFillPlaylist}
                                onToggleAutoFill={handleToggleAutoFill}
                                skippedItemIds={skippedItemIds}
                                autoFilledItemIds={autoFilledItemIds}
                            />
                        </div>

                        <Resizer onMouseDown={handleMouseDown(1)} />

                        {/* Right Column: Tabs and Microphone Panel */}
                        <div style={{ flexBasis: `${displayedColumnWidths[2]}%` }} className="flex-shrink-0 h-full flex flex-col border border-neutral-200 dark:border-neutral-800 rounded-lg shadow-md bg-neutral-100 dark:bg-neutral-900 overflow-hidden">
                             <div className="flex-grow flex flex-col min-h-0">
                                <div className="flex-shrink-0 border-b border-neutral-200 dark:border-neutral-800">
                                    <nav className="flex justify-around">
                                        <button onClick={() => setActiveRightColumnTab('scheduler')} className={`p-3 w-full transition-colors ${activeRightColumnTab === 'scheduler' ? 'bg-neutral-200 dark:bg-neutral-800' : 'hover:bg-neutral-200/50 dark:hover:bg-neutral-800/50'}`} title="Scheduler"><ClockIcon className="w-6 h-6 mx-auto" /></button>
                                        <button onClick={() => setActiveRightColumnTab('cartwall')} className={`p-3 w-full transition-colors ${activeRightColumnTab === 'cartwall' ? 'bg-neutral-200 dark:bg-neutral-800' : 'hover:bg-neutral-200/50 dark:hover:bg-neutral-800/50'}`} title="Cartwall"><GridIcon className="w-6 h-6 mx-auto" /></button>
                                        <button onClick={() => setActiveRightColumnTab('mixer')} className={`p-3 w-full transition-colors ${activeRightColumnTab === 'mixer' ? 'bg-neutral-200 dark:bg-neutral-800' : 'hover:bg-neutral-200/50 dark:hover:bg-neutral-800/50'}`} title="Mixer"><MixerIcon className="w-6 h-6 mx-auto" /></button>
                                        <button onClick={() => setActiveRightColumnTab('settings')} className={`p-3 w-full transition-colors ${activeRightColumnTab === 'settings' ? 'bg-neutral-200 dark:bg-neutral-800' : 'hover:bg-neutral-200/50 dark:hover:bg-neutral-800/50'}`} title="Settings"><SettingsIcon className="w-6 h-6 mx-auto" /></button>
                                    </nav>
                                </div>
                                <div className="flex-grow overflow-y-auto">
                                    {activeRightColumnTab === 'scheduler' && <RotationScheduler schedule={schedule} onUpdateSchedule={handleUpdateScheduleBlock} onClearSchedule={handleClearScheduleBlock} onLoadPlaylist={handleLoadPlaylistFromSchedule} mediaLibrary={mediaLibrary} folders={allFolders} allTags={allTags} />}
                                    {activeRightColumnTab === 'cartwall' && <Cartwall categories={cartwallCategories} playingCartwallId={playingCartwallId} onPlayItem={handlePlayCartwallItem} onAssignItem={handleAssignCartwallItem} onClearItem={handleClearCartwallItem} onSetItemColor={handleSetCartwallItemColor} onAddCategory={handleAddCartwallCategory} onRenameCategory={handleRenameCartwallCategory} onDeleteCategory={handleDeleteCartwallCategory} onSetItemCount={handleSetCartwallItemCount} mediaLibrary={mediaLibrary} activeCategoryId={activeCartwallCategoryId} onSetActiveCategoryId={setActiveCartwallCategoryId} duckingLevel={0.2} onSetDuckingLevel={()=>{}} cartwallProgress={cartwallTrackProgress} cartwallDuration={cartwallTrackDuration} />}
                                    {activeRightColumnTab === 'mixer' && <AudioMixer mixerConfig={mixerConfig} onMixerChange={setMixerConfig} audioBuses={audioBuses} onBusChange={setAudioBuses} availableOutputDevices={availableAudioDevices} policy={playoutPolicy} onUpdatePolicy={setPlayoutPolicy} audioLevels={audioLevels} />}
                                    {activeRightColumnTab === 'settings' && <Settings policy={playoutPolicy} onUpdatePolicy={setPlayoutPolicy} currentUser={currentUser} onImportData={()=>{}} onExportData={handleExportData} isNowPlayingExportEnabled={isNowPlayingExportEnabled} onSetIsNowPlayingExportEnabled={setIsNowPlayingExportEnabled} onSetNowPlayingFile={handleSetNowPlayingFile} nowPlayingFileName={nowPlayingFileName} metadataFormat={metadataFormat} onSetMetadataFormat={setMetadataFormat} allTags={allTags} isAutoBackupEnabled={isAutoBackupEnabled} onSetIsAutoBackupEnabled={setIsAutoBackupEnabled} autoBackupInterval={autoBackupInterval} onSetAutoBackupInterval={setAutoBackupInterval} onSetAutoBackupFolder={handleSetAutoBackupFolder} autoBackupFolderPath={autoBackupFolderPath} isAutoBackupOnStartupEnabled={isAutoBackupOnStartupEnabled} onSetIsAutoBackupOnStartupEnabled={setIsAutoBackupOnStartupEnabled} />}
                                </div>
                            </div>
                            <div className="flex-shrink-0 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-900">
                                <div
                                    className="flex justify-between items-center p-3 cursor-pointer hover:bg-neutral-200/50 dark:hover:bg-neutral-800/50"
                                    onClick={() => setIsMicPanelCollapsed(p => !p)}
                                    aria-expanded={!isMicPanelCollapsed}
                                    aria-controls="mic-panel"
                                >
                                    <div className="flex items-center gap-2">
                                        <MixerIcon className="w-5 h-5" />
                                        <h3 className="font-semibold text-black dark:text-white">Microphone</h3>
                                    </div>
                                    <button className="text-black dark:text-white">
                                        {isMicPanelCollapsed ? <ChevronUpIcon className="w-5 h-5" /> : <ChevronDownIcon className="w-5 h-5" />}
                                    </button>
                                </div>
                                {!isMicPanelCollapsed && (
                                    <div id="mic-panel">
                                        <RemoteStudio
                                            ref={remoteStudioRef}
                                            onLiveStatusChange={setIsPresenterLive}
                                            onStreamAvailable={handleMicStream}
                                            playoutPolicy={playoutPolicy}
                                            onUpdatePolicy={setPlayoutPolicy}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    </main>
                </>
            )}
             <ConfirmationDialog
                isOpen={!!playlistLoadRequest}
                onClose={() => setPlaylistLoadRequest(null)}
                onConfirm={confirmLoadPlaylist}
                title={`Load Playlist for ${String(playlistLoadRequest?.hour || 0).padStart(2, '0')}:00?`}
                confirmText="Load Playlist"
                confirmButtonClass="bg-black dark:bg-white hover:bg-neutral-800 dark:hover:bg-neutral-200 text-white dark:text-black"
            >
                This will replace your current playlist. Are you sure you want to continue?
            </ConfirmationDialog>
             <MetadataSettingsModal
                folder={editingMetadataFolder}
                onClose={() => setEditingMetadataFolder(null)}
                onSave={handleUpdateFolderMetadataSettings}
             />
             <TrackMetadataModal
                track={editingTrack}
                onClose={() => setEditingTrack(null)}
                onSave={handleUpdateTrackMetadata}
             />

            {/* Audio elements */}
            <audio ref={playerARef} crossOrigin="anonymous"></audio>
            <audio ref={playerBRef} crossOrigin="anonymous"></audio>
            <audio ref={pflAudioRef} crossOrigin="anonymous" loop></audio>
            <audio ref={cartwallAudioRef} crossOrigin="anonymous"></audio>
            {/* Bus output players */}
            <audio ref={mainBusAudioRef} autoPlay></audio>
            <audio ref={monitorBusAudioRef} autoPlay></audio>
        </div>
    );
};

const App = React.memo(AppInternal);
export default App;