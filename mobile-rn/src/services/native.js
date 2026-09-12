// Native bridge to the Kotlin side (NovaModule): background music playback,
// downloads, offline library scan, DES decryption.
import { NativeModules } from 'react-native';

const Nova = NativeModules.NovaModule || {};

export const playMusic = (url, title, artist, image) =>
  Nova.playMusic?.(url, title, artist, image);

export const pauseMusic = () => Nova.pauseMusic?.();
export const resumeMusic = () => Nova.resumeMusic?.();
export const seekMusic = (positionMs) => Nova.seekMusic?.(positionMs);
export const stopMusic = () => Nova.stopMusic?.();

export const downloadFile = (url, filename, title, mimeType) =>
  Nova.downloadFile?.(url, filename, title, mimeType);

export const scanOfflineMusic = async () => {
  try {
    const raw = await Nova.scanOfflineMusic?.();
    return raw ? JSON.parse(raw) : [];
  } catch (_) {
    return [];
  }
};

export const decryptSaavnUrl = (encryptedUrl) => Nova.decryptSaavnUrl?.(encryptedUrl) || '';
