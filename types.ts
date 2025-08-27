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
  artist: string;
  duration: number; // in seconds
  type: TrackType;
  src: string;
  tags?: string[];
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

export interface TimeFixMarker {
  id: string; // for react key
  type: 'marker';
  time: string; // "HH:MM:SS"
  markerType: 'hard' | 'soft';
  title?: string;
}

export interface ClockStartMarker {
  id: string;
  type: 'clock_start_marker';
  hour: number;
  title?: string;
  loadMode?: 'hard' | 'soft';
}

export interface RandomFromFolderMarker {
  id: string;
  type: 'random_from_folder';
  folderId: string;
}

export interface RandomFromTagMarker {
  id: string;
  type: 'random_from_tag';
  tag: string;
}


export interface AutoFillMarker {
  id: string;
  type: 'autofill_marker';
  title: string;
}

export interface HourBoundaryMarker {
  id: string; 
  type: 'hour_boundary_marker';
  hour: number; 
  source: 'schedule' | 'autofill';
  title: string;
}


export type SequenceItem = Track | TimeFixMarker | ClockStartMarker | RandomFromFolderMarker | RandomFromTagMarker | AutoFillMarker;

export type TimelineItem = (SequenceItem | HourBoundaryMarker) & { 
  isSkipped?: boolean;
  shortenedBy?: number;
};

export interface ScheduledBlock {
  id: string;
  hour: number; // 0-23
  title?: string;
  type: 'sequence' | 'folder';
  loadMode?: 'hard' | 'soft'; // New field for auto-load behavior
  preloadTime?: number; // in minutes, per-block setting
  sequenceItems?: SequenceItem[];
  folderId?: string;
  daysOfWeek?: number[]; // 0=Sun, 1=Mon, ..., 6=Sat
  daysOfMonth?: number[]; // 1-31
}

export interface PlayoutPolicy {
  artistSeparation: number; // in minutes
  titleSeparation: number; // in minutes
  autoFillPlaylist: boolean;
  autoFillTags: string[];
  autoFillLookahead: number; // in minutes
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
}

export interface PlayoutHistoryEntry {
  trackId: string;
  title: string;
  artist: string;
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