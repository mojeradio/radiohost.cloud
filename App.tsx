

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { type Track, TrackType, type Folder, type LibraryItem, type PlayoutPolicy, type PlayoutHistoryEntry, type CartwallCategory, type AudioBus, type MixerConfig, type AudioSourceId, type AudioBusId, type SequenceItem, TimeMarker, TimeMarkerType } from './types';
import Header from './components/Header';
import MediaLibrary from './components/MediaLibrary';
import Playlist from './components/Playlist';
import Auth from './components/Auth';
import RemoteStudio, { type RemoteStudioRef } from './components/RemoteStudio';
import { getTrack as getTrackFromDB, deleteTrack as deleteTrackFromDB, setConfig, getConfig } from './services/dbService';
import Settings from './components/Settings';
import { SettingsIcon } from './components/icons/SettingsIcon';
import Cartwall from './components/Cartwall';
import { GridIcon } from './components/icons/GridIcon';
import Resizer from './components/Resizer';
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
const USER_CARTWALL_STORAGE_KEY = 'radiohost_userCartwall';
const USER_PLAYBACK_STATE_KEY = 'radiohost_userPlaybackState';
const USER_AUDIO_CONFIG_KEY = 'radiohost_userAudioConfig';

// Guest-specific keys
const GUEST_LIBRARY_KEY = 'radiohost_guestLibrary';
const GUEST_SETTINGS_KEY = 'radiohost_guestSettings';
const GUEST_PLAYLIST_KEY = 'radiohost_guestPlaylist';
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
    isAutoFillEnabled: false,
    autoFillLeadTime: 10, // minutes
    autoFillSourceType: 'folder',
    autoFillSourceId: null,
    autoFillTargetDuration: 60, // minutes
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
    const [isPresenterLive, setIsPresenterLive] = useState(false);
    const [trackProgress, setTrackProgress] = useState(0);
    const [activeRightColumnTab, setActiveRightColumnTab] = useState<'cartwall' | 'mixer' | 'settings'>('cartwall');
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
    const [editingMetadataFolder, setEditingMetadataFolder] = useState<Folder | null>(null);
    const [editingTrack, setEditingTrack] = useState<Track | null>(null);
    const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false);
    const [isLibraryCollapsed, setIsLibraryCollapsed] = useState(false);

    
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
    const mediaLibraryRef = useRef(mediaLibrary);
    mediaLibraryRef.current = mediaLibrary;
    const playoutPolicyRef = useRef(playoutPolicy);
    playoutPolicyRef.current = playoutPolicy;
    const playoutHistoryRef = useRef(playoutHistory);
    playoutHistoryRef.current = playoutHistory;
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
    const timelineRef = useRef(new Map<string, { startTime: Date, endTime: Date, duration: number, isSkipped?: boolean, shortenedBy?: number }>());


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


    const currentTrack = useMemo(() => {
        const item = playlist[currentTrackIndex];
        return item?.type !== 'marker' ? item : undefined;
    }, [playlist, currentTrackIndex]);

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
                initialCartwall = JSON.parse(localStorage.getItem(GUEST_CARTWALL_KEY) || 'null') || createInitialCartwall();
                initialAudioConfig = JSON.parse(localStorage.getItem(GUEST_AUDIO_CONFIG_KEY) || 'null');
            }

            // --- Set base state first ---
            if (loggedInUser) setCurrentUser(loggedInUser);
            setMediaLibrary(initialLibrary);
            setCartwallCategories(initialCartwall);
            setActiveCartwallCategoryId(initialCartwall[0]?.id || null);
            setPlayoutPolicy({ ...defaultPlayoutPolicy, ...initialSettings.playoutPolicy });
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

            // --- Load playlist and playback state ---
            setPlaylist(initialPlaylist);
            if (initialPlaybackState && initialPlaybackState.isPlaying) {
                // Restore saved state because playback was active on refresh
                setIsPlaying(initialPlaybackState.isPlaying ?? false);
                setCurrentPlayingItemId(initialPlaybackState.currentPlayingItemId ?? null);
                setCurrentTrackIndex(initialPlaybackState.currentTrackIndex ?? 0);
                setStopAfterTrackId(initialPlaybackState.stopAfterTrackId ?? null);
            } else if (initialPlaylist.length > 0) {
                // If not playing or no state, start at the beginning, paused
                const firstPlayableIndex = initialPlaylist.findIndex(item => item.type !== 'marker');
                setCurrentTrackIndex(firstPlayableIndex > -1 ? firstPlayableIndex : 0);
                setCurrentPlayingItemId(null);
                setIsPlaying(false);
                setStopAfterTrackId(null);
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
    }, [playoutPolicy, logoSrc, headerGradient, isNowPlayingExportEnabled, metadataFormat, columnWidths, isMicPanelCollapsed, isHeaderCollapsed, isLibraryCollapsed, currentUser, audioBuses, mixerConfig, isAutoBackupEnabled, isAutoBackupOnStartupEnabled, autoBackupInterval], 500);

    useDebouncedEffect(() => {
        const playlistToSave = playlist.filter(item => {
            if (item.type === 'marker') {
                return true;
            }
            // Do not persist local files with temporary object URLs
            if (item.type === TrackType.LOCAL_FILE) {
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
                if (item.type !== 'marker' && item.src && item.src.startsWith('blob:')) {
                    URL.revokeObjectURL(item.src);
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

    const findNextPlayableIndex = useCallback((startIndex: number, direction: number = 1): number => {
        const listToSearch = playlistRef.current;
        const currentTimeline = timelineRef.current;
        const len = listToSearch.length;
        if (len === 0) return -1;
    
        let nextIndex = startIndex;
        for (let i = 0; i < len; i++) {
            nextIndex = (nextIndex + direction + len) % len;
            const item = listToSearch[nextIndex];
            if (item && item.type !== 'marker') {
                const timelineData = currentTimeline.get(item.id);
                if (!timelineData || !timelineData.isSkipped) {
                    return nextIndex;
                }
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
    
    const handleSetCurrentTrack = (newIndex: number, source: 'manual' | 'auto-next' | 'marker-jump') => {
        const currentPlaylist = playlistRef.current;
        const oldIndex = currentTrackIndexRef.current;
        const timeline = timelineRef.current;
        const isForwardMove = newIndex > oldIndex;

        // Policy 1: User has 'Remove Played Tracks' enabled and we are moving forward.
        if (playoutPolicyRef.current.removePlayedTracks && isForwardMove) {
            const newPlaylist = currentPlaylist.slice(newIndex);
            setPlaylist(newPlaylist);
            setCurrentTrackIndex(0);
            return; // This policy takes precedence.
        }

        // Policy 2: The move skipped over markers or greyed-out items, triggering a cleanup.
        // This runs only if Policy 1 is false.
        let shouldCleanup = false;
        // For auto-next, we only care about what's between the last track and the new one.
        // For a manual click or hard marker jump, we clean up everything before the new track.
        const checkStartIndex = (source === 'auto-next') ? oldIndex + 1 : 0;
        
        if ((isForwardMove || source === 'manual') && newIndex > -1) {
             for (let i = checkStartIndex; i < newIndex; i++) {
                const item = currentPlaylist[i];
                if (!item) continue;
                if (item.type === 'marker' || timeline.get(item.id)?.isSkipped) {
                    shouldCleanup = true;
                    break;
                }
            }
        }
       
        if (shouldCleanup) {
            const newPlaylist = currentPlaylist.slice(newIndex);
            setPlaylist(newPlaylist);
            setCurrentTrackIndex(0);
        } else {
            setCurrentTrackIndex(newIndex);
        }
    };

    const handleNext = useCallback(() => {
        const nextIndex = findNextPlayableIndex(currentTrackIndexRef.current, 1);
    
        if (nextIndex !== -1) {
            handleSetCurrentTrack(nextIndex, 'auto-next');
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
        if (newTrack.type === 'marker') return;

        stopPfl();
        
        handleSetCurrentTrack(targetIndex, 'manual');

        // Always switch player when jumping to a new track this way
        setActivePlayer(p => p === 'A' ? 'B' : 'A');
        
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
        if (!nextItem || nextItem.type === 'marker') {
            isCrossfadingRef.current = false;
            return;
        }
    
        const src = await getTrackSrc(nextItem);
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
                
                if (endedItem && endedItem.type !== 'marker') {
                    setPlayoutHistory(prev => [...prev, { trackId: endedItem.id, title: endedItem.title, artist: endedItem.artist, playedAt: Date.now() }].slice(-100));
                }

                setCurrentPlayingItemId(nextItem.id);
                setActivePlayer(p => p === 'A' ? 'B' : 'A');
                
                handleSetCurrentTrack(nextIndex, 'auto-next');

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
            if (!currentTrack) {
                if (isPlaying) setIsPlaying(false);
                 setCurrentPlayingItemId(null);
                return;
            }

            const currentPlayer = activePlayerRef.current;
            if (!currentPlayer) return;

            if (activeLoadedIdRef.current !== currentTrack.id) {
                currentPlayer.pause();
                
                if (activeUrlRef.current && activeUrlRef.current.startsWith('blob:')) {
                    URL.revokeObjectURL(activeUrlRef.current);
                }
                
                const src = await getTrackSrc(currentTrack);
                if (src) {
                    currentPlayer.src = src;
                    activeUrlRef.current = src;
                    activeLoadedIdRef.current = currentTrack.id;
                    currentPlayer.load();
                } else {
                    console.error(`Could not load track: ${currentTrack.title}`);
                    handleNext(); // Fallback to simple next
                    return;
                }
            }

            if (isPlaying && currentPlayer.paused) {
                try {
                    await currentPlayer.play();
                    setCurrentPlayingItemId(currentTrack.id);
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
        
    }, [currentTrack, isPlaying, activePlayer, handleNext, getTrackSrc, stopPfl]);

    const timeline = useMemo(() => {
        const timelineMap = new Map<string, { startTime: Date, endTime: Date, duration: number, isSkipped?: boolean, shortenedBy?: number }>();
        if (playlist.length === 0) return timelineMap;

        // Pre-calculation: determine which tracks are skipped by a passed soft marker
        const softSkippedIds = new Set<string>();
        const now = Date.now();
        const nowPlayingIndex = currentPlayingItemId ? playlist.findIndex(item => item.id === currentPlayingItemId) : -1;

        let lastPassedSoftMarkerIndex = -1;
        playlist.forEach((item, index) => {
            if (item.type === 'marker' && item.markerType === TimeMarkerType.SOFT && item.time < now) {
                lastPassedSoftMarkerIndex = index;
            }
        });

        if (lastPassedSoftMarkerIndex > nowPlayingIndex) {
            const startIndex = nowPlayingIndex === -1 ? 0 : nowPlayingIndex + 1;
            for (let i = startIndex; i < lastPassedSoftMarkerIndex; i++) {
                const item = playlist[i];
                if (item.type !== 'marker') {
                    softSkippedIds.add(item.id);
                }
            }
        }

        let calculationStartTime = Date.now();
        if (currentPlayingItemId) {
            const nowPlayingIndex = playlist.findIndex(item => item.id === currentPlayingItemId);
             if (nowPlayingIndex > -1) {
                let timeBeforeCurrent = 0;
                for (let i = 0; i < nowPlayingIndex; i++) {
                    const item = playlist[i];
                    if (item.type !== 'marker' && !softSkippedIds.has(item.id)) {
                        const nextHardMarkerIndex = playlist.findIndex((nextItem, index) => index > i && nextItem.type === 'marker' && nextItem.markerType === TimeMarkerType.HARD);
                        let duration = item.duration;
                        if (nextHardMarkerIndex > -1) {
                            const nextMarker = playlist[nextHardMarkerIndex] as TimeMarker;
                            const naturalEndTime = (calculationStartTime + (timeBeforeCurrent + duration) * 1000);
                            if (nextMarker.time < naturalEndTime) {
                                duration = Math.max(0, (nextMarker.time - (calculationStartTime + timeBeforeCurrent * 1000)) / 1000);
                            }
                        }
                        timeBeforeCurrent += duration;
                    }
                }
                 calculationStartTime = Date.now() - (trackProgress * 1000) - timeBeforeCurrent;
            }
        }
    
        let playhead = calculationStartTime;
    
        for (let i = 0; i < playlist.length; i++) {
            const item = playlist[i];
            
            if (item.type === 'marker') {
                const marker = item;
                playhead = Math.max(playhead, marker.time);
            } else {
                const track = item;
                const startTime = playhead;
                const naturalEndTime = startTime + track.duration * 1000;
                let finalEndTime = naturalEndTime;
                let shortenedBy = 0;
                
                const nextHardMarkerIndex = playlist.findIndex((nextItem, index) => 
                    index > i && nextItem.type === 'marker' && nextItem.markerType === TimeMarkerType.HARD
                );
                if (nextHardMarkerIndex > -1) {
                    const nextMarker = playlist[nextHardMarkerIndex] as TimeMarker;
                    if (nextMarker.time < naturalEndTime) {
                        finalEndTime = nextMarker.time;
                        shortenedBy = (naturalEndTime - finalEndTime) / 1000;
                    }
                }
    
                const isSkippedByTiming = startTime >= finalEndTime;
                const isSkippedBySoftMarker = softSkippedIds.has(track.id);
                const isSkipped = isSkippedByTiming || isSkippedBySoftMarker;
    
                timelineMap.set(track.id, {
                    startTime: new Date(startTime),
                    endTime: new Date(finalEndTime),
                    duration: isSkipped ? 0 : (finalEndTime - startTime) / 1000,
                    isSkipped: isSkipped,
                    shortenedBy: shortenedBy > 0.1 ? shortenedBy : 0,
                });
                
                if (!isSkipped) {
                    playhead = finalEndTime;
                }
            }
        }
        
        return timelineMap;
    }, [playlist, currentPlayingItemId, trackProgress]);
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
                     const nextIndex = findNextPlayableIndex(currentTrackIndexRef.current, 1);
                     if (nextIndex !== -1 && nextIndex !== currentTrackIndexRef.current) {
                        performCrossfade(nextIndex);
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
            if (!endedItem || endedItem.type === 'marker') return;
            
            setPlayoutHistory(prev => [...prev, { trackId: endedItem.id, title: endedItem.title, artist: endedItem.artist, playedAt: Date.now() }].slice(-100));
            
            if (stopAfterTrackIdRef.current && stopAfterTrackIdRef.current === endedItem.id) {
                setIsPlaying(false); setStopAfterTrackId(null);
                if (remoteStudioRef.current) remoteStudioRef.current.connectMic();
                return;
            }

            const endedIndex = currentTrackIndexRef.current;
            const currentPlaylist = playlistRef.current;
            const currentTimeline = timelineRef.current;
            let nextIndex = -1;

            // --- START OF FIX: Address race condition for soft markers ---
            // The timeline from the ref might be stale regarding time-sensitive soft markers.
            // We perform a fresh check here to ensure correctness at the exact moment a track ends.
            const now = Date.now();
            let lastPassedSoftMarkerIndex = -1;
            currentPlaylist.forEach((item, index) => {
                if (item.type === 'marker' && item.markerType === TimeMarkerType.SOFT && item.time < now) {
                    lastPassedSoftMarkerIndex = index;
                }
            });
            // --- END OF FIX ---

            for (let i = endedIndex + 1; i < currentPlaylist.length; i++) {
                const item = currentPlaylist[i];
                if (item.type !== 'marker') {
                    // A track is skipped if EITHER a hard marker has forced it out (a structural skip, safe to read from ref)
                    // OR a soft marker's time has just passed (a time-sensitive skip, needs a fresh check).
                    const timelineData = currentTimeline.get(item.id);
                    const isSkippedByHardMarker = timelineData ? timelineData.startTime >= timelineData.endTime : false;
                    const isSkippedBySoftMarker = lastPassedSoftMarkerIndex > endedIndex && i < lastPassedSoftMarkerIndex;
        
                    if (!isSkippedByHardMarker && !isSkippedBySoftMarker) {
                        nextIndex = i;
                        break;
                    }
                }
            }

            if (nextIndex !== -1) {
                handleSetCurrentTrack(nextIndex, 'auto-next');
                setActivePlayer(p => (p === 'A' ? 'B' : 'A'));
            } else {
                setIsPlaying(false);
                setCurrentPlayingItemId(null);
                if (playoutPolicyRef.current.removePlayedTracks) {
                    setPlaylist([]);
                }
            }
        };
        
        const players = [playerA, playerB];
        players.forEach(p => { if (p) { p.addEventListener('timeupdate', handleTimeUpdate); p.addEventListener('ended', handleEnded); } });
        return () => { players.forEach(p => { if (p) { p.removeEventListener('timeupdate', handleTimeUpdate); p.removeEventListener('ended', handleEnded); } }); };
    }, [activePlayer, findNextPlayableIndex, performCrossfade, handleNext]);

    // --- Hard Marker Trigger Logic ---
    const triggerHardMarkerFadeAndJump = useCallback(async (nextIndex: number) => {
        if (isCrossfadingRef.current) return;
        isCrossfadingRef.current = true;
    
        const graph = audioGraphRef.current;
        if (!graph.context || !graph.playerMixerNode) {
            isCrossfadingRef.current = false;
            return;
        }
    
        const FADE_DURATION = 0.8; // 800ms
        const { context, playerMixerNode } = graph;
        const now = context.currentTime;
    
        const gainAParam = playerMixerNode.parameters.get('gainA')!;
        const gainBParam = playerMixerNode.parameters.get('gainB')!;
        const activeParam = activePlayer === 'A' ? gainAParam : gainBParam;
    
        activeParam.cancelScheduledValues(now);
        activeParam.linearRampToValueAtTime(0, now + FADE_DURATION);
    
        setTimeout(() => {
            const endedItem = playlistRef.current[currentTrackIndexRef.current];
            if (endedItem && endedItem.type !== 'marker') {
                setPlayoutHistory(prev => [...prev, { trackId: endedItem.id, title: endedItem.title, artist: endedItem.artist, playedAt: Date.now() }].slice(-100));
            }
            
            handleSetCurrentTrack(nextIndex, 'marker-jump');
            setActivePlayer(p => (p === 'A' ? 'B' : 'A'));
    
            isCrossfadingRef.current = false;
        }, FADE_DURATION * 1000);
    
    }, [activePlayer, setPlayoutHistory]);

    useEffect(() => {
        if (!isPlaying) return;
    
        const intervalId = setInterval(() => {
            const now = Date.now();
            const playlist = playlistRef.current;
            const currentIdx = currentTrackIndexRef.current;
    
            let triggerMarker: TimeMarker | null = null;
            let markerIndex = -1;
    
            // Find the latest hard marker that has passed
            let latestHardMarkerTime = 0;
            for (let i = 0; i < playlist.length; i++) {
                const item = playlist[i];
                if (item.type === 'marker' && item.markerType === TimeMarkerType.HARD && now >= item.time && item.time > latestHardMarkerTime) {
                    triggerMarker = item;
                    markerIndex = i;
                    latestHardMarkerTime = item.time;
                }
            }
    
            if (triggerMarker && markerIndex > currentIdx) {
                const nextPlayableIndex = findNextPlayableIndex(markerIndex, 1);
                
                if (nextPlayableIndex !== -1 && nextPlayableIndex !== currentIdx) {
                    console.log(`[Hard Marker] Triggered at ${new Date(triggerMarker.time).toLocaleTimeString()}. Jumping to track index ${nextPlayableIndex}.`);
                    triggerHardMarkerFadeAndJump(nextPlayableIndex);
                }
            }
        }, 1000); 
    
        return () => clearInterval(intervalId);
    
    }, [isPlaying, findNextPlayableIndex, triggerHardMarkerFadeAndJump]);

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
        setPlaylist(prev => {
            // When user adds a track, remove any auto-filled tracks
            const manualTracks = prev.filter(t => t.type !== 'marker' && t.addedBy !== 'auto-fill');
            return [...manualTracks, { ...track, addedBy: 'user' }];
        });
    }, []);

    const handleInsertTrackInPlaylist = useCallback((track: Track, beforeItemId: string | null) => {
        setPlaylist(prev => {
             // When user adds a track, remove any auto-filled tracks
            const manualTracks = prev.filter(t => t.type !== 'marker' && t.addedBy !== 'auto-fill');
            const newPlaylist = [...manualTracks];
            const insertIndex = beforeItemId ? newPlaylist.findIndex(item => item.id === beforeItemId) : newPlaylist.length;

            if (insertIndex !== -1) {
                newPlaylist.splice(insertIndex, 0, { ...track, addedBy: 'user' });
            } else {
                newPlaylist.push({ ...track, addedBy: 'user' });
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
        if (itemToRemove && itemToRemove.type !== 'marker') {
            if (itemToRemove.src && itemToRemove.src.startsWith('blob:')) {
                URL.revokeObjectURL(itemToRemove.src);
            }
        }
        
        const newPlaylist = oldPlaylist.filter(item => item.id !== itemIdToRemove);

        setPlaylist(newPlaylist);

        if (currentPlayingItemId) {
            if (currentPlayingItemId === itemIdToRemove) {
                setIsPlaying(false);
                setCurrentPlayingItemId(null);
                const firstPlayable = findNextPlayableIndex(-1, 1);
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
            if (item.type !== 'marker' && item.src && item.src.startsWith('blob:')) {
                URL.revokeObjectURL(item.src);
            }
        });

        // If there is a current item (playing or paused), keep it.
        if (currentTrack) {
            setPlaylist([currentTrack]);
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
    }, [currentTrack]);

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
    
// FIX: Added missing findFolderInTree function.
const findFolderInTree = (node: Folder, folderId: string): Folder | null => {
    if (node.id === folderId) {
        return node;
    }
    for (const child of node.children) {
        if (child.type === 'folder') {
            const found = findFolderInTree(child as Folder, folderId);
            if (found) {
                return found;
            }
        }
    }
    return null;
};
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
            if (item.type === 'marker') {
                return true;
            }
            if (item.type === TrackType.LOCAL_FILE) {
                return false;
            }
            return true;
        });
        const settingsToSave = { 
            playoutPolicy: playoutPolicyRef.current,
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

    // --- AUTO-FILL LOGIC ---
    const isAutoFillingRef = useRef(false);

    const generateAutoFillTracks = useCallback((): Track[] => {
        const { autoFillSourceType, autoFillSourceId, autoFillTargetDuration, artistSeparation, titleSeparation } = playoutPolicyRef.current;
        if (!autoFillSourceId) return [];

        let sourceTracks: Track[] = [];
        const seenArtists: Record<string, number> = {};
        const seenTitles: Set<string> = new Set();
        
        // Seed seen items from recent playout history
        const history = playoutHistoryRef.current;
        const now = Date.now();
        history.forEach(entry => {
            if (entry.artist) seenArtists[entry.artist] = entry.playedAt;
            seenTitles.add(entry.title);
        });

        const collectTracks = (item: LibraryItem) => {
            if (item.type === 'folder') {
                if (autoFillSourceType === 'folder') {
                    if (item.id === autoFillSourceId) {
                        item.children.forEach(collectTracks); // Start collecting from the source folder
                    } else {
                        // Keep traversing to find the source folder
                        item.children.forEach(collectTracks);
                    }
                } else { // type is 'tag', so check tags
                    if (item.tags?.includes(autoFillSourceId)) {
                        item.children.forEach(collectTracks);
                    } else {
                        item.children.forEach(collectTracks);
                    }
                }
            } else { // It's a track
                if (item.type === TrackType.SONG) { // Only auto-fill with songs for now
                     if (autoFillSourceType === 'folder') {
                        sourceTracks.push(item);
                    } else if (item.tags?.includes(autoFillSourceId)) {
                        sourceTracks.push(item);
                    }
                }
            }
        };
        
        // Find the starting point for collection
         if (autoFillSourceType === 'folder') {
            const sourceFolder = findFolderInTree(mediaLibraryRef.current, autoFillSourceId);
            if (sourceFolder) collectTracks(sourceFolder);
        } else {
            collectTracks(mediaLibraryRef.current);
        }

        if (sourceTracks.length === 0) return [];

        const generatedPlaylist: Track[] = [];
        let currentDuration = 0;
        const targetDurationSeconds = autoFillTargetDuration * 60;

        // Fisher-Yates shuffle for randomness
        for (let i = sourceTracks.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [sourceTracks[i], sourceTracks[j]] = [sourceTracks[j], sourceTracks[i]];
        }
        
        while (currentDuration < targetDurationSeconds && sourceTracks.length > 0) {
            let foundTrack = false;
            for (let i = 0; i < sourceTracks.length; i++) {
                const track = sourceTracks[i];
                const artistOK = !track.artist || !seenArtists[track.artist] || (now - seenArtists[track.artist] > artistSeparation * 60 * 1000);
                const titleOK = !seenTitles.has(track.title);

                if (artistOK && titleOK) {
                    const trackWithMeta: Track = { ...track, addedBy: 'auto-fill' };
                    generatedPlaylist.push(trackWithMeta);
                    currentDuration += track.duration;
                    if(track.artist) seenArtists[track.artist] = now + (currentDuration * 1000);
                    seenTitles.add(track.title);
                    sourceTracks.splice(i, 1);
                    foundTrack = true;
                    break;
                }
            }
            if (!foundTrack) {
                // If we can't find a track that meets separation rules, just grab the first one to avoid an infinite loop
                const track = sourceTracks.shift();
                if (track) {
                    generatedPlaylist.push({ ...track, addedBy: 'auto-fill' });
                    currentDuration += track.duration;
                }
            }
        }

        return generatedPlaylist;
    }, []);

    useEffect(() => {
        const autoFillCheckInterval = setInterval(() => {
            const { isAutoFillEnabled, autoFillLeadTime } = playoutPolicyRef.current;
            if (!isAutoFillEnabled || isAutoFillingRef.current || isPresenterLive) {
                return;
            }

            const currentPlaylist = playlistRef.current;
            const currentPlayingIdx = currentPlaylist.findIndex(t => t.id === currentPlayingItemIdRef.current);
            const currentProgress = trackProgressRef.current;

            let remainingDuration = 0;
            if (currentPlayingIdx !== -1) {
                const currentItem = currentPlaylist[currentPlayingIdx];
                // Time left in the current track
                if (currentItem.type !== 'marker') {
                    remainingDuration += (currentItem.duration - currentProgress);
                }
                // Time for all subsequent tracks
                for (let i = currentPlayingIdx + 1; i < currentPlaylist.length; i++) {
                    const item = currentPlaylist[i];
                    if (item.type !== 'marker') {
                        remainingDuration += item.duration;
                    }
                }
            } else if (currentPlaylist.length > 0 && !isPlayingRef.current) {
                // Playlist is loaded but stopped, calculate total duration
                 remainingDuration = currentPlaylist.reduce((acc, item) => acc + (item.type !== 'marker' ? item.duration : 0), 0);
            }

            const leadTimeSeconds = autoFillLeadTime * 60;

            if (remainingDuration < leadTimeSeconds) {
                isAutoFillingRef.current = true;
                console.log(`[Auto-Fill] Triggered. Remaining time: ${Math.round(remainingDuration)}s. Lead time: ${leadTimeSeconds}s.`);
                const newTracks = generateAutoFillTracks();
                if (newTracks.length > 0) {
                    setPlaylist(prev => {
                        // Ensure we don't add if a manual track was just added
                        const lastTrack = prev[prev.length -1];
                        if (lastTrack && lastTrack.type !== 'marker' && lastTrack.addedBy !== 'auto-fill') {
                            return prev;
                        }
                        return [...prev, ...newTracks];
                    });
                }
                 setTimeout(() => { isAutoFillingRef.current = false; }, 5000); // Cooldown
            }
        }, 15000); // Check every 15 seconds

        return () => clearInterval(autoFillCheckInterval);
    }, [generateAutoFillTracks, isPresenterLive]);

    // --- Time Marker Handlers ---
    const handleInsertTimeMarker = useCallback((marker: TimeMarker, beforeItemId: string | null) => {
        setPlaylist(prev => {
            const newPlaylist = [...prev];
            const insertIndex = beforeItemId ? newPlaylist.findIndex(item => item.id === beforeItemId) : newPlaylist.length;
            
            if (insertIndex !== -1) {
                newPlaylist.splice(insertIndex, 0, marker);
            } else {
                newPlaylist.push(marker);
            }
            
            // Sort by time after adding
            newPlaylist.sort((a, b) => {
                const timeA = a.type === 'marker' ? a.time : 0;
                const timeB = b.type === 'marker' ? b.time : 0;
                if (timeA > 0 && timeB > 0) return timeA - timeB;
                return 0; // Keep relative order of tracks
            });

            return newPlaylist;
        });
    }, []);

    const handleUpdateTimeMarker = useCallback((markerId: string, updates: Partial<TimeMarker>) => {
        setPlaylist(prev => 
            prev.map(item => 
                item.id === markerId && item.type === 'marker' ? { ...item, ...updates } : item
            )
        );
    }, []);

    
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
                                items={playlist}
                                currentPlayingItemId={currentPlayingItemId}
                                onRemove={handleRemoveFromPlaylist}
                                onReorder={handleReorderPlaylist}
                                onPlayTrack={handlePlayTrack}
                                onAddTrack={handleAddToPlaylist}
                                onInsertTrack={handleInsertTrackInPlaylist}
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
                                onInsertTimeMarker={handleInsertTimeMarker}
                                onUpdateTimeMarker={handleUpdateTimeMarker}
                            />
                        </div>

                        <Resizer onMouseDown={handleMouseDown(1)} />

                        {/* Right Column: Tabs and Microphone Panel */}
                        <div style={{ flexBasis: `${displayedColumnWidths[2]}%` }} className="flex-shrink-0 h-full flex flex-col border border-neutral-200 dark:border-neutral-800 rounded-lg shadow-md bg-neutral-100 dark:bg-neutral-900 overflow-hidden">
                             <div className="flex-grow flex flex-col min-h-0">
                                <div className="flex-shrink-0 border-b border-neutral-200 dark:border-neutral-800">
                                    <nav className="flex justify-around">
                                        <button onClick={() => setActiveRightColumnTab('cartwall')} className={`p-3 w-full transition-colors ${activeRightColumnTab === 'cartwall' ? 'bg-neutral-200 dark:bg-neutral-800' : 'hover:bg-neutral-200/50 dark:hover:bg-neutral-800/50'}`} title="Cartwall"><GridIcon className="w-6 h-6 mx-auto" /></button>
                                        <button onClick={() => setActiveRightColumnTab('mixer')} className={`p-3 w-full transition-colors ${activeRightColumnTab === 'mixer' ? 'bg-neutral-200 dark:bg-neutral-800' : 'hover:bg-neutral-200/50 dark:hover:bg-neutral-800/50'}`} title="Mixer"><MixerIcon className="w-6 h-6 mx-auto" /></button>
                                        <button onClick={() => setActiveRightColumnTab('settings')} className={`p-3 w-full transition-colors ${activeRightColumnTab === 'settings' ? 'bg-neutral-200 dark:bg-neutral-800' : 'hover:bg-neutral-200/50 dark:hover:bg-neutral-800/50'}`} title="Settings"><SettingsIcon className="w-6 h-6 mx-auto" /></button>
                                    </nav>
                                </div>
                                <div className="flex-grow overflow-y-auto">
                                    {activeRightColumnTab === 'cartwall' && <Cartwall categories={cartwallCategories} playingCartwallId={playingCartwallId} onPlayItem={handlePlayCartwallItem} onAssignItem={handleAssignCartwallItem} onClearItem={handleClearCartwallItem} onSetItemColor={handleSetCartwallItemColor} onAddCategory={handleAddCartwallCategory} onRenameCategory={handleRenameCartwallCategory} onDeleteCategory={handleDeleteCartwallCategory} onSetItemCount={handleSetCartwallItemCount} mediaLibrary={mediaLibrary} activeCategoryId={activeCartwallCategoryId} onSetActiveCategoryId={setActiveCartwallCategoryId} duckingLevel={0.2} onSetDuckingLevel={()=>{}} cartwallProgress={cartwallTrackProgress} cartwallDuration={cartwallTrackDuration} />}
                                    {activeRightColumnTab === 'mixer' && <AudioMixer mixerConfig={mixerConfig} onMixerChange={setMixerConfig} audioBuses={audioBuses} onBusChange={setAudioBuses} availableOutputDevices={availableAudioDevices} policy={playoutPolicy} onUpdatePolicy={setPlayoutPolicy} audioLevels={audioLevels} />}
                                    {activeRightColumnTab === 'settings' && <Settings policy={playoutPolicy} onUpdatePolicy={setPlayoutPolicy} currentUser={currentUser} onImportData={()=>{}} onExportData={handleExportData} isNowPlayingExportEnabled={isNowPlayingExportEnabled} onSetIsNowPlayingExportEnabled={setIsNowPlayingExportEnabled} onSetNowPlayingFile={handleSetNowPlayingFile} nowPlayingFileName={nowPlayingFileName} metadataFormat={metadataFormat} onSetMetadataFormat={setMetadataFormat} isAutoBackupEnabled={isAutoBackupEnabled} onSetIsAutoBackupEnabled={setIsAutoBackupEnabled} autoBackupInterval={autoBackupInterval} onSetAutoBackupInterval={setAutoBackupInterval} onSetAutoBackupFolder={handleSetAutoBackupFolder} autoBackupFolderPath={autoBackupFolderPath} isAutoBackupOnStartupEnabled={isAutoBackupOnStartupEnabled} onSetIsAutoBackupOnStartupEnabled={setIsAutoBackupOnStartupEnabled} allFolders={allFolders} allTags={allTags} />}
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