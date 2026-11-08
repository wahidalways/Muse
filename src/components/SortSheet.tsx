import { Pressable, ScrollView, Text, View } from 'react-native';

import {
  defaultDirectionFor,
  directionLabelsFor,
  type SortDirection,
  type SortKind,
} from '../library/sortTracks';
import { useAppStyles } from '../theme/styles';
import { ControlIcon } from './icons';
import { Segmented } from './SettingsList';
import { Sheet } from './Sheet';

/** One way to sort. Its kind sets the order labels ("Newest first"). */
export type SortChoice = {
  id: string;
  label: string;
  kind: SortKind;
  hint?: string;
};

/**
 * Bottom sheet for choosing how the library is sorted. The order sits on
 * top as two plain choices ("A to Z" / "Z to A") for the current sort. A
 * tap on a sort applies it in its usual order (newest first for dates,
 * A to Z for names) and closes; a tap on the order applies and closes.
 */
export function SortSheet({
  visible,
  title,
  choices,
  sortBy,
  sortDirection,
  onChangeSort,
  onClose,
}: {
  visible: boolean;
  /** "Sort songs", "Sort albums"... */
  title: string;
  choices: SortChoice[];
  sortBy: string;
  sortDirection: SortDirection;
  onChangeSort: (sortBy: string, direction: SortDirection) => void;
  onClose: () => void;
}) {
  const styles = useAppStyles();
  const current = choices.find((choice) => choice.id === sortBy) ?? choices[0];
  const orderLabels = directionLabelsFor(current.kind);

  return (
    <Sheet visible={visible} eyebrow="LIBRARY" title={title} onClose={onClose}>
      <View style={styles.sortSheetOrder}>
        <Segmented
          label="Order"
          options={(['ascending', 'descending'] as const).map((id) => ({ id, label: orderLabels[id] }))}
          value={sortDirection}
          onChange={(direction) => {
            onChangeSort(sortBy, direction);
            onClose();
          }}
        />
      </View>
      <ScrollView
        style={styles.sortSheetScroll}
        showsVerticalScrollIndicator={false}
      >
        {choices.map((option) => {
          const selected = sortBy === option.id;
          return (
            <Pressable
              key={option.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={option.label}
              accessibilityHint={option.hint}
              onPress={() => {
                if (!selected) {
                  onChangeSort(option.id, defaultDirectionFor(option.kind));
                }
                onClose();
              }}
              style={({ pressed }) => [
                styles.sortSheetOption,
                selected && styles.sortSheetOptionSelected,
                pressed && !selected && styles.sortSheetOptionPressed,
              ]}
            >
              <View style={styles.sortSheetOptionCopy}>
                <Text
                  style={[
                    styles.sortSheetOptionLabel,
                    selected && styles.sortSheetOptionLabelSelected,
                  ]}
                >
                  {option.label}
                </Text>
                {option.hint && (
                  <Text style={styles.sortSheetOptionHint}>{option.hint}</Text>
                )}
              </View>
              {selected ? (
                <ControlIcon name="check" size={18} tone="accent" />
              ) : (
                <View style={styles.sortSheetRadio} />
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </Sheet>
  );
}
