import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useType } from '../design/fonts';
import { Sheet } from '../design/Sheet';
import { colors, radius, sizes, spacing, keyboardAppearance } from '../design/theme';
import { useAccent } from '../design/accent';
import { Button, Chip, fieldStyles, Segmented } from '../design/ui';
import { NotePhoto } from './NotePhoto';
import { cameraButtonAvailable, deleteNotePhoto, pickPhotoFromCamera, pickPhotoFromLibrary, photosSupported } from './photos';
import {
  addChecklist,
  addQuickNote,
  addRecipe,
  RECIPE_CATEGORIES,
  setNoteFolder,
  type NoteType,
  type RecipeCategory,
} from './store';

interface Props {
  visible: boolean;
  initialType?: NoteType; // which kind the form opens on (the desktop "+ New" menu picks one)
  folderId?: string; // file the new note here (made from inside a folder on desktop)
  onCancel: () => void;
  onSaved: () => void;
}

const TYPES: { value: NoteType; label: string; hint: string }[] = [
  { value: 'quick', label: 'Quick note', hint: 'Free text, stamped with the date and time.' },
  { value: 'recipe', label: 'Recipe', hint: 'A photo, ingredients, and numbered steps.' },
  { value: 'checklist', label: 'Checklist', hint: 'A title plus items you can check off.' },
];

// "One per line" text areas are split into arrays; blank lines are dropped.
const splitLines = (text: string): string[] => text.split('\n').map((l) => l.trim()).filter(Boolean);

export function NoteForm({ visible, initialType, folderId, onCancel, onSaved }: Props) {
  return (
    <Sheet visible={visible} onClose={onCancel}>
      <FormBody initialType={initialType} folderId={folderId} onCancel={onCancel} onSaved={onSaved} />
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  const type = useType();
  return (
    <View style={styles.field}>
      <Text style={type.label}>{label}</Text>
      {children}
    </View>
  );
}

function PhotoField({ uri, onChange }: { uri: string | null; onChange: (uri: string | null) => void }) {
  const type = useType();
  const accent = useAccent();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!photosSupported) {
    return (
      <Field label="Photo (optional)">
        <Text style={[type.mono, styles.muted]}>
          Camera and photo library access aren't available on web — add a photo from the app on your phone.
        </Text>
      </Field>
    );
  }

  const pick = async (source: 'camera' | 'library') => {
    setBusy(true);
    const result = source === 'camera' ? await pickPhotoFromCamera() : await pickPhotoFromLibrary();
    setBusy(false);
    if ('uri' in result) onChange(result.uri);
    else if ('error' in result) setError(result.error);
  };

  return (
    <Field label="Photo (optional)">
      {uri ? (
        <View style={styles.photoRow}>
          <NotePhoto uri={uri} style={styles.photoPreview} />
          <Pressable
            onPress={() => {
              deleteNotePhoto(uri);
              onChange(null);
            }}
            hitSlop={8} accessibilityRole="button" accessibilityLabel="Remove photo">
            <Text style={[type.label, styles.removeText]}>Remove</Text>
          </Pressable>
        </View>
      ) : busy ? (
        <ActivityIndicator color={accent.accent} />
      ) : (
        <View style={styles.photoButtons}>
          {cameraButtonAvailable ? (
            <>
              <Button label="Camera" variant="secondary" small onPress={() => pick('camera')} />
              <Button label="Library" variant="secondary" small onPress={() => pick('library')} />
            </>
          ) : (
            <Button label="Choose photo" variant="secondary" small onPress={() => pick('library')} />
          )}
        </View>
      )}
      {error ? <Text style={[type.mono, styles.muted]}>{error}</Text> : null}
    </Field>
  );
}

function FormBody({ initialType, folderId, onCancel, onSaved }: Omit<Props, 'visible'>) {
  const type = useType();
  const accent = useAccent();
  const [noteType, setNoteType] = useState<NoteType>(initialType ?? 'quick');

  // Quick
  const [text, setText] = useState('');

  // Checklist
  const [checklistTitle, setChecklistTitle] = useState('');
  const [items, setItems] = useState('');

  // Recipe
  const [recipeTitle, setRecipeTitle] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [cookTime, setCookTime] = useState('');
  const [category, setCategory] = useState<RecipeCategory>('Main dish');
  const [rating, setRating] = useState<1 | 2 | 3>(1);
  const [ingredients, setIngredients] = useState('');
  const [steps, setSteps] = useState('');
  const [recipeNotes, setRecipeNotes] = useState('');

  const canSave =
    noteType === 'quick'
      ? text.trim() !== ''
      : noteType === 'checklist'
        ? checklistTitle.trim() !== ''
        : recipeTitle.trim() !== '';

  const save = () => {
    if (!canSave) return;
    let made: { id: string } | null;
    if (noteType === 'quick') made = addQuickNote(text);
    else if (noteType === 'checklist') made = addChecklist(checklistTitle, splitLines(items));
    else {
      made = addRecipe({
        title: recipeTitle,
        photoUri,
        cookTime,
        category,
        rating,
        ingredients: splitLines(ingredients),
        steps: splitLines(steps),
        notes: recipeNotes,
      });
    }
    if (made && folderId) setNoteFolder(made.id, folderId);
    onSaved();
  };

  return (
    <>
      <Text style={[type.display, styles.heading]}>NEW NOTE</Text>

      <Field label="Type">
        <Segmented options={TYPES} value={noteType} onChange={setNoteType} />
        <Text style={type.mono}>{TYPES.find((t) => t.value === noteType)!.hint}</Text>
      </Field>

      {noteType === 'quick' ? (
        <Field label="Note">
          <TextInput
            style={[fieldStyles.input, type.body, styles.textArea]}
            value={text}
            onChangeText={setText}
            placeholder="What are you thinking about or curious about right now?"
            placeholderTextColor={colors.textMuted}
            keyboardAppearance={keyboardAppearance}
            multiline
            textAlignVertical="top"
            autoFocus
            accessibilityLabel="Note text"
          />
        </Field>
      ) : noteType === 'checklist' ? (
        <>
          <Field label="Title">
            <TextInput
              style={[fieldStyles.input, fieldStyles.single, type.body]}
              value={checklistTitle}
              onChangeText={setChecklistTitle}
              placeholder="e.g. Packing list"
              placeholderTextColor={colors.textMuted}
              keyboardAppearance={keyboardAppearance}
              autoFocus
              accessibilityLabel="Checklist title"
            />
          </Field>
          <Field label="Items (optional, one per line)">
            <TextInput
              style={[fieldStyles.input, type.body, styles.textAreaSmall]}
              value={items}
              onChangeText={setItems}
              placeholder={'Passport\nCharger\nToothbrush'}
              placeholderTextColor={colors.textMuted}
              keyboardAppearance={keyboardAppearance}
              multiline
              textAlignVertical="top"
              accessibilityLabel="Checklist items"
            />
          </Field>
        </>
      ) : (
        <>
          <Field label="Title">
            <TextInput
              style={[fieldStyles.input, fieldStyles.single, type.body]}
              value={recipeTitle}
              onChangeText={setRecipeTitle}
              placeholder="e.g. Weeknight pasta"
              placeholderTextColor={colors.textMuted}
              keyboardAppearance={keyboardAppearance}
              autoFocus
              accessibilityLabel="Recipe title"
            />
          </Field>
          <PhotoField uri={photoUri} onChange={setPhotoUri} />
          <Field label="Cook time (optional)">
            <TextInput
              style={[fieldStyles.input, fieldStyles.single, type.body]}
              value={cookTime}
              onChangeText={setCookTime}
              placeholder="e.g. 30 min"
              placeholderTextColor={colors.textMuted}
              keyboardAppearance={keyboardAppearance}
              accessibilityLabel="Cook time"
            />
          </Field>
          <Field label="Category">
            <View style={styles.choiceWrap} accessibilityRole="radiogroup">
              {RECIPE_CATEGORIES.map((option) => (
                <Chip
                  key={option}
                  label={option}
                  selected={category === option}
                  onPress={() => setCategory(option)}
                />
              ))}
            </View>
          </Field>
          <Field label="Rating">
            <View style={styles.ratingRow} accessibilityRole="radiogroup">
              {[1, 2, 3].map((value) => {
                const selected = value === rating;
                return (
                  <Pressable
                    key={value}
                    onPress={() => setRating(value as 1 | 2 | 3)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    accessibilityLabel={`${value} star${value === 1 ? '' : 's'}`}
                    style={[styles.starButton, selected && { backgroundColor: colors.surface2, borderColor: accent.accent }]}
                  >
                    <Text style={[styles.star, selected && { color: accent.accent }]}>★</Text>
                  </Pressable>
                );
              })}
            </View>
          </Field>
          <Field label="Ingredients (optional, one per line)">
            <TextInput
              style={[fieldStyles.input, type.body, styles.textAreaSmall]}
              value={ingredients}
              onChangeText={setIngredients}
              placeholder={'200g flour\n2 eggs\nPinch of salt'}
              placeholderTextColor={colors.textMuted}
              keyboardAppearance={keyboardAppearance}
              multiline
              textAlignVertical="top"
              accessibilityLabel="Ingredients"
            />
          </Field>
          <Field label="Steps (optional, one per line)">
            <TextInput
              style={[fieldStyles.input, type.body, styles.textAreaSmall]}
              value={steps}
              onChangeText={setSteps}
              placeholder={'Boil water\nCook pasta 9 minutes\nToss with sauce'}
              placeholderTextColor={colors.textMuted}
              keyboardAppearance={keyboardAppearance}
              multiline
              textAlignVertical="top"
              accessibilityLabel="Steps"
            />
          </Field>
          <Field label="Notes (optional)">
            <TextInput
              style={[fieldStyles.input, fieldStyles.single, type.body]}
              value={recipeNotes}
              onChangeText={setRecipeNotes}
              placeholder="Cook time, servings, where it's from..."
              placeholderTextColor={colors.textMuted}
              keyboardAppearance={keyboardAppearance}
              accessibilityLabel="Recipe notes"
            />
          </Field>
        </>
      )}

      <View style={styles.actions}>
        <Button label="Cancel" variant="secondary" onPress={onCancel} />
        <Button label="Save" onPress={save} disabled={!canSave} accessibilityLabel="Save note" />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: 34, lineHeight: 38, letterSpacing: 1 },
  field: { gap: spacing.sm },
  textArea: { minHeight: 120, paddingTop: spacing.md, paddingBottom: spacing.md },
  textAreaSmall: { minHeight: 80, paddingTop: spacing.md, paddingBottom: spacing.md },
  muted: { color: colors.textMuted },
  photoButtons: { flexDirection: 'row', gap: spacing.sm },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  photoPreview: { width: 64, height: 64, borderRadius: radius.control, backgroundColor: colors.surface2 },
  removeText: { color: colors.accentStrong },
  choiceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  ratingRow: { flexDirection: 'row', gap: 8 },
  starButton: {
    width: sizes.control,
    height: sizes.controlSm,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  star: { color: colors.textMuted, fontSize: 22 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.xs },
});
