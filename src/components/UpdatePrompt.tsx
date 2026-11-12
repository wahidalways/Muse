import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { AppIconMark } from './AppIconSheet';
import { APP_VERSION } from './Brand';
import { Sheet } from './Sheet';
import { showToast } from './Toast';
import {
  addUpdateProgressListener,
  addUpdateStatusListener,
  canInstallUpdates,
  cancelUpdateDownload,
  downloadUpdate,
  installUpdate,
} from '../../modules/muse-audio-metadata/files';
import { POP_IN, PUSH_IN } from '../motion/motion';
import { usePreferences } from '../settings/preferences';
import { checkForUpdate, fetchReleaseNotes, isNewer, shortVersion, type UpdateCheck } from '../settings/updates';
import {
  SNOOZE_CHOICES,
  changeUpdatePrompt,
  getUpdatePrompt,
  isCheckDue,
  isSnoozed,
  updatePromptReady,
} from '../settings/updatePrompt';
import { formatBytes } from '../utils/format';
import { useAppStyles } from '../theme/styles';

export type AvailableUpdate = Extract<UpdateCheck, { status: 'available' }>;
type IconName = ComponentProps<typeof Ionicons>['name'];

const DAY_MS = 24 * 60 * 60 * 1000;
const shortDate = (time: number) => new Date(time).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/** The next minor version after this app's, for the preview. */
function nextVersion(version: string): string {
  const [major = 1, minor = 0] = version.split('.').map((part) => Number.parseInt(part, 10) || 0);
  return `${major}.${minor + 1}.0`;
}

/** A made-up release for the Expo Go preview (Settings › Updates). */
export const DEMO_UPDATE: AvailableUpdate = {
  status: 'available',
  version: nextVersion(APP_VERSION),
  url: 'https://github.com/wahidalways/Muse/releases',
  apkUrl: null,
  apkName: 'Muse-next.apk',
  apkSize: 16_000_000,
  apkSha256: null,
  notes: [
    '## New',
    "- APE, WavPack, DSD and AIFF play, with Muse's own decoders",
    '- Hi-Res and bit-perfect output to USB DACs',
    '- A Folders tab in Library, with play, queue, exclude and delete',
    "- Home screen widgets: now playing and today's listening",
    '- Updates download inside Muse',
    '## Better',
    '- WAV and AIFF show their real titles, artists and covers',
    '- Cover search finds the right album more often',
    '- Home sections sit in clearer groups',
    '## Fixed',
    '- The Library sort button stays on screen',
  ].join('\n'),
  publishedAt: new Date().toISOString(),
};

/** This version's notes, shown once after updating. */
const installedRelease = (notes: string): AvailableUpdate => ({
  status: 'available',
  version: APP_VERSION,
  url: '',
  apkUrl: null,
  apkName: null,
  apkSize: null,
  apkSha256: null,
  notes,
  publishedAt: null,
});

type Stage =
  | { kind: 'idle' }
  | { kind: 'downloading'; received: number; total: number }
  | { kind: 'installing' }
  | { kind: 'confirm' }
  | { kind: 'demoDone' }
  | { kind: 'failed'; message: string };

type Kind = 'new' | 'better' | 'fixed' | 'other';
type Group = { title: string | null; kind: Kind; items: string[] };

const GLYPH: Record<Kind, IconName> = { new: 'add', better: 'arrow-up', fixed: 'checkmark', other: 'ellipse' };
const kindOf = (title: string): Kind =>
  /fix/i.test(title) ? 'fixed' : /better|improv|chang/i.test(title) ? 'better' : /new|add/i.test(title) ? 'new' : 'other';

/** Release notes as groups: each "## New" heading starts one, changes before any heading make their own. */
function noteGroups(notes: string): Group[] {
  const groups: Group[] = [];
  for (const raw of notes.split('\n')) {
    const line = raw.trim();
    if (!line || line === '…') {
      continue;
    }
    if (line.startsWith('#')) {
      const title = line.replace(/^#+\s*/, '');
      groups.push({ title, kind: kindOf(title), items: [] });
      continue;
    }
    if (groups.length === 0) {
      groups.push({ title: null, kind: 'other', items: [] });
    }
    groups[groups.length - 1].items.push(line.replace(/^([-*•]|\d+\.)\s+/, '').replace(/\*\*/g, ''));
  }
  return groups.filter((group) => group.items.length > 0);
}

/** Saves a "Remind me" choice (the preview only says what it would do). */
function snooze(days: number | null, save: boolean) {
  if (days === null) {
    if (save) {
      changeUpdatePrompt({ autoCheck: false, snoozeUntil: null });
    }
    showToast('Update reminders are off', { detail: 'Turn them on again in Settings › Updates', icon: 'timer' });
    return;
  }
  const until = Date.now() + days * DAY_MS;
  if (save) {
    changeUpdatePrompt({ snoozeUntil: until });
  }
  showToast('No update reminders for now', { detail: `Until ${shortDate(until)}. Settings still shows it`, icon: 'timer' });
}

/** Changes shown before "See all". */
const NOTES_PREVIEW = 4;

/** The changes, grouped under New / Better / Fixed, first few then "See all". */
function ChangeList({ notes }: { notes: string }) {
  const styles = useAppStyles();
  const [isOpen, setIsOpen] = useState(false);
  const groups = noteGroups(notes);
  const total = groups.reduce((sum, group) => sum + group.items.length, 0);
  const hasMore = total > NOTES_PREVIEW + 1;
  const limit = isOpen || !hasMore ? total : NOTES_PREVIEW;
  // How many changes come before each group, so the short list stops at the limit.
  const before = groups.map((_, index) => groups.slice(0, index).reduce((sum, group) => sum + group.items.length, 0));
  const shown = groups
    .map((group, index) => ({ ...group, items: group.items.slice(0, Math.max(0, limit - before[index])), count: group.items.length }))
    .filter((group) => group.items.length > 0);
  if (total === 0) {
    return null;
  }
  return (
    <ScrollView style={styles.updateList} contentContainerStyle={styles.updateListContent} nestedScrollEnabled>
      {shown.map((group, groupIndex) => (
        <View key={groupIndex}>
          {group.title ? (
            <View style={styles.updateGroupHead} accessibilityRole="header">
              <Text style={styles.updateGroupTitle}>{group.title}</Text>
              <Text style={styles.updateGroupCount}>{group.count}</Text>
            </View>
          ) : null}
          {group.items.map((text, index) => (
            <View key={index} style={[styles.updateChange, index > 0 && styles.updateChangeLine]}>
              <Ionicons
                accessible={false}
                name={GLYPH[group.kind]}
                size={group.kind === 'other' ? 7 : 18}
                style={group.kind === 'other' ? styles.updateChangeDot : styles.updateChangeGlyph}
              />
              <Text style={styles.updateChangeText}>{text}</Text>
            </View>
          ))}
        </View>
      ))}
      {hasMore && (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: isOpen }}
          onPress={() => setIsOpen((open) => !open)}
          style={({ pressed }) => [styles.updateMore, pressed && styles.primaryButtonPressed]}
        >
          <Text style={styles.updateMoreText}>{isOpen ? 'Show less' : `See all ${total} changes`}</Text>
          <Ionicons accessible={false} name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} style={styles.updateMoreGlyph} />
        </Pressable>
      )}
    </ScrollView>
  );
}

/** A quiet text button under the main action. */
function GhostButton({ label, onPress, icon }: { label: string; onPress: () => void; icon?: IconName }) {
  const styles = useAppStyles();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.updateGhost, pressed && styles.primaryButtonPressed]}>
      {icon && <Ionicons accessible={false} name={icon} size={16} style={styles.updateMutedGlyph} />}
      <Text style={styles.updateGhostText}>{label}</Text>
    </Pressable>
  );
}

/** Download › Check › Install, so the wait has a shape. */
function Steps({ at }: { at: number }) {
  const styles = useAppStyles();
  return (
    <View style={styles.updateSteps} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {['Download', 'Check', 'Install'].map((label, index) => (
        <View key={label} style={styles.updateStep}>
          {index < at ? (
            <Ionicons name="checkmark" size={14} style={styles.updateStepTextDone} />
          ) : (
            <View style={[styles.updateStepDot, index === at && styles.updateStepDotOn]} />
          )}
          <Text style={[styles.updateStepText, index === at && styles.updateStepTextOn, index < at && styles.updateStepTextDone]}>{label}</Text>
          {index < 2 && <View style={styles.updateStepLine} />}
        </View>
      ))}
    </View>
  );
}

/**
 * The update sheet, for Check for updates, the daily check and What's new
 * after updating: an accent header with the version, size and date, the
 * changes in groups, then Update. Update downloads the APK inside Muse (the
 * button fills as it goes), checks it against GitHub's fingerprint and opens
 * Android's install prompt. From the daily check, Later opens "Remind me"
 * (tomorrow, a week, two weeks, a month or never). `demo` (Expo Go) plays a
 * pretend download and saves nothing; `installed` thanks and shows Done.
 */
export function UpdatePopup({
  update,
  onClose,
  canSnooze = false,
  demo = false,
  installed = false,
}: {
  update: AvailableUpdate | null;
  onClose: () => void;
  canSnooze?: boolean;
  demo?: boolean;
  installed?: boolean;
}) {
  const styles = useAppStyles();
  const { appIcon } = usePreferences();
  const [stage, setStage] = useState<Stage>({ kind: 'idle' });
  const [page, setPage] = useState<'main' | 'later'>('main');
  // Pages slide only after a switch, so the first page rises with the sheet.
  const [hasTurned, setHasTurned] = useState(false);
  const [barWidth, setBarWidth] = useState(0);
  // When "Remind me" opened, for its "Until 19 Nov" dates.
  const [laterAt, setLaterAt] = useState(0);
  // The last update stays drawn while the sheet fades away; each opening starts fresh.
  const [shown, setShown] = useState(update);
  const [lastProp, setLastProp] = useState<AvailableUpdate | null>(null);
  if (update !== lastProp) {
    setLastProp(update);
    if (update) {
      setShown(update);
      setStage({ kind: 'idle' });
      setPage('main');
      setHasTurned(false);
    }
  }
  const demoTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopDemo = () => {
    if (demoTimer.current) {
      clearInterval(demoTimer.current);
      demoTimer.current = null;
    }
  };

  useEffect(() => {
    const progress = addUpdateProgressListener(({ received, total }) =>
      setStage((current) => (current.kind === 'downloading' ? { kind: 'downloading', received, total } : current)),
    );
    const status = addUpdateStatusListener(({ status: result, message }) => {
      if (result === 'confirm') {
        setStage({ kind: 'confirm' });
      } else if (result === 'cancelled') {
        setStage({ kind: 'idle' });
      } else if (result === 'failed') {
        setStage({ kind: 'failed', message: message ?? 'Android could not install it.' });
      }
      // "installed": Android replaces Muse, which closes it.
    });
    return () => {
      progress.remove();
      status.remove();
      if (demoTimer.current) {
        clearInterval(demoTimer.current);
      }
    };
  }, []);

  if (!shown) {
    return null;
  }
  const busy = stage.kind === 'downloading' || stage.kind === 'installing';
  const version = shortVersion(shown.version);
  const openGitHub = () => void Linking.openURL(shown.url).catch(() => undefined);
  const close = () => {
    stopDemo();
    onClose();
  };
  const turn = (next: 'main' | 'later') => {
    if (next === 'later') {
      setLaterAt(Date.now());
    }
    setHasTurned(true);
    setPage(next);
  };

  const start = async () => {
    const total = shown.apkSize ?? 0;
    if (demo) {
      let received = 0;
      let ticks = 0;
      setStage({ kind: 'downloading', received, total });
      demoTimer.current = setInterval(() => {
        ticks += 1;
        received = Math.min(total, received + total / 25);
        if (received < total) {
          setStage({ kind: 'downloading', received, total });
        } else if (ticks < 36) {
          setStage({ kind: 'installing' });
        } else {
          stopDemo();
          setStage({ kind: 'demoDone' });
        }
      }, 100);
      return;
    }
    if (!canInstallUpdates || !shown.apkUrl) {
      openGitHub();
      return;
    }
    setStage({ kind: 'downloading', received: 0, total });
    try {
      const path = await downloadUpdate(shown.apkUrl, shown.apkName ?? `Muse-${shown.version}.apk`, shown.apkSha256, shown.apkSize);
      setStage({ kind: 'installing' });
      await installUpdate(path);
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      if (code === 'ERR_CANCELLED') {
        setStage({ kind: 'idle' });
      } else {
        setStage({ kind: 'failed', message: error instanceof Error ? error.message : 'The download failed.' });
      }
    }
  };
  const cancel = () => {
    if (demo) {
      stopDemo();
      setStage({ kind: 'idle' });
      return;
    }
    cancelUpdateDownload();
  };

  // ---- Header: the accent hero, or the "Remind me" title on the second page.
  const eyebrow = installed
    ? 'UPDATED'
    : stage.kind === 'downloading'
      ? 'DOWNLOADING'
      : stage.kind === 'installing'
        ? 'ALMOST THERE'
        : stage.kind === 'confirm' || stage.kind === 'demoDone'
          ? 'READY TO INSTALL'
          : demo
            ? 'UPDATE · PREVIEW'
            : 'UPDATE AVAILABLE';
  const lead = installed
    ? 'Thanks for updating. Here is what changed.'
    : stage.kind === 'confirm'
      ? "Android's installer is open. Muse restarts once it's done."
      : stage.kind === 'demoDone'
        ? "Downloaded. In the Muse app, Android's install prompt opens now."
        : busy
          ? "Keep Muse open until Android's installer appears."
          : 'A new version of Muse is ready.';
  const changeCount = noteGroups(shown.notes).reduce((sum, group) => sum + group.items.length, 0);
  const facts: { icon: IconName | null; text: string }[] = installed
    ? changeCount > 0
      ? [{ icon: null, text: `${changeCount} changes` }]
      : []
    : [
        ...(shown.apkSize ? [{ icon: 'arrow-down' as const, text: formatBytes(shown.apkSize) }] : []),
        ...(shown.publishedAt ? [{ icon: 'calendar-clear-outline' as const, text: `Out ${shortDate(Date.parse(shown.publishedAt))}` }] : []),
      ];
  const from = shortVersion(APP_VERSION);
  const factsLabel = [installed ? null : `Version ${from} to ${version}`, ...facts.map((fact) => fact.text)].filter(Boolean).join(', ');

  const header =
    page === 'later' ? (
      <Animated.View key="later" entering={PUSH_IN} style={styles.updateLaterHead}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => turn('main')} style={styles.updateBack}>
          <Ionicons name="chevron-back" size={22} style={styles.updateTextGlyph} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.updateLaterTitle}>
          Remind me about {version}
        </Text>
      </Animated.View>
    ) : (
      <Animated.View key="main" entering={hasTurned ? POP_IN : undefined} style={styles.updateHero}>
        <View style={styles.updateHeroTop}>
          <AppIconMark id={appIcon} size={52} />
          <Text style={styles.updateHeroEyebrow}>{eyebrow}</Text>
        </View>
        <Text accessibilityRole="header" style={styles.updateHeroTitle} numberOfLines={1}>
          Muse {version}
        </Text>
        <Text style={styles.updateHeroLead}>{lead}</Text>
        <View style={styles.updateFacts} accessible accessibilityLabel={factsLabel}>
          {!installed && (
            <View style={styles.updateFact}>
              <Text style={styles.updateFactText}>{from}</Text>
              <Ionicons name="arrow-forward" size={13} style={styles.updateFactGlyph} />
              <Text style={styles.updateFactText}>{version}</Text>
            </View>
          )}
          {facts.map((fact) => (
            <View key={fact.text} style={styles.updateFact}>
              {fact.icon && <Ionicons name={fact.icon} size={14} style={styles.updateFactGlyph} />}
              <Text style={styles.updateFactText}>{fact.text}</Text>
            </View>
          ))}
        </View>
      </Animated.View>
    );

  // ---- Second page: when to ask again.
  if (page === 'later') {
    const choices = [
      { label: 'Tomorrow', detail: 'Same as closing this', days: 0 as number | null },
      ...SNOOZE_CHOICES.map((choice) => ({
        label: choice.days === null ? 'Never' : `In ${choice.label}`,
        detail: choice.days === null ? 'Turns off update reminders. Settings can still check' : `Until ${shortDate(laterAt + choice.days * DAY_MS)}`,
        days: choice.days as number | null,
      })),
    ];
    return (
      <Sheet visible={update !== null} eyebrow="UPDATE" title={`Remind me about ${version}`} onClose={() => turn('main')} header={header}>
        <Animated.View entering={PUSH_IN} style={styles.updateChoices}>
          {choices.map((choice, index) => (
            <Pressable
              key={choice.label}
              accessibilityRole="button"
              accessibilityHint={choice.detail}
              onPress={() => {
                if (choice.days !== 0) {
                  snooze(choice.days, !demo);
                }
                close();
              }}
              style={({ pressed }) => [styles.updateChoice, index > 0 && styles.updateChoiceLine, pressed && styles.sortSheetOptionPressed]}
            >
              <View style={styles.settingCopy}>
                <Text style={[styles.updateChoiceLabel, choice.days === null && styles.sheetRowDanger]}>{choice.label}</Text>
                <Text style={styles.updateChoiceDetail}>{choice.detail}</Text>
              </View>
              <Ionicons accessible={false} name="chevron-forward" size={18} style={styles.updateMutedGlyph} />
            </Pressable>
          ))}
        </Animated.View>
      </Sheet>
    );
  }

  // ---- Footer: the main action changes in place, so the thing tapped is the thing that moves.
  const percent = stage.kind === 'downloading' && stage.total > 0 ? Math.round((stage.received / stage.total) * 100) : 0;
  const amount =
    stage.kind === 'downloading'
      ? stage.total > 0
        ? `${formatBytes(stage.received)} of ${formatBytes(stage.total)}`
        : `${formatBytes(stage.received)} so far`
      : '';
  const stepAt = stage.kind === 'downloading' ? 0 : stage.kind === 'installing' ? 1 : stage.kind === 'confirm' || stage.kind === 'demoDone' ? 2 : -1;

  let action;
  if (installed) {
    action = (
      <Pressable accessibilityRole="button" onPress={close} style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}>
        <Text style={styles.primaryButtonLabel}>Done</Text>
      </Pressable>
    );
  } else if (stage.kind === 'downloading') {
    // The words are drawn twice: plain over the track, dark inside the fill, so they read wherever its edge is.
    action = (
      <View
        style={styles.updateBar}
        onLayout={(event) => setBarWidth(event.nativeEvent.layout.width)}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel="Downloading the update"
        accessibilityValue={{ min: 0, max: 100, now: percent }}
      >
        <View style={styles.updateBarLabel}>
          <Text style={styles.updateBarText}>Downloading</Text>
          <Text style={styles.updateBarText}>{amount}</Text>
        </View>
        <View style={[styles.updateBarFill, { width: `${percent}%` }]}>
          <View style={[styles.updateBarLabel, { width: barWidth }]}>
            <Text style={styles.updateBarFillText}>Downloading</Text>
            <Text style={styles.updateBarFillText}>{amount}</Text>
          </View>
        </View>
      </View>
    );
  } else if (stage.kind === 'installing') {
    action = (
      <View style={styles.updateBar} accessible accessibilityLabel="Checking the file">
        <View style={[styles.updateBarLabel, styles.updateBarStart]}>
          <ActivityIndicator size="small" color={String(styles.updateBarText.color)} />
          <Text style={styles.updateBarText}>Checking the file</Text>
        </View>
      </View>
    );
  } else if (stage.kind === 'confirm' || stage.kind === 'demoDone') {
    action = (
      <View style={[styles.updateBar, styles.updateBarDone]} accessible accessibilityLabel="Tap Update in Android's prompt">
        <View style={[styles.updateBarLabel, styles.updateBarStart]}>
          <Ionicons name="checkmark" size={20} style={styles.updateGoGlyph} />
          <Text style={styles.updateBarFillText}>Tap Update in Android&apos;s prompt</Text>
        </View>
      </View>
    );
  } else if (stage.kind === 'failed') {
    action = (
      <Pressable accessibilityRole="button" onPress={() => void start()} style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}>
        <Text style={styles.primaryButtonLabel}>Try again</Text>
      </Pressable>
    );
  } else {
    action = (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={shown.apkSize ? `Update, ${formatBytes(shown.apkSize)}` : 'Update'}
        onPress={() => void start()}
        style={({ pressed }) => [styles.primaryButton, styles.updateGo, pressed && styles.primaryButtonPressed]}
      >
        <Ionicons accessible={false} name="arrow-down" size={18} style={styles.updateGoGlyph} />
        <Text style={styles.primaryButtonLabel}>Update</Text>
        {shown.apkSize ? <Text style={[styles.primaryButtonLabel, styles.updateGoSize]}>· {formatBytes(shown.apkSize)}</Text> : null}
      </Pressable>
    );
  }

  const under =
    stage.kind === 'downloading' ? (
      <GhostButton label="Cancel download" onPress={cancel} />
    ) : stage.kind === 'installing' ? (
      <Text style={styles.updateNote}>Android&apos;s installer opens next</Text>
    ) : stage.kind === 'confirm' ? (
      <Text style={styles.updateNote}>Muse closes and opens again, updated</Text>
    ) : stage.kind === 'demoDone' ? (
      <GhostButton label="Close" onPress={close} />
    ) : stage.kind === 'failed' ? (
      <GhostButton label="Get it on GitHub instead" onPress={openGitHub} icon="logo-github" />
    ) : installed ? null : (
      // Split Later: the word closes (the daily check asks again tomorrow), the arrow picks when.
      <View style={styles.updateSplit}>
        <Pressable
          accessibilityRole="button"
          onPress={close}
          style={({ pressed }) => [styles.updateSplitWord, pressed && styles.primaryButtonPressed]}
        >
          <Text style={styles.updateGhostText}>Later</Text>
        </Pressable>
        {canSnooze && (
          <>
            <View style={styles.updateSplitLine} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Remind me later"
              accessibilityHint="Choose when to be reminded"
              onPress={() => turn('later')}
              style={({ pressed }) => [styles.updateSplitArrow, pressed && styles.primaryButtonPressed]}
            >
              <Ionicons accessible={false} name="chevron-down" size={18} style={styles.updateMutedGlyph} />
            </Pressable>
          </>
        )}
      </View>
    );

  return (
    <Sheet
      visible={update !== null}
      eyebrow={eyebrow}
      title={`Muse ${version}`}
      // While it downloads, only Cancel stops it: a stray tap outside or a drag springs back.
      onClose={busy ? () => undefined : close}
      guarded={busy}
      header={header}
    >
      <Animated.View entering={hasTurned ? POP_IN : undefined} style={styles.updateBody}>
        {shown.notes ? <ChangeList key={shown.version} notes={shown.notes} /> : null}
        <View style={styles.updateFoot}>
          {stage.kind === 'failed' && (
            <View style={styles.updateError} accessibilityRole="alert">
              <Ionicons accessible={false} name="alert-circle-outline" size={20} style={styles.updateErrorGlyph} />
              <View style={styles.settingCopy}>
                <Text style={styles.updateErrorTitle}>The update didn&apos;t finish</Text>
                <Text style={styles.updateErrorText}>{stage.message}</Text>
              </View>
            </View>
          )}
          {stepAt >= 0 && <Steps at={stepAt} />}
          {action}
          {under}
        </View>
      </Animated.View>
    </Sheet>
  );
}

/**
 * Runs once Muse is on screen (after the launch screen): What's new once
 * after an update, else the daily update check. Quiet when offline, up to
 * date, turned off or paused.
 */
export function UpdatePrompt({ enabled }: { enabled: boolean }) {
  const [whatsNew, setWhatsNew] = useState<AvailableUpdate | null>(null);
  const [update, setUpdate] = useState<AvailableUpdate | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    let isActive = true;
    void (async () => {
      await updatePromptReady;
      const prompt = getUpdatePrompt();
      const now = Date.now();
      // Before the version was saved, the hello's flag (from 1.0.x) tells an update from a new install.
      const seen = prompt.seenVersion ?? ((await wasUsedBefore()) ? '1.0.1' : null);
      if (seen === null) {
        // A new install: setup greets it; What's new starts from the next update.
        changeUpdatePrompt({ seenVersion: APP_VERSION });
      } else if (seen !== APP_VERSION && isNewer(APP_VERSION, seen)) {
        changeUpdatePrompt({ seenVersion: APP_VERSION, waitingVersion: null });
        const text = await fetchReleaseNotes(APP_VERSION);
        if (isActive && text) {
          setWhatsNew(installedRelease(text));
        }
        return;
      } else if (prompt.seenVersion === null) {
        changeUpdatePrompt({ seenVersion: APP_VERSION });
      }
      if (!isCheckDue(prompt, now)) {
        return;
      }
      const result = await checkForUpdate(APP_VERSION);
      if (!isActive || result.status === 'error') {
        return;
      }
      changeUpdatePrompt({ lastCheck: now, waitingVersion: result.status === 'available' ? result.version : null });
      if (result.status === 'available' && !isSnoozed(getUpdatePrompt(), now)) {
        setUpdate(result);
      }
    })();
    return () => {
      isActive = false;
    };
  }, [enabled]);

  return (
    <>
      <UpdatePopup update={whatsNew} onClose={() => setWhatsNew(null)} installed />
      <UpdatePopup update={update} onClose={() => setUpdate(null)} canSnooze />
    </>
  );
}

/** 1.0.x saved this once its hello was closed: the phone had Muse before. */
async function wasUsedBefore(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem('@muse/welcome-seen/v1')) === 'true';
  } catch {
    return false;
  }
}
