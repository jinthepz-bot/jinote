import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { formatAmount, parseAmount, sanitizeAmountInput } from '../coach/format';
import type { BuyItem } from '../coach/store';
import { hoverDim } from '../design/hover';
import { useAccent } from '../design/accent';
import { useType } from '../design/fonts';
import { colors, radius, sizes, spacing, keyboardAppearance } from '../design/theme';
import { Card, Checkbox, RowIconButton } from '../design/ui';

interface Props {
  items: BuyItem[];
  onAdd: (name: string, price: number | null) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

export function BuyListCard({ items, onAdd, onToggle, onDelete }: Props) {
  const type = useType();
  const accent = useAccent();
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const canAdd = name.trim() !== '';

  // Still-to-buy first, bought items sink to the bottom.
  const sorted = [...items].sort((a, b) => Number(a.bought) - Number(b.bought) || a.createdAt - b.createdAt);

  const add = () => {
    if (!canAdd) return;
    onAdd(name.trim(), parseAmount(price));
    setName('');
    setPrice('');
  };

  return (
    <Card style={styles.card}>
      {sorted.length === 0 ? (
        <Text style={[type.body, styles.empty]}>Nothing to buy. Add an item below.</Text>
      ) : (
        sorted.map((item, i) => (
          <View key={item.id} style={[styles.row, i > 0 && styles.divider]}>
            <Checkbox checked={item.bought} onPress={() => onToggle(item.id)} label={`Bought ${item.name}`} />
            <Text style={[type.body, styles.name, item.bought && styles.boughtText]} onPress={() => onToggle(item.id)}>
              {item.name}
            </Text>
            {item.price !== null ? (
              <Text style={[type.mono, styles.price, item.bought && styles.boughtText]}>{formatAmount(item.price)}</Text>
            ) : null}
            <RowIconButton icon="trash-outline" label={`Delete ${item.name}`} onPress={() => onDelete(item.id)} />
          </View>
        ))
      )}

      <View style={styles.addRow}>
        <TextInput
          style={[styles.input, type.body, styles.nameInput]}
          value={name}
          onChangeText={setName}
          placeholder="Item"
          placeholderTextColor={colors.textMuted}
          keyboardAppearance={keyboardAppearance}
          returnKeyType="done"
          onSubmitEditing={add}
          submitBehavior="submit"
          accessibilityLabel="Item name"
        />
        <TextInput
          style={[styles.input, type.mono, styles.priceInput]}
          value={price}
          onChangeText={(text) => setPrice(sanitizeAmountInput(text))}
          placeholder="Price"
          placeholderTextColor={colors.textMuted}
          keyboardType="decimal-pad"
          keyboardAppearance={keyboardAppearance}
          accessibilityLabel="Item price"
        />
        <Pressable
          onPress={add}
          disabled={!canAdd}
          style={(state) => [
            styles.addButton,
            { backgroundColor: accent.accent },
            !canAdd && styles.disabled,
            hoverDim(state),
          ]}
          accessibilityRole="button"
          accessibilityLabel="Add item"
        >
          <Ionicons name="add" size={22} color={accent.onAccent} />
        </Pressable>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: 0, overflow: 'hidden' },
  empty: { color: colors.textMuted, paddingHorizontal: spacing.lg, paddingVertical: spacing.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  name: { flex: 1 },
  price: { color: colors.text, fontSize: 13 },
  boughtText: { color: colors.textMuted, textDecorationLine: 'line-through' },
  pressed: { opacity: 0.6 },
  addRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface2,
  },
  input: {
    height: sizes.control,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
    paddingHorizontal: spacing.md,
    color: colors.text,
  },
  nameInput: { flex: 1, minWidth: 0 },
  priceInput: { width: 84 },
  addButton: {
    width: sizes.control,
    height: sizes.control,
    borderRadius: radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.45 },
});
