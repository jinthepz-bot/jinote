import type { SupabaseClient } from '@supabase/supabase-js';

import { localPhotoIds, photoIdOf, readPhoto, removeLocalPhoto, writePhoto } from '../notes/photos';
import { getNotesState } from '../notes/store';

// Recipe photos in Supabase Storage (bucket "note-photos", one folder per user; see
// supabase/schema.sql). The notes themselves sync as rows; this keeps the image
// files in step with them, after each round:
// - a photo used by a note and only on this device goes up;
// - a photo used by a note but missing here comes down;
// - a photo this device knew online that no note uses any more (its note or recipe
//   was deleted, or the photo removed) is deleted online and here.
//
// `known` (kept with the rest of the sync state) is the photos this device knows are
// online, so it never deletes one it hasn't seen.

const BUCKET = 'note-photos';
// A photo just picked in an open form isn't in any note yet; leave it alone for a while.
const KEEP_UNUSED_MS = 60 * 60 * 1000;

const pathOf = (userId: string, id: string) => `${userId}/${id}.jpg`;

// Photo ids start with the time they were made (base 36), see notes/photos.ts.
const madeAt = (id: string) => parseInt(id.slice(0, 8), 36) || 0;

export async function syncPhotos(client: SupabaseClient, userId: string, known: Record<string, 1>): Promise<void> {
  const used = new Set<string>();
  for (const note of getNotesState().notes) {
    const id = note.type === 'recipe' ? photoIdOf(note.photoUri) : null;
    if (id) used.add(id);
  }
  const here = new Set(await localPhotoIds());
  const storage = client.storage.from(BUCKET);

  for (const id of used) {
    if (!here.has(id) || known[id]) continue;
    const bytes = await readPhoto(id);
    if (!bytes) continue;
    const { error } = await storage.upload(pathOf(userId, id), bytes, { contentType: 'image/jpeg', upsert: true });
    if (error) throw error;
    known[id] = 1;
  }

  for (const id of used) {
    if (here.has(id)) continue;
    // Not there yet (the other device may not have uploaded it): tried again next round.
    const { data, error } = await storage.download(pathOf(userId, id));
    if (error || !data) continue;
    await writePhoto(id, new Uint8Array(await data.arrayBuffer()));
    known[id] = 1;
  }

  const gone = Object.keys(known).filter((id) => !used.has(id));
  if (gone.length > 0) {
    const { error } = await storage.remove(gone.map((id) => pathOf(userId, id)));
    if (error) throw error;
    for (const id of gone) {
      delete known[id];
      await removeLocalPhoto(id);
      here.delete(id);
    }
  }

  for (const id of here) {
    if (!used.has(id) && Date.now() - madeAt(id) > KEEP_UNUSED_MS) await removeLocalPhoto(id);
  }
}
