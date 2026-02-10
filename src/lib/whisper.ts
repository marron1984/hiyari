// ======== OpenAI Whisper 音声文字起こしライブラリ ========

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const WHISPER_API_URL = 'https://api.openai.com/v1/audio/transcriptions';

// 対応する音声フォーマット
export const SUPPORTED_AUDIO_TYPES = [
  'audio/mpeg',        // .mp3
  'audio/mp4',         // .m4a
  'audio/wav',         // .wav
  'audio/x-wav',       // .wav
  'audio/webm',        // .webm
  'audio/ogg',         // .ogg
  'audio/flac',        // .flac
];

export const SUPPORTED_AUDIO_EXTENSIONS = ['.mp3', '.m4a', '.wav', '.webm', '.ogg', '.flac', '.mp4'];

// 最大ファイルサイズ: 25MB (Whisper APIの制限)
export const MAX_AUDIO_FILE_SIZE = 25 * 1024 * 1024;

/**
 * Whisper APIが設定されているか
 */
export function isWhisperConfigured(): boolean {
  return !!OPENAI_API_KEY;
}

/**
 * 音声ファイルのバリデーション
 */
export function validateAudioFile(
  contentType: string,
  fileSize: number,
  filename: string
): { valid: boolean; error?: string } {
  // ファイルサイズチェック
  if (fileSize > MAX_AUDIO_FILE_SIZE) {
    return {
      valid: false,
      error: `ファイルサイズが大きすぎます（最大${MAX_AUDIO_FILE_SIZE / 1024 / 1024}MB）`,
    };
  }

  // MIMEタイプチェック
  if (!SUPPORTED_AUDIO_TYPES.includes(contentType)) {
    const ext = filename.substring(filename.lastIndexOf('.')).toLowerCase();
    if (!SUPPORTED_AUDIO_EXTENSIONS.includes(ext)) {
      return {
        valid: false,
        error: `対応していない音声形式です。対応形式: ${SUPPORTED_AUDIO_EXTENSIONS.join(', ')}`,
      };
    }
  }

  return { valid: true };
}

export interface TranscriptionResult {
  text: string;
  language?: string;
  duration?: number;
  segments?: {
    start: number;
    end: number;
    text: string;
  }[];
}

/**
 * 音声ファイルを文字起こし
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  filename: string,
  options?: {
    language?: string;  // 'ja', 'en', etc.
    prompt?: string;    // コンテキストヒント
  }
): Promise<TranscriptionResult> {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY が設定されていません');
  }

  // FormDataを構築
  const formData = new FormData();

  const blob = new Blob([new Uint8Array(audioBuffer)], { type: 'audio/mpeg' });
  formData.append('file', blob, filename);
  formData.append('model', 'whisper-1');
  formData.append('response_format', 'verbose_json');

  // 日本語を優先
  formData.append('language', options?.language || 'ja');

  // コンテキストヒント（精度向上）
  if (options?.prompt) {
    formData.append('prompt', options.prompt);
  } else {
    // 介護施設向けのデフォルトヒント
    formData.append(
      'prompt',
      '介護施設の会議録、入居相談、ヒヤリハット報告、稟議、改善提案に関する音声です。'
    );
  }

  const response = await fetch(WHISPER_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Whisper API error: ${response.status} ${errorText}`);
  }

  const data = await response.json();

  return {
    text: data.text || '',
    language: data.language,
    duration: data.duration,
    segments: data.segments?.map((seg: { start: number; end: number; text: string }) => ({
      start: seg.start,
      end: seg.end,
      text: seg.text,
    })),
  };
}
