import { type Track, TrackType, type PlayoutPolicy, type PlayoutHistoryEntry, type Folder } from '../types';

const HOUR_IN_SECONDS = 3600;

/**
 * Shuffles an array in place using the Fisher-Yates algorithm.
 * @param array The array to shuffle.
 */
const shuffleArray = <T>(array: T[]): T[] => {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
};

const applySeparationPolicy = (tracks: Track[], policy: PlayoutPolicy, history: PlayoutHistoryEntry[]): Track[] => {
    const now = Date.now();
    return tracks.filter(track => {
        const titleViolation = history.some(entry =>
            entry.title.toLowerCase() === track.title.toLowerCase() &&
            now - entry.playedAt < policy.titleSeparation * 60 * 1000
        );
        if (titleViolation) return false;

        const artistViolation = history.some(entry =>
            entry.artist && track.artist && entry.artist.toLowerCase() === track.artist.toLowerCase() &&
            now - entry.playedAt < policy.artistSeparation * 60 * 1000
        );
        if (artistViolation) return false;

        return true;
    });
};

const fillToDuration = (tracks: Track[], targetDurationInSeconds: number): Track[] => {
    const shuffledTracks = shuffleArray(tracks);
    const generatedPlaylist: Track[] = [];
    let currentDuration = 0;

    for (const track of shuffledTracks) {
        if (track.duration > 0 && currentDuration + track.duration <= targetDurationInSeconds) { // Strict duration check
            generatedPlaylist.push(track);
            currentDuration += track.duration;
        }
    }
    return generatedPlaylist;
};

// --- Playlist Generation ---

const getTracksFromFolder = (folder: Folder): Track[] => {
    let tracks: Track[] = [];
    for (const child of folder.children) {
        if (child.type === 'folder') {
            tracks = tracks.concat(getTracksFromFolder(child));
        } else if (child.type !== TrackType.URL && child.type !== TrackType.LOCAL_FILE) {
            tracks.push(child);
        }
    }
    return tracks;
};

const findFolderById = (node: Folder, id: string): Folder | null => {
    if (node.id === id) {
        return node;
    }
    for (const child of node.children) {
        if (child.type === 'folder') {
            const found = findFolderById(child, id);
            if (found) return found;
        }
    }
    return null;
};

// Helper to get all valid tracks from the entire library for auto-generation
const getAllTracksFromLibrary = (node: Folder): Track[] => {
    let tracks: Track[] = [];
    for (const child of node.children) {
        if (child.type === 'folder') {
            tracks = tracks.concat(getAllTracksFromLibrary(child));
        } else if (child.type !== TrackType.URL && child.type !== TrackType.LOCAL_FILE) {
            tracks.push(child);
        }
    }
    return tracks;
};

export const generatePlaylistFromFolder = (
    folderId: string,
    libraryRoot: Folder,
    policy: PlayoutPolicy,
    history: PlayoutHistoryEntry[],
    targetDurationInSeconds: number = HOUR_IN_SECONDS
): Track[] => {
    const targetFolder = findFolderById(libraryRoot, folderId);
    if (!targetFolder) return [];

    const tracksInFolder = getTracksFromFolder(targetFolder);
    const availableTracks = applySeparationPolicy(tracksInFolder, policy, history);
    return fillToDuration(availableTracks, targetDurationInSeconds);
};


export const generatePlaylistFromTag = (
    tag: string,
    libraryRoot: Folder,
    policy: PlayoutPolicy,
    history: PlayoutHistoryEntry[],
    targetDurationInSeconds: number = HOUR_IN_SECONDS
): Track[] => {
    const allTracks = getAllTracksFromLibrary(libraryRoot);
    const taggedTracks = allTracks.filter(track => track.tags?.includes(tag));
    
    const availableTracks = applySeparationPolicy(taggedTracks, policy, history);
    return fillToDuration(availableTracks, targetDurationInSeconds);
};

export const generatePlaylistFromTags = (
    tags: string[],
    libraryRoot: Folder,
    policy: PlayoutPolicy,
    history: PlayoutHistoryEntry[],
    targetDurationInSeconds: number = HOUR_IN_SECONDS
): Track[] => {
    if (!tags || tags.length === 0) return [];
    const allTracks = getAllTracksFromLibrary(libraryRoot);
    const tagSet = new Set(tags);
    const taggedTracks = allTracks.filter(track => track.tags?.some(t => tagSet.has(t)));
    
    const availableTracks = applySeparationPolicy(taggedTracks, policy, history);
    return fillToDuration(availableTracks, targetDurationInSeconds);
};