import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextStyle } from 'react-native';

import { confirmDestructive } from '../design/confirm';
import { useType } from '../design/fonts';
import { hoverFill } from '../design/hover';
import { MenuRow, Popover, type PopoverAnchor } from '../design/Popover';
import { colors, keyboardAppearance, radius, spacing } from '../design/theme';
import { addFolder, deleteFolder, MAX_FOLDER_NAME, renameFolder, useNotes, type Folder } from '../notes/store';

const MENU_WIDTH = 170;
const noOutline = { outlineStyle: 'none', outlineWidth: 0 } as unknown as TextStyle;

// The Journal section's folders in the sidebar: a collapsible list with how many
// notes each holds, "+ New folder", and a right-click menu to rename or delete.
export function SidebarFolders({
  activeFolderId,
  activeColor,
  onOpen,
}: {
  activeFolderId: string | undefined;
  activeColor: string;
  onOpen: (folderId: string) => void;
}) {
  const type = useType();
  const { state } = useNotes();
  const [open, setOpen] = useState(true);
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ folder: Folder; anchor: PopoverAnchor } | null>(null);

  const counts = new Map<string, number>();
  for (const n of state.notes) if (n.folderId) counts.set(n.folderId, (counts.get(n.folderId) ?? 0) + 1);

  const confirmDelete = (folder: Folder) => {
    const count = counts.get(folder.id) ?? 0;
    confirmDestructive({
      title: `Delete folder "${folder.name}"?`,
      message:
        count === 0
          ? 'It is empty.'
          : `Its ${count} ${count === 1 ? 'note stays' : 'notes stay'} in your Journal, just not in a folder.`,
      confirmLabel: 'Delete folder',
      onConfirm: () => deleteFolder(folder.id),
    });
  };

  return (
    <View style={styles.root}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityLabel={open ? 'Collapse folders' : 'Expand folders'}
        accessibilityState={{ expanded: open }}
        style={(s) => [styles.header, hoverFill(s)]}
      >
        <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={12} color={colors.textMuted} />
        <Text style={[type.label, styles.headerText]}>Folders</Text>
      </Pressable>

      {open ? (
        <>
          {state.folders.map((folder) =>
            renaming === folder.id ? (
              <NameInput
                key={folder.id}
                initial={folder.name}
                label={`Rename folder ${folder.name}`}
                onDone={(name) => {
                  if (name !== null) renameFolder(folder.id, name);
                  setRenaming(null);
                }}
              />
            ) : (
              <FolderLink
                key={folder.id}
                folder={folder}
                count={counts.get(folder.id) ?? 0}
                active={activeFolderId === folder.id}
                activeColor={activeColor}
                onPress={() => onOpen(folder.id)}
                onContextMenu={(x, y) => setMenu({ folder, anchor: { top: y, left: x } })}
              />
            ),
          )}
          {creating ? (
            <NameInput
              initial=""
              label="New folder name"
              onDone={(name) => {
                if (name !== null) addFolder(name);
                setCreating(false);
              }}
            />
          ) : (
            <Pressable
              onPress={() => setCreating(true)}
              accessibilityRole="button"
              accessibilityLabel="New folder"
              style={(s) => [styles.row, hoverFill(s)]}
            >
              <Ionicons name="add" size={15} color={colors.textMuted} />
              <Text style={[type.body, styles.newText]}>New folder</Text>
            </Pressable>
          )}
        </>
      ) : null}

      <Popover anchor={menu?.anchor ?? null} width={MENU_WIDTH} onClose={() => setMenu(null)}>
        {menu ? (
          <>
            <MenuRow
              icon="create-outline"
              label="Rename"
              onPress={() => {
                setRenaming(menu.folder.id);
                setMenu(null);
              }}
            />
            <MenuRow
              icon="trash-outline"
              label="Delete folder"
              danger
              onPress={() => {
                const folder = menu.folder;
                setMenu(null);
                confirmDelete(folder);
              }}
            />
          </>
        ) : null}
      </Popover>
    </View>
  );
}

function FolderLink({
  folder,
  count,
  active,
  activeColor,
  onPress,
  onContextMenu,
}: {
  folder: Folder;
  count: number;
  active: boolean;
  activeColor: string;
  onPress: () => void;
  onContextMenu: (x: number, y: number) => void;
}) {
  const type = useType();
  const ref = useRef<View>(null);
  const handler = useRef(onContextMenu);
  handler.current = onContextMenu;

  // Right-click opens the folder's menu instead of the browser's (web only; there's
  // no right-click elsewhere).
  useEffect(() => {
    const node = ref.current as unknown as HTMLElement | null;
    if (!node?.addEventListener) return;
    const listener = (e: MouseEvent) => {
      e.preventDefault();
      handler.current(e.clientX, e.clientY);
    };
    node.addEventListener('contextmenu', listener);
    return () => node.removeEventListener('contextmenu', listener);
  }, []);

  const tint = active ? activeColor : colors.text;
  return (
    <View ref={ref} collapsable={false}>
      <Pressable
        onPress={onPress}
        accessibilityRole="link"
        accessibilityLabel={`Folder ${folder.name}, ${count} ${count === 1 ? 'note' : 'notes'}`}
        accessibilityState={{ selected: active }}
        style={(s) => [styles.row, active && styles.rowActive, hoverFill(s)]}
      >
        <Ionicons name={active ? 'folder' : 'folder-outline'} size={15} color={tint} />
        <Text style={[active ? type.bodyStrong : type.body, styles.name, { color: tint }]} numberOfLines={1}>
          {folder.name}
        </Text>
        <Text style={[type.body, styles.count]}>{count}</Text>
      </Pressable>
    </View>
  );
}

// Inline name field for a new or renamed folder: Enter or leaving it saves, Escape
// cancels. `onDone(null)` means cancelled.
function NameInput({ initial, label, onDone }: { initial: string; label: string; onDone: (name: string | null) => void }) {
  const type = useType();
  const [name, setName] = useState(initial);
  const done = useRef(false);
  const finish = (value: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(value !== null && value.trim() ? value : null);
  };
  return (
    <View style={styles.row}>
      <Ionicons name="folder-outline" size={15} color={colors.textMuted} />
      <TextInput
        style={[type.body, styles.input, noOutline]}
        value={name}
        onChangeText={setName}
        autoFocus
        selectTextOnFocus
        maxLength={MAX_FOLDER_NAME}
        placeholder="Folder name"
        placeholderTextColor={colors.textMuted}
        keyboardAppearance={keyboardAppearance}
        onSubmitEditing={() => finish(name)}
        onBlur={() => finish(name)}
        onKeyPress={(e) => {
          if (e.nativeEvent.key === 'Escape') finish(null);
        }}
        accessibilityLabel={label}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 2, marginTop: spacing.xs },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 26,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radius.control,
  },
  headerText: { fontSize: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 32,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radius.control,
  },
  rowActive: { backgroundColor: colors.surface },
  name: { flex: 1, fontSize: 14 },
  count: { fontSize: 12, color: colors.textMuted },
  newText: { fontSize: 14, color: colors.textMuted },
  input: {
    flex: 1,
    minWidth: 0,
    height: 26,
    paddingHorizontal: 6,
    fontSize: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.square,
    backgroundColor: colors.surface,
    color: colors.text,
  },
});
