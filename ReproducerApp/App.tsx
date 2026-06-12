/**
 * Reproducer — React Native on displays with a different density than the main one
 * (Samsung DeX, freeform multi-window, external monitors).
 *
 * Two distinct bugs are demonstrated, both rooted in RN's process-wide
 * DisplayMetricsHolder being initialized once (from the main/phone display)
 * and never updated:
 *
 *  [A] react-native-screens (Fabric, Android): `FabricEnabledViewGroup.updateState`
 *      converts the natively measured px size back to dp using the GLOBAL density,
 *      while Fabric mounting used the per-display density. On a display with a
 *      different density, every Screen pushes `windowSize / phoneDensity` into the
 *      Shadow Tree → all stack/tab content is squeezed into a 1/density-sized box.
 *
 *  [B] react-native core (Android): text sp→px conversion uses the same stale
 *      global density → glyphs are drawn ~phoneDensity× larger than their Yoga
 *      boxes → text overflows and clips everywhere.
 *
 * HOW TO REPRODUCE
 *  1. yarn android (build & install on a Samsung phone or any device with
 *     freeform windowing / DeX).
 *  2. Switch to Samsung DeX (or open the app in a freeform window on a display
 *     whose density differs from the phone).
 *  3. Observe:
 *     - "root onLayout (OUTSIDE stack)" ≈ window size (root tracks correctly)
 *     - "INSIDE ScreenStack" content ≈ window / phone-density  ← bug [A]
 *     - The fixed-size text boxes clip their glyphs            ← bug [B]
 *  On the phone display everything matches (single density → no mismatch).
 *
 * @format
 */
import React, {useState} from 'react';
import {
  PixelRatio,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import {
  ScreenStack,
  ScreenStackItem,
  enableScreens,
} from 'react-native-screens';

enableScreens(true);

type Size = {width: number; height: number} | null;
const fmt = (s: Size) =>
  s ? `${Math.round(s.width)} × ${Math.round(s.height)}` : '—';

function MeasureRow({
  label,
  value,
  dark,
}: {
  label: string;
  value: string;
  dark?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, dark && styles.rowValueDark]}>{value}</Text>
    </View>
  );
}

/** Fixed-size boxes — on a mismatched-density display the glyphs overflow/clip (bug B). */
function TextClippingProbe() {
  return (
    <View>
      <Text style={styles.sectionTitle}>
        16pt text in fixed 120×32 boxes (clips when density mismatches):
      </Text>
      <View style={styles.boxRow}>
        {['Hello', '안녕하세요', '12345'].map(t => (
          <View key={t} style={styles.box}>
            <Text style={styles.boxText}>{t}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function InsideStackContent({windowSize}: {windowSize: Size}) {
  const [inside, setInside] = useState<Size>(null);
  const onLayout = (e: LayoutChangeEvent) => setInside(e.nativeEvent.layout);

  const ratio =
    inside && windowSize && inside.width > 0
      ? (windowSize.width / inside.width).toFixed(3)
      : '—';

  return (
    <View style={styles.inside} onLayout={onLayout}>
      <Text style={styles.sectionTitle}>INSIDE ScreenStack (bug A)</Text>
      <MeasureRow dark label="content onLayout" value={fmt(inside)} />
      <MeasureRow dark label="window ÷ content width" value={ratio} />
      <Text style={styles.hint}>
        Expected ratio ≈ 1. On DeX/freeform it equals the PHONE display density
        (e.g. 2.8125 on a Galaxy S25 Ultra): react-native-screens converts px→dp
        with the global density while Fabric mounted with the per-display
        density. The pink border marks the Screen content bounds.
      </Text>
      <TextClippingProbe />
    </View>
  );
}

export default function App() {
  const win = useWindowDimensions();
  const [root, setRoot] = useState<Size>(null);

  return (
    <View style={styles.flex}>
      {/* Root probe — plain RN view OUTSIDE any Screen. Tracks the window correctly. */}
      <View
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
        onLayout={e => setRoot(e.nativeEvent.layout)}
      />
      <View style={styles.outside}>
        <Text style={styles.title}>Multi-display density reproducer</Text>
        <MeasureRow label="useWindowDimensions" value={fmt(win)} />
        <MeasureRow label="root onLayout (OUTSIDE stack)" value={fmt(root)} />
        <MeasureRow label="PixelRatio.get()" value={String(PixelRatio.get())} />
      </View>

      <ScreenStack style={styles.flex}>
        <ScreenStackItem
          screenId="repro"
          activityState={2}
          style={StyleSheet.absoluteFill}>
          <InsideStackContent windowSize={win} />
        </ScreenStackItem>
      </ScreenStack>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {flex: 1},
  outside: {
    paddingTop: 48,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#101418',
  },
  title: {color: '#FFD66B', fontSize: 16, fontWeight: '700', marginBottom: 8},
  inside: {
    flex: 1,
    padding: 16,
    backgroundColor: '#F4F6F8',
    borderWidth: 4,
    borderColor: '#D6336C',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginVertical: 8,
    color: '#1B1F23',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  rowLabel: {fontSize: 14, color: '#9AA4AF'},
  rowValue: {
    fontSize: 14,
    fontVariant: ['tabular-nums'],
    color: '#E8EDF2',
    fontWeight: '600',
  },
  rowValueDark: {color: '#1B1F23'},
  hint: {fontSize: 12, color: '#5C6670', marginTop: 6, marginBottom: 6},
  boxRow: {flexDirection: 'row', gap: 8, flexWrap: 'wrap'},
  box: {
    width: 120,
    height: 32,
    borderWidth: 1,
    borderColor: '#1B1F23',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  boxText: {fontSize: 16, color: '#1B1F23'},
});
