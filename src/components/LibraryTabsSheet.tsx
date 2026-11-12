import { Text } from 'react-native';

import { Sheet, SheetRow } from './Sheet';
import { ControlIcon } from './icons';
import { LIBRARY_TAB_CHOICES, setPreference, usePreferences } from '../settings/preferences';
import { useAppStyles } from '../theme/styles';
import { hapticSelection } from '../utils/haptics';

/**
 * Which two tabs follow Songs in Library. The one left out moves to
 * Collections › Browse, so nothing is lost. Opened by holding a Library tab,
 * or from Settings › Library.
 */
export function LibraryTabsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const styles = useAppStyles();
  const { libraryTabs } = usePreferences();
  return (
    <Sheet visible={visible} eyebrow="LIBRARY" title="Tabs" onClose={onClose}>
      <Text style={[styles.confirmMessage, { marginTop: 8, marginBottom: 6 }]}>
        Songs always comes first. Pick the other two. The one you leave out is in Collections › Browse.
      </Text>
      {LIBRARY_TAB_CHOICES.map((choice) => {
        const selected = choice.id === libraryTabs;
        return (
          <SheetRow
            key={choice.id}
            icon={<ControlIcon name={selected ? 'check' : 'note'} size={18} tone={selected ? 'accent' : 'muted'} />}
            label={`Songs, ${choice.label}`}
            detail={selected ? 'Shown' : undefined}
            onPress={() => {
              if (!selected) {
                hapticSelection();
                setPreference('libraryTabs', choice.id);
              }
              onClose();
            }}
          />
        );
      })}
    </Sheet>
  );
}
