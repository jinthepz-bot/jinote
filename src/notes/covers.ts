import { Platform, type ViewStyle } from 'react-native';

import type { CoverId } from './store';

// The note page's optional coloured strip: five soft gradients from the cream palette.
export const COVERS: { id: CoverId; label: string; from: string; to: string }[] = [
  { id: 'sand', label: 'Sand', from: '#F3E6CD', to: '#E4CDA4' },
  { id: 'peach', label: 'Peach', from: '#F7DCC8', to: '#E9B594' },
  { id: 'sage', label: 'Sage', from: '#E2EAD5', to: '#BACCA8' },
  { id: 'sky', label: 'Sky', from: '#E1E9EE', to: '#B6C9D5' },
  { id: 'rose', label: 'Rose', from: '#F4DFDA', to: '#DFB3AB' },
];

// A CSS gradient on the web; React Native has no gradient without another package,
// so a phone or tablet build gets the lighter colour as a flat fill.
export function coverStyle(id: CoverId): ViewStyle {
  const c = COVERS.find((x) => x.id === id) ?? COVERS[0];
  if (Platform.OS !== 'web') return { backgroundColor: c.from };
  return {
    backgroundColor: c.from,
    backgroundImage: `linear-gradient(115deg, ${c.from} 0%, ${c.to} 100%)`,
  } as unknown as ViewStyle;
}
