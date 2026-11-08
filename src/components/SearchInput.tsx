import type { ComponentRef, Ref } from 'react';
import { Pressable, TextInput } from 'react-native';
import { colors, useAppStyles } from '../theme/styles';
import { CloseIcon, ControlIcon } from './icons';

/**
 * The inside of a search field: lens, text and a clear button. Shared by
 * Library and the bottom bar, so both search boxes look and act the same.
 * The caller supplies the field around it (a pill or glass).
 */
export function SearchInput({
  query,
  onChangeQuery,
  placeholder = 'Songs, artists, albums',
  accessibilityLabel = 'Search your music',
  autoFocus = false,
  onFocusChange,
  inputRef,
}: {
  query: string;
  onChangeQuery: (text: string) => void;
  placeholder?: string;
  accessibilityLabel?: string;
  autoFocus?: boolean;
  /** Told when the field gains or loses focus, for a focus outline. */
  onFocusChange?: (focused: boolean) => void;
  /** For focusing the field from elsewhere, such as Library's top bar. */
  inputRef?: Ref<ComponentRef<typeof TextInput>>;
}) {
  const styles = useAppStyles();
  return (
    <>
      <ControlIcon name="search" size={18} tone="muted" />
      <TextInput
        ref={inputRef}
        accessibilityLabel={accessibilityLabel}
        autoFocus={autoFocus}
        autoCorrect={false}
        onChangeText={onChangeQuery}
        onFocus={() => onFocusChange?.(true)}
        onBlur={() => onFocusChange?.(false)}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        returnKeyType="search"
        selectionColor={colors.lime}
        style={styles.searchFieldInput}
        value={query}
      />
      {query.length > 0 && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          onPress={() => onChangeQuery('')}
          style={styles.searchFieldClear}
        >
          <CloseIcon color="muted" size={13} />
        </Pressable>
      )}
    </>
  );
}
