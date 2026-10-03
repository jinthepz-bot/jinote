// The file half of export/import, kept apart from backup.ts so the data shaping
// stays testable under plain Node. Native writes a file and opens the share sheet;
// web falls back to a download and a file input, since expo-sharing can't share a
// local file there and expo-file-system has no web implementation.
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { bytesToBase64, base64ToBytes, photoIdOf, readPhoto, writePhoto } from '../notes/photos';
import { getNotesState } from '../notes/store';
import { backupFileName, buildBackup, type Backup } from './backup';

export type ExportResult = { ok: true; where: string } | { ok: false; error: string };
export type ImportRead = { ok: true; text: string; name: string } | { ok: false; error: string; canceled?: boolean };

// The backup plus every recipe photo a note uses, so a restore brings the images back.
async function serialize(): Promise<string> {
  const backup = buildBackup();
  const photos: Record<string, string> = {};
  for (const note of getNotesState().notes) {
    const id = note.type === 'recipe' ? photoIdOf(note.photoUri) : null;
    if (!id || photos[id]) continue;
    const bytes = await readPhoto(id);
    if (bytes) photos[id] = bytesToBase64(bytes);
  }
  if (Object.keys(photos).length > 0) backup.data.photos = photos;
  return JSON.stringify(backup, null, 2);
}

// After applyBackup: puts the backup's photos on this device (and, when signed in,
// the next sync uploads them).
export async function restoreBackupPhotos(backup: Backup): Promise<void> {
  for (const [id, data] of Object.entries(backup.data.photos ?? {})) {
    await writePhoto(id, base64ToBytes(data));
  }
}

function downloadOnWeb(json: string, name: string): ExportResult {
  try {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Revoked on the next tick so the download has already started.
    setTimeout(() => URL.revokeObjectURL(url), 0);
    return { ok: true, where: name };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not save the file.' };
  }
}

export async function exportBackup(): Promise<ExportResult> {
  const name = backupFileName();
  const json = await serialize();

  if (Platform.OS === 'web') return downloadOnWeb(json, name);

  try {
    const file = new File(Paths.cache, name);
    if (file.exists) file.delete(); // overwrite a backup taken earlier the same day
    file.create();
    file.write(json);

    if (!(await Sharing.isAvailableAsync())) {
      return { ok: false, error: 'Sharing is not available on this device.' };
    }
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/json',
      UTI: 'public.json',
      dialogTitle: 'Save your Jinote backup',
    });
    return { ok: true, where: name };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not create the file.' };
  }
}

export async function readBackupFile(): Promise<ImportRead> {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/json', 'text/plain'],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled) return { ok: false, error: 'Canceled.', canceled: true };

    const asset = result.assets?.[0];
    if (!asset) return { ok: false, error: 'No file was picked.', canceled: true };

    // On web the picker hands back a real File object; on a phone it's a uri.
    if (asset.file) return { ok: true, text: await asset.file.text(), name: asset.name };
    const text = await new File(asset.uri).text();
    return { ok: true, text, name: asset.name };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not read that file.' };
  }
}
