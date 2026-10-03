import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

// Recipe photos. A note doesn't hold the image: its `photoUri` holds a reference,
// "photo:<id>", and the image itself lives in a small local cache — IndexedDB on the
// web, a file in the app's documents on a phone build — and, when signed in to sync,
// in Supabase Storage too (see sync/photos.ts). Every photo is shrunk to about
// PHOTO_TARGET_BYTES as it's picked.
//
// Notes from before this kept a plain file:// path from the phone they were taken on;
// those still show there, and are left as they are.

export const photosSupported = true;
const IS_WEB = Platform.OS === 'web';

export const PHOTO_TARGET_BYTES = 200 * 1024;
const MAX_SIDE = 1600;

const REF = 'photo:';
export const photoRef = (id: string) => `${REF}${id}`;
export const photoIdOf = (uri: string | null | undefined): string | null =>
  uri && uri.startsWith(REF) ? uri.slice(REF.length) : null;

const newPhotoId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

// ---- change notifications, so a photo that arrives later (downloaded by sync)
// appears without a reload

const listeners = new Set<() => void>();
export function subscribePhotos(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
const notify = () => listeners.forEach((l) => l());

// ---- base64 helpers (backups carry photos as text)

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ---- the local cache: web

const DB_NAME = 'jinote-photos';
const STORE = 'photos';
let dbPromise: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

async function idb<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const request = run(database.transaction(STORE, mode).objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ---- the local cache: phone

function photosDirectory(): Directory {
  const dir = new Directory(Paths.document, 'notePhotos');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}
const photoFile = (id: string) => new File(photosDirectory(), `${id}.jpg`);

// ---- the local cache: either

const objectUrls = new Map<string, string>(); // web: id -> blob: URL, made once

export async function writePhoto(id: string, bytes: Uint8Array): Promise<void> {
  if (IS_WEB) {
    await idb('readwrite', (s) => s.put(new Blob([bytes as BlobPart], { type: 'image/jpeg' }), id));
    const old = objectUrls.get(id);
    if (old) URL.revokeObjectURL(old);
    objectUrls.delete(id);
  } else {
    const file = photoFile(id);
    if (file.exists) file.delete();
    file.create();
    file.write(bytes);
  }
  notify();
}

export async function readPhoto(id: string): Promise<Uint8Array | null> {
  try {
    if (IS_WEB) {
      const blob = await idb<Blob | undefined>('readonly', (s) => s.get(id));
      return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
    }
    const file = photoFile(id);
    return file.exists ? await file.bytes() : null;
  } catch {
    return null;
  }
}

export async function hasPhoto(id: string): Promise<boolean> {
  if (IS_WEB) return (await idb<IDBValidKey | undefined>('readonly', (s) => s.getKey(id))) !== undefined;
  return photoFile(id).exists;
}

export async function localPhotoIds(): Promise<string[]> {
  if (IS_WEB) return (await idb<IDBValidKey[]>('readonly', (s) => s.getAllKeys())).map(String);
  return photosDirectory()
    .list()
    .filter((entry): entry is File => entry instanceof File && entry.name.endsWith('.jpg'))
    .map((file) => file.name.slice(0, -4));
}

export async function removeLocalPhoto(id: string): Promise<void> {
  try {
    if (IS_WEB) {
      await idb('readwrite', (s) => s.delete(id));
      const url = objectUrls.get(id);
      if (url) URL.revokeObjectURL(url);
      objectUrls.delete(id);
    } else {
      const file = photoFile(id);
      if (file.exists) file.delete();
    }
  } catch (err) {
    console.warn('Failed to delete a photo', err);
  }
  notify();
}

// Something an <Image> can show for a note's photoUri, or null while it isn't here
// (yet). Old file:// paths are shown as they are.
export async function displayUri(photoUri: string | null): Promise<string | null> {
  if (!photoUri) return null;
  const id = photoIdOf(photoUri);
  if (!id) return photoUri;
  if (!IS_WEB) {
    const file = photoFile(id);
    return file.exists ? file.uri : null;
  }
  const cached = objectUrls.get(id);
  if (cached) return cached;
  const blob = await idb<Blob | undefined>('readonly', (s) => s.get(id)).catch(() => undefined);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  objectUrls.set(id, url);
  return url;
}

// ---- shrinking to about PHOTO_TARGET_BYTES, as a JPEG

async function shrinkOnWeb(source: Blob): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(source);
  let side = MAX_SIDE;
  let best: Blob | null = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.82, 0.7, 0.58]) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (!blob) continue;
      best = blob;
      if (blob.size <= PHOTO_TARGET_BYTES) return new Uint8Array(await blob.arrayBuffer());
    }
    side = Math.round(side * 0.75);
  }
  if (!best) throw new Error('Could not read that image.');
  return new Uint8Array(await best.arrayBuffer());
}

async function shrinkOnPhone(uri: string): Promise<Uint8Array> {
  let width = MAX_SIDE;
  let last: string | null = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    const image = await ImageManipulator.manipulate(uri).resize({ width }).renderAsync();
    for (const compress of [0.8, 0.65, 0.5]) {
      const saved = await image.saveAsync({ compress, format: SaveFormat.JPEG, base64: true });
      if (!saved.base64) continue;
      last = saved.base64;
      if (saved.base64.length * 0.75 <= PHOTO_TARGET_BYTES) return base64ToBytes(saved.base64);
    }
    width = Math.round(width * 0.75);
  }
  if (!last) throw new Error('Could not read that image.');
  return base64ToBytes(last);
}

async function keepPicked(asset: ImagePicker.ImagePickerAsset): Promise<string> {
  const bytes = IS_WEB
    ? await shrinkOnWeb(asset.file ?? (await (await fetch(asset.uri)).blob()))
    : await shrinkOnPhone(asset.uri);
  const id = newPhotoId();
  await writePhoto(id, bytes);
  return photoRef(id);
}

// ---- picking

export type PickPhotoResult = { uri: string } | { canceled: true } | { error: string };

// On the web there's one button: the browser's own file picker, which on a phone
// also offers the camera.
export const cameraButtonAvailable = !IS_WEB;

export async function pickPhotoFromLibrary(): Promise<PickPhotoResult> {
  try {
    if (!IS_WEB) {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== 'granted') return { error: "Photo library access wasn't granted." };
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (result.canceled || result.assets.length === 0) return { canceled: true };
    return { uri: await keepPicked(result.assets[0]) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not open the photo library.' };
  }
}

export async function pickPhotoFromCamera(): Promise<PickPhotoResult> {
  try {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== 'granted') return { error: "Camera access wasn't granted." };
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
    if (result.canceled || result.assets.length === 0) return { canceled: true };
    return { uri: await keepPicked(result.assets[0]) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not open the camera.' };
  }
}

// Removes a note's photo from this device. Best-effort: a note should never fail to
// delete just because its photo is already gone. The online copy goes on the next
// sync, once no note uses it (see sync/photos.ts).
export function deleteNotePhoto(uri: string | null): void {
  if (!uri) return;
  const id = photoIdOf(uri);
  if (id) {
    void removeLocalPhoto(id);
    return;
  }
  if (IS_WEB) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch (err) {
    console.warn('Failed to delete note photo', err);
  }
}
