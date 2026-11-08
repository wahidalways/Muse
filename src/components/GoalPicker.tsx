import { Pressable, Text, View } from 'react-native';
import { LISTENING_GOAL_OPTIONS } from '../constants';
import { formatListeningTime } from '../utils/format';
import { useAppStyles } from '../theme/styles';

/** Daily listening goal choices as a row of chips. 0 turns the goal off. */
export function GoalPicker({
  goalMinutes,
  onChange,
}: {
  goalMinutes: number;
  onChange: (minutes: number) => void;
}) {
  const styles = useAppStyles();
  return (
    <View style={styles.goalChips} accessibilityRole="radiogroup">
      {LISTENING_GOAL_OPTIONS.map((minutes) => {
        const selected = minutes === goalMinutes;
        const label = minutes === 0 ? 'Off' : formatListeningTime(minutes * 60);
        return (
          <Pressable
            key={minutes}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={minutes === 0 ? 'No daily goal' : `${label} a day`}
            onPress={() => onChange(minutes)}
            style={[styles.goalChip, selected && styles.goalChipActive]}
          >
            <Text style={[styles.goalChipLabel, selected && styles.goalChipLabelActive]}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
