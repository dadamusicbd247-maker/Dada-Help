export interface ExtractedAudio {
  success: boolean;
  provider: string;
  title: string;
  artist?: string;
  filename: string;
  directAudioUrl: string;
  mimeType: string;
  sizeBytes?: number;
  sizeFormatted?: string;
  format: string;
  duration?: string;
  thumbnailUrl?: string;
  sourceUrl: string;
  error?: string;
  platform?: 'su' | 'yt' | 'fb' | 'direct';
  externalConvertUrl?: string;
}

