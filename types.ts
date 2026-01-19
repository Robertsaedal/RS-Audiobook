
export interface ABSUser {
  id: string;
  username: string;
  token: string;
}

export interface ABSChapter {
  id: number;
  start: number;
  end: number;
  title: string;
}

export interface ABSAudioFile {
  id?: string;
  ino?: string;
  index: number;
  duration: number;
  metadata?: any;
}

export interface ABSAudioTrack {
  index: number;
  startOffset: number;
  duration: number;
  title: string;
  contentUrl: string;
  mimeType: string;
  metadata?: any;
}

export interface ABSLibraryItem {
  id: string;
  addedDate: number | string;
  mediaType: string;
  media: {
    metadata: {
      title: string;
      authorName: string;
      description?: string;
      seriesName?: string;
      sequence?: string;
    };
    duration: number;
    chapters: ABSChapter[];
    audioFiles: ABSAudioFile[];
    coverPath?: string;
  };
  userProgress?: ABSProgress;
}

export interface ABSProgress {
  itemId: string;
  currentTime: number;
  duration: number;
  progress: number;
  isFinished: boolean;
  lastUpdate: number;
}

export interface ABSPlaybackSession {
  id: string;
  libraryItem: ABSLibraryItem;
  audioTracks: ABSAudioTrack[];
  displayTitle: string;
  displayAuthor: string;
  currentTime: number;
  playMethod: number;
}

export interface AuthState {
  user: ABSUser | null;
  serverUrl: string;
}

export enum AppScreen {
  LOGIN = 'LOGIN',
  LIBRARY = 'LIBRARY',
  PLAYER = 'PLAYER'
}

export const PlayMethod = {
  DIRECTPLAY: 0,
  TRANSCODE: 1
};
