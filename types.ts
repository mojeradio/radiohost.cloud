
export enum TrackType {
  SONG = 'Song',
  JINGLE = 'Jingle',
  AD = 'Advertisement',
  VOICETRACK = 'Voice Track',
  URL = 'URL',
  LOCAL_FILE = 'Local File',
}

export interface Track {
  id: string;
  title: string;
  artist?: string;
  duration: number; // in seconds
  type: TrackType;
  src: string;
  tags?: string[];
  addedBy?: 'auto-fill' | 'user';
}

export enum TimeMarkerType {
  HARD = 'hard',
  SOFT = 'soft',
}

export interface TimeMarker {
  id: string;
  type: 'marker';
  time: number; // Stored as timestamp for easier comparison
  markerType: TimeMarkerType;
}

export interface Folder {
  id:string;
  name: string;
  type: 'folder';
  children: LibraryItem[];
  tags?: string[];
  suppressMetadata?: {
    enabled: boolean;
    customText?: string;
    suppressDuplicateWarning?: boolean;
  };
}

export type LibraryItem = Track | Folder;

// A SequenceItem can be a track or a time marker for the playlist.
export type SequenceItem = Track | TimeMarker;

export type TimelineItem = Track & { 
  shortenedBy?: number;
};


export interface PlayoutPolicy {
  artistSeparation: number; // in minutes
  titleSeparation: number; // in minutes
  removePlayedTracks: boolean;
  normalizationEnabled: boolean;
  normalizationTargetDb: number; // in dB
  equalizerEnabled: boolean;
  equalizerBands: {
    bass: number; // in dB
    mid: number; // in dB
    treble: number; // in dB
  };
  crossfadeEnabled: boolean;
  crossfadeDuration: number; // in seconds
  micDuckingLevel: number; // gain level from 0 to 1
  micDuckingFadeDuration: number; // in seconds
  pflDuckingLevel: number; // gain level from 0 to 1
  isAutoFillEnabled: boolean;
  autoFillLeadTime: number; // in minutes
  autoFillSourceType: 'folder' | 'tag';
  autoFillSourceId: string | null;
  autoFillTargetDuration: number; // in minutes
}

export interface PlayoutHistoryEntry {
  trackId: string;
  title: string;
  artist?: string;
  playedAt: number; // timestamp
}

export interface CartwallItem {
    id: string; // e.g., 'cart-0'
    trackId: string | null;
    color?: string;
}

export interface CartwallCategory {
    id: string;
    name: string;
    items: CartwallItem[];
}

// --- NEW AUDIO MIXER TYPES ---

export type AudioSourceId = 'mainPlayer' | 'cartwall' | 'mic' | 'pfl';
export type AudioBusId = 'main' | 'monitor';

export interface AudioBus {
  id: AudioBusId;
  name: string;
  outputDeviceId: string;
  gain: number;
  muted: boolean;
}

export interface RoutingSend {
    enabled: boolean;
    gain: number;
}

export interface SourceRoutingConfig {
  gain: number;
  muted: boolean;
  sends: Record<AudioBusId, RoutingSend>;
}

export type MixerConfig = Record<AudioSourceId, SourceRoutingConfig>;