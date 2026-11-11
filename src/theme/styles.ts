import { useContext } from 'react';
import { StyleSheet } from 'react-native';
import { type Accent, type Theme, ThemeContext } from './theme';

export const colors = {
  background: '#11130F',
  surface: '#1C2118',
  border: '#2A3123',
  text: '#F3F1E8',
  muted: '#A5A99A',
  lime: '#C4F078',
};

const styleDefinitions = {
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  mainScroll: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 18,
    paddingBottom: 28,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerBrandGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerBackButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
  },
  headerBackIcon: {
    color: colors.text,
    fontSize: 30,
    lineHeight: 32,
    marginTop: -3,
  },
  brand: {
    flexDirection: 'row',
    // A view without text has its baseline at its bottom, so the bars stand on the wordmark's line.
    alignItems: 'baseline',
    gap: 8,
  },
  logo: {
    height: 22,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
  },
  logoBar: {
    width: 3.5,
    height: 12,
    borderRadius: 2,
    backgroundColor: colors.lime,
    // Pulses from the floor, like a level meter.
    transformOrigin: 'bottom',
  },
  brandName: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -1.1,
    lineHeight: 26,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.lime,
  },
  screenBody: {
    flexGrow: 1,
  },
  tabBody: {
    flexGrow: 1,
    paddingBottom: 20,
  },
  intro: {
    marginTop: 26,
  },
  eyebrow: {
    color: colors.lime,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 12,
  },
  title: {
    color: colors.text,
    fontSize: 37,
    fontWeight: '700',
    letterSpacing: -1.7,
    lineHeight: 44,
  },
  description: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 12,
    maxWidth: 320,
  },
  bottomArea: {
    marginTop: 'auto',
    paddingTop: 28,
  },
  primaryButton: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: colors.lime,
    borderRadius: 17,
    paddingHorizontal: 20,
  },
  primaryButtonPressed: {
    opacity: 0.82,
  },
  primaryButtonDisabled: {
    opacity: 0.7,
  },
  primaryButtonLabel: {
    color: '#202719',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  buttonArrow: {
    color: '#202719',
    fontSize: 19,
    fontWeight: '600',
  },
  textButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    marginTop: 6,
  },
  textButtonLabel: {
    color: '#A5AA9C',
    fontSize: 13,
    fontWeight: '600',
  },
  musicIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#20251B',
    borderRadius: 14,
  },
  statusArtwork: {
    alignItems: 'center',
    marginTop: 34,
  },
  statusArtworkIcon: {
    width: 84,
    height: 84,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 28,
  },
  statusArtworkAccent: {
    position: 'absolute',
    width: 10,
    height: 10,
    top: 15,
    right: 15,
    backgroundColor: colors.lime,
    borderWidth: 2,
    borderColor: colors.surface,
    borderRadius: 6,
  },
  statusArtworkLabel: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.4,
    marginTop: 12,
  },
  noteStem: {
    position: 'absolute',
    width: 2,
    height: 15,
    top: 11,
    left: 24,
    backgroundColor: colors.lime,
    transform: [{ rotate: '8deg' }],
  },
  noteFlag: {
    position: 'absolute',
    width: 8,
    height: 5,
    top: 11,
    left: 18,
    borderTopRightRadius: 5,
    backgroundColor: colors.lime,
  },
  noteDot: {
    position: 'absolute',
    width: 8,
    height: 6,
    left: 15,
    top: 25,
    borderRadius: 5,
    backgroundColor: colors.lime,
  },
  folderList: {
    gap: 10,
    marginTop: 18,
  },
  folderSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginTop: 20,
  },
  folderSummaryMetric: {
    minWidth: 58,
  },
  folderSummaryValue: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  folderSummaryLabel: {
    color: colors.muted,
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 2,
  },
  folderSummaryDivider: {
    width: 1,
    height: 30,
    backgroundColor: colors.border,
    marginHorizontal: 12,
  },
  folderSummaryHint: {
    flex: 1,
    color: colors.muted,
    fontSize: 9,
    lineHeight: 13,
    textAlign: 'right',
  },
  folderRow: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 17,
  },
  folderIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#252C20',
    borderRadius: 12,
  },
  folderIconText: {
    color: colors.lime,
    fontSize: 17,
    fontWeight: '700',
  },
  folderCopy: {
    flex: 1,
  },
  folderTitle: {
    color: '#E4E6DB',
    fontSize: 12,
    fontWeight: '700',
  },
  folderTrackCount: {
    color: '#929987',
    fontSize: 10,
    marginTop: 4,
  },
  folderRuleButton: {
    minWidth: 77,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 14,
  },
  folderAllowedButton: {
    backgroundColor: '#2B3821',
  },
  folderBlockedButton: {
    backgroundColor: '#382724',
  },
  folderRuleLabel: {
    fontSize: 10,
    fontWeight: '700',
  },
  folderAllowedLabel: {
    color: colors.lime,
  },
  folderBlockedLabel: {
    color: '#EAA38E',
  },
  noFoldersCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    padding: 20,
    marginTop: 26,
  },
  noFoldersTitle: {
    color: '#E4E6DB',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 12,
  },
  noFoldersDescription: {
    color: '#959B8D',
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    marginTop: 6,
  },
  homeRecentIcon: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    borderRadius: 10,
  },
  homeRecentIconText: {
    color: colors.lime,
    fontSize: 14,
    fontWeight: '700',
  },
  homeNowPlayingSliderWrap: {
    marginTop: 4,
  },
  miniPlayer: {
    paddingLeft: 9,
    paddingRight: 8,
    paddingTop: 9,
    // Room under the cover for the progress line.
    paddingBottom: 13,
  },
  /** Solid style: full width, flush on top of the bar, same surface. */
  miniPlayerSolid: {
    backgroundColor: '#1C2118',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#2A3024',
    paddingHorizontal: 14,
  },
  miniPlayerTop: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  miniPlayerInfo: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  miniPlayerCopy: {
    flex: 1,
    minWidth: 0,
  },
  miniPlayerTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  miniPlayerHint: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 2,
  },
  miniPlayerError: {
    color: '#EAA38E',
  },
  miniPlayerButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
  },
  miniPlayerControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  miniPlayerSkipButton: {
    width: 40,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  miniPlayerTrack: {
    flex: 1,
    backgroundColor: colors.border,
    borderRadius: 1,
    overflow: 'hidden',
  },
  /** Along the card's bottom edge, inset clear of its rounded corners. */
  miniPlayerLine: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 5,
    height: 2,
  },
  miniPlayerLinePaused: {
    opacity: 0.45,
  },
  miniPlayerProgress: {
    height: '100%',
    backgroundColor: colors.lime,
  },
  playerArtwork: {
    position: 'relative',
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    overflow: 'hidden',
  },
  playerArtworkLarge: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 4,
  },
  /** Muse art fills the tile, so it drops the frame border. */
  playerArtworkBare: {
    borderWidth: 0,
  },
  playerArtworkImage: {
    ...StyleSheet.absoluteFill,
  },
  playerProgressWrap: {
    width: '100%',
  },
  playerTimeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  playerTimeText: {
    color: colors.muted,
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  fullPlayer: {
    flexGrow: 1,
    justifyContent: 'space-between',
    paddingBottom: 14,
  },
  fullPlayerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    marginBottom: 16,
  },
  fullPlayerHeaderSide: {
    width: 96,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fullPlayerHeaderSideEnd: {
    justifyContent: 'flex-end',
  },
  // Header actions are plain icons: the cover is the only thing that pops.
  fullPlayerClose: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
  },
  fullPlayerHeaderCopy: {
    flex: 1,
    alignItems: 'center',
  },
  fullPlayerHeaderTitle: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    textAlign: 'center',
  },
  /** "Album name" under PLAYING FROM. */
  fullPlayerHeaderSource: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
    textAlign: 'center',
  },
  // Title and artist line up with the artwork's left edge, with the
  // favorite heart on the right, and clear space below the artwork.
  fullPlayerTrackInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    gap: 12,
    marginTop: 28,
    marginBottom: 6,
  },
  fullPlayerTrackCopy: {
    flex: 1,
    minWidth: 0,
  },
  fullPlayerTrackTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.5,
    lineHeight: 30,
  },
  fullPlayerTrackArtist: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 21,
    marginTop: 2,
    paddingVertical: 4,
  },
  volumeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 18,
  },
  volumeIcon: {
    color: colors.muted,
  },
  volumeTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: colors.border,
  },
  volumeFill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: '100%',
    backgroundColor: colors.text,
    borderRadius: 3,
  },
  fullPlayerLink: {
    color: colors.text,
  },
  fullPlayerTrackMeta: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    letterSpacing: 0.2,
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },
  // Under the artist: [FLAC] Hi-Res  24-bit · 96 kHz · 4,608 kbps · ▶ 12
  playerMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  playerMetaAudio: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
    minWidth: 0,
  },
  playerMetaBadge: {
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  playerMetaBadgeText: {
    color: colors.muted,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  /** Lossless or Hi-Res: the one accent-colored word in the row. */
  playerMetaQuality: {
    color: colors.lime,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  playerMetaSpecs: {
    marginTop: 0,
    flexShrink: 1,
  },
  playerMetaPlays: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  playerMetaPlaysText: {
    marginTop: 0,
  },
  sleepTimerBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.58)',
  },
  sleepTimerBackdropPressable: {
    ...StyleSheet.absoluteFill,
  },
  sleepTimerSheet: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 24,
  },
  // Sort sheet. Shares the sleep timer sheet's frame.
  /** "A to Z / Z to A" above the sort choices. */
  sortSheetOrder: {
    marginTop: 8,
  },
  sortSheetScroll: {
    marginTop: 12,
  },
  sortSheetSectionTitle: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.1,
    marginBottom: 6,
    paddingHorizontal: 12,
  },
  sortSheetOption: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
  },
  sortSheetOptionSelected: {
    backgroundColor: '#2B3821',
  },
  sortSheetOptionPressed: {
    backgroundColor: colors.surface,
  },
  sortSheetOptionCopy: {
    flex: 1,
  },
  sortSheetOptionLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  sortSheetOptionLabelSelected: {
    color: colors.lime,
    fontWeight: '700',
  },
  sortSheetOptionHint: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  sortSheetRadio: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#606A54',
    borderRadius: 11,
  },
  sleepTimerHandle: {
    width: 38,
    height: 4,
    alignSelf: 'center',
    backgroundColor: colors.border,
    borderRadius: 2,
    marginBottom: 20,
  },
  sleepTimerHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sleepTimerEyebrow: {
    color: colors.lime,
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  sleepTimerTitle: {
    color: colors.text,
    fontSize: 21,
    fontWeight: '700',
    marginTop: 4,
  },
  sleepTimerClose: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: 17,
  },
  sleepTimerCloseText: {
    color: colors.text,
    fontSize: 23,
    lineHeight: 25,
    marginTop: -2,
  },
  sleepTimerDescription: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 8,
  },
  sleepTimerActiveCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 16,
  },
  sleepTimerActiveDot: {
    width: 7,
    height: 7,
    backgroundColor: colors.lime,
    borderRadius: 4,
  },
  sleepTimerActiveText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  sleepTimerOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 18,
  },
  sleepTimerOption: {
    // Two per row that share the row exactly, so both columns line up with the wide option.
    flexBasis: '40%',
    flexGrow: 1,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 15,
  },
  sleepTimerOptionWide: {
    width: '100%',
  },
  sleepTimerOptionOn: {
    backgroundColor: '#2B3821',
    borderColor: colors.lime,
  },
  sleepTimerOptionValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  sleepTimerCancel: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    marginTop: 12,
  },
  sleepTimerCancelText: {
    color: colors.lime,
    fontSize: 12,
    fontWeight: '700',
  },
  fullPlayerControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  // Shuffle and repeat: a plain icon, tinted with the accent and marked
  // with a small dot when on.
  fullPlayerModeButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullPlayerModeDot: {
    position: 'absolute',
    bottom: 2,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.lime,
  },
  fullPlayerPlayback: {
    marginTop: 8,
  },
  // ---- Full player: skins, the bar, Lyrics and Up Next in place ----
  /** The skin's picture and words, between the header and the controls. */
  playerHeroArea: {
    flex: 1,
    alignItems: 'center',
  },
  playerHeroAreaMinimal: {
    alignItems: 'stretch',
  },
  /** Title and artist sit midway between the picture and the controls. */
  playerTitleSpacer: {
    width: '100%',
    marginVertical: 'auto',
  },
  /** Full-bleed: the header floats over the cover. */
  playerHeaderOver: {
    zIndex: 2,
  },
  playerBleedButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.34)',
  },
  playerHidden: {
    opacity: 0,
  },
  playerBleedArt: {
    alignSelf: 'center',
  },
  playerBleedFrom: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
  playerBleedInfo: {
    marginTop: 6,
  },
  playerBleedTitle: {
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.8,
  },
  // Minimal type: one type scale (12 / 16 / 22, title 32-72) and an 8 dp grid.
  playerMinimalTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
    marginTop: 8,
  },
  /** Beside the cover, as tall as it: queue place on top, genre and year at the foot. */
  playerMinimalSide: {
    flex: 1,
    alignSelf: 'stretch',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  playerMinimalLabel: {
    color: colors.muted,
    fontFamily: 'monospace',
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.8,
  },
  /** The words sit right above the controls. */
  playerMinimalWords: {
    marginTop: 'auto',
    paddingTop: 24,
    paddingBottom: 16,
  },
  /** Size, leading and tracking come from minimalTitleStyle. */
  playerMinimalTitle: {
    color: colors.text,
    fontWeight: '900',
  },
  playerMinimalArtist: {
    color: colors.text,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
    marginTop: 16,
  },
  playerMinimalAlbum: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 22,
    marginTop: 4,
  },
  /** A link's tap area hugs its words, so a tap beside a short name does nothing. */
  playerMinimalLink: {
    alignSelf: 'flex-start',
  },
  playerMinimalPressed: {
    opacity: 0.6,
  },
  playerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
    marginTop: 12,
    marginHorizontal: -8,
  },
  playerBarButton: {
    height: 44,
    paddingHorizontal: 12,
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  playerBarSpeed: {
    minWidth: 52,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  playerBarLabel: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  playerBarLabelOn: {
    color: colors.text,
  },
  playerBarLabelSet: {
    color: colors.lime,
  },
  playerBarDim: {
    opacity: 0.38,
  },
  playerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 60,
  },
  playerTopRowArt: {
    borderRadius: 10,
    boxShadow: '0px 10px 22px -12px rgba(0, 0, 0, 0.6)',
  },
  playerTopRowTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  playerTopRowArtist: {
    color: colors.muted,
    fontSize: 14,
    marginTop: 2,
  },
  playerTopRowPlay: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerTopLine: {
    height: 3,
    borderRadius: 2,
    marginTop: 12,
    overflow: 'hidden',
  },
  playerTopLineFill: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.text,
    transformOrigin: 'left center',
  },
  playerLyricsContent: {
    paddingTop: 22,
    paddingBottom: 260,
  },
  playerLyricsLine: {
    color: colors.text,
    fontSize: 26,
    lineHeight: 33,
    fontWeight: '800',
    letterSpacing: -0.6,
    opacity: 0.32,
    marginBottom: 16,
  },
  playerLyricsLineActive: {
    opacity: 1,
  },
  playerLyricsPlain: {
    color: colors.text,
    fontSize: 18,
    lineHeight: 28,
    fontWeight: '600',
  },
  playerLyricsNote: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 8,
  },
  playerPaneEmpty: {
    paddingTop: 40,
  },
  playerPaneEmptyTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  playerPaneEmptyText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
  },
  playerPaneList: {
    paddingBottom: 40,
  },
  playerPaneLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: 22,
    marginBottom: 6,
  },
  playerPaneLabelInline: {
    marginTop: 0,
    marginBottom: 0,
  },
  playerPaneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    // Same as queueRowMain, so every title in Up Next starts on one line.
    gap: 10,
    minHeight: 60,
    borderRadius: 14,
  },
  playerPaneRowPast: {
    opacity: 0.5,
  },
  playerPaneRowPressed: {
    opacity: 0.7,
  },
  playerPaneHead: {
    marginTop: 22,
    marginBottom: 4,
  },
  playerPaneHeadRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    // On a narrow phone or with big text, Save and Clear drop to a second line instead of running off the edge.
    gap: 6,
    rowGap: 8,
  },
  playerPaneCount: {
    color: colors.muted,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  playerPaneChip: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  playerPaneChipText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  playerPanePill: {
    paddingHorizontal: 14,
  },
  playerPanePillOn: {
    color: colors.lime,
  },
  playerPanePillOff: {
    color: colors.muted,
  },
  playerPaneModes: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    marginBottom: 6,
  },
  playerSkinRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  playerSkinPreview: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  playerSkinOptions: {
    flex: 1,
    gap: 4,
  },
  playerSkinOption: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 10,
    borderRadius: 14,
  },
  playerSkinOptionOn: {
    backgroundColor: '#2B3821',
  },
  playerSkinRadioOn: {
    borderColor: colors.lime,
    borderWidth: 6,
  },
  playerSkinLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  playerSkinHint: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  playerSkinInUse: {
    color: colors.lime,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
    marginTop: 4,
  },
  playerSkinUse: {
    marginTop: 16,
  },
  /** The preview's player, at full size before scaling: the real player's padding. */
  playerPreviewBody: {
    flex: 1,
    paddingTop: 62,
    paddingHorizontal: 24,
  },
  playerPreviewLine: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 36,
    marginTop: 10,
  },
  playerPreviewPlayed: {
    width: '30%',
    height: 4,
    borderRadius: 2,
  },
  playerPreviewRest: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    marginLeft: 12,
  },
  flexSpacer: {
    flex: 1,
  },
  playerControlSkip: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 28,
  },
  fullPlayerPlayButton: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.lime,
    borderRadius: 36,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 3,
  },
  fullPlayerErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 10,
  },
  fullPlayerStatus: {
    flexShrink: 1,
    color: '#EAA38E',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  fullPlayerErrorSkip: {
    minHeight: 36,
  },
  // Speed sheet (player bar › 1×). Rows are the sort sheet's; spacing on the 8 dp grid.
  speedSong: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 8,
  },
  speedList: {
    // Row padding bleeds into the sheet padding, so the speeds start on the title's edge.
    marginHorizontal: -12,
    marginTop: 16,
  },
  speedValue: {
    // A fixed column, so the words line up; it still grows with large text.
    minWidth: 52,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  speedWord: {
    flex: 1,
    color: colors.muted,
    fontSize: 15,
  },
  speedWordSelected: {
    color: colors.text,
  },
  speedHint: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 16,
  },
  speedDone: {
    marginTop: 16,
  },
  playerQueue: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
  },
  // Up Next rows: a fixed height, so a drag knows which slot it is over.
  queueRow: {
    height: 60,
  },
  queueRowRemove: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
    paddingRight: 18,
    backgroundColor: '#252C20',
    borderRadius: 18,
  },
  queueRowRemoveText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '600',
  },
  queueRowContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingLeft: 10,
    borderRadius: 18,
  },
  queueRowContentPlain: {
    backgroundColor: 'transparent',
    paddingLeft: 0,
    borderRadius: 0,
  },
  queueRowRemoveTrailing: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '100%',
    width: 160,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 18,
    backgroundColor: '#252C20',
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
  },
  queueRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    borderRadius: 0,
  },
  queueRowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    alignSelf: 'stretch',
  },
  queueRowHandle: {
    width: 48,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerQueueCopy: {
    flex: 1,
  },
  playerQueueTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  playerQueueArtist: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  // Home and Stats cards.
  homeCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    padding: 16,
    marginTop: 12,
  },
  homeCardFlush: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 14,
  },
  homeCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  homeCardLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  homeCardFootnote: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 12,
  },
  homeMutedText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  homeLinkLabel: {
    color: colors.lime,
    fontSize: 13,
    fontWeight: '700',
  },
  homeBigRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
  },
  homeBigNumber: {
    color: colors.text,
    fontSize: 40,
    fontWeight: '700',
    letterSpacing: -1.6,
    lineHeight: 46,
  },
  homeDeltaChip: {
    backgroundColor: '#2B3821',
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  homeDeltaText: {
    color: colors.lime,
    fontSize: 12,
    fontWeight: '700',
  },
  homeFactRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 16,
    rowGap: 4,
    marginTop: 6,
  },
  homeFact: {
    color: colors.muted,
    fontSize: 13,
  },
  homeFactValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  homeChartWrap: {
    marginTop: 16,
  },
  homeHeading: {
    marginTop: 32,
    marginBottom: 10,
  },
  homeHeadingTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  homeHeadingHint: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 3,
  },
  homeShelf: {
    marginHorizontal: -24,
  },
  homeShelfContent: {
    paddingHorizontal: 24,
    gap: 12,
  },
  homeShelfItem: {
    width: 128,
  },
  homeShelfTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 8,
  },
  homeShelfHint: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  homeArtFallback: {
    width: 128,
    height: 128,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#252C20',
    borderRadius: 12,
  },
  homeSongRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    minHeight: 64,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  homeSongRowLast: {
    borderBottomWidth: 0,
  },
  homeSongCopy: {
    flex: 1,
  },
  homeSongTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  homeSongHint: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 3,
  },
  homeSongMeta: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  statsTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statsTitle: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -1,
  },
  statsSegment: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 4,
    marginTop: 18,
  },
  glassSegment: {
    marginTop: 10,
  },
  statsSegmentItem: {
    flex: 1,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  statsSegmentItemActive: {
    backgroundColor: '#2B3821',
  },
  statsSegmentLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  statsSegmentLabelActive: {
    color: colors.lime,
  },
  segmentedLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  statsSegmentChart: {
    marginTop: 4,
  },
  statsTopGap: {
    marginTop: 16,
  },
  statsNote: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    marginTop: 18,
  },
  goalPickerWrap: {
    marginTop: 14,
  },
  goalChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  goalChip: {
    minHeight: 36,
    minWidth: 52,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#252C20',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    paddingHorizontal: 12,
  },
  goalChipActive: {
    backgroundColor: '#2B3821',
    borderColor: colors.lime,
  },
  goalChipLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  goalChipLabelActive: {
    color: colors.lime,
  },
  homeHeroLine: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
  homeChip: {
    minHeight: 32,
    justifyContent: 'center',
    backgroundColor: '#252C20',
    borderRadius: 16,
    paddingHorizontal: 12,
  },
  homeChipAction: {
    backgroundColor: '#2B3821',
  },
  homeChipActionText: {
    color: colors.lime,
    fontSize: 12,
    fontWeight: '700',
  },
  homeShelfPlaying: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 6,
  },
  pulseBoard: {
    gap: 12,
    marginTop: 20,
  },
  pulseRow: {
    flexDirection: 'row',
    gap: 12,
  },
  pulseCell: {
    flex: 1,
  },
  pulseTile: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 24,
    padding: 16,
    overflow: 'hidden',
  },
  pulseLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  pulseLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '600',
  },
  pulseBig: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.6,
    lineHeight: 32,
  },
  pulseMid: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
    lineHeight: 24,
  },
  pulseSub: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 3,
  },
  pulseGrow: {
    flex: 1,
  },
  pulseValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
    marginTop: 6,
  },
  pulseFill: {
    backgroundColor: colors.lime,
    transformOrigin: 'bottom',
  },
  pulseWeekDays: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  pulseDay: {
    flex: 1,
    alignItems: 'center',
  },
  pulseDayText: {
    width: 22,
    height: 22,
    borderRadius: 11,
    overflow: 'hidden',
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 22,
    textAlign: 'center',
  },
  pulseDayToday: {
    backgroundColor: '#2B3821',
    color: colors.lime,
  },
  pulseStreakNumber: {
    color: colors.text,
    fontSize: 52,
    fontWeight: '900',
    letterSpacing: -2,
    lineHeight: 56,
  },
  pulseStreakUnit: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0,
  },
  pulseHours: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    height: 40,
    marginTop: 12,
  },
  pulseHoursTall: {
    height: 64,
  },
  pulseHourBar: {
    flex: 1,
    borderRadius: 2,
    backgroundColor: '#454C3F',
    transformOrigin: 'bottom',
  },
  pulseHourLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  pulseTinyLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '600',
  },
  pulseMediaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 12,
  },
  pulseReps: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginTop: 6,
  },
  pulseRepsNumber: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.8,
    lineHeight: 28,
  },
  pulseRepsUnit: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  pulsePlay: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseMeter: {
    flexDirection: 'row',
    gap: 3,
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
    backgroundColor: '#30372A',
    marginTop: 12,
  },
  pulseLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 12,
    rowGap: 4,
    marginTop: 8,
  },
  pulseMixGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 12,
    rowGap: 16,
    marginTop: 12,
  },
  // Mixes and Jump back in: open on the page, no card.
  pulseOpen: {
    paddingTop: 16,
  },
  pulseShelf: {
    marginHorizontal: -24,
    marginTop: 12,
  },
  pulseShelfContent: {
    gap: 12,
    paddingHorizontal: 24,
  },
  pulseShelfItem: {
    width: 76,
  },
  pulseFooterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 28,
  },
  pulseFooter: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 19,
    textAlign: 'center',
  },
  pulseCopyright: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 19,
    textAlign: 'center',
  },
  // A Home tile that grows past its square when text is large, never clipping.
  pulseTileFill: {
    flexGrow: 1,
  },
  pulseNewDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  pulseCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
  },
  pulseCtaText: {
    fontSize: 14,
    fontWeight: '700',
  },
  pulseFan: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
  },
  pulseFanCover: {
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
    borderRadius: 10,
  },
  // ---- Home: section titles, header, big greeting ----
  pulseSectionTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
    lineHeight: 24,
  },
  pulseSectionGap: {
    marginTop: 16,
  },
  pulseGreeting: {
    color: colors.text,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -1.2,
    lineHeight: 38,
  },
  pulseGreetingName: {
    color: colors.lime,
  },
  pulseHelloRow: {
    marginTop: 22,
  },
  pulseDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  pulseCompact: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 24,
    paddingRight: 16,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pulseCompactTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  pulseCustomizeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 8,
    height: 44,
    marginTop: 28,
    paddingHorizontal: 18,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pulseCustomizeText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  // ---- Home cards ----
  pulseDeltaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    alignSelf: 'center',
    height: 24,
    paddingHorizontal: 9,
    borderRadius: 12,
    backgroundColor: '#2B3821',
  },
  pulseDeltaPillDown: {
    backgroundColor: '#30372A',
  },
  pulseDeltaPillText: {
    color: colors.lime,
    fontSize: 13,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  pulseDeltaPillTextDown: {
    color: colors.muted,
  },
  pulseWeekPlot2: {
    flexDirection: 'row',
    height: 96,
    marginTop: 30,
  },
  pulseWeekSlot: {
    flex: 1,
    alignItems: 'center',
  },
  pulseGhost: {
    position: 'absolute',
    bottom: 0,
    width: 26,
    borderTopLeftRadius: 7,
    borderTopRightRadius: 7,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
    backgroundColor: '#30372A',
    transformOrigin: 'bottom',
  },
  pulseWeekBarBox: {
    position: 'absolute',
    bottom: 0,
    width: 14,
    height: '100%',
    transformOrigin: 'bottom',
  },
  pulseWeekBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '100%',
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
    backgroundColor: colors.lime,
    transformOrigin: 'bottom',
  },
  pulseWeekValue: {
    position: 'absolute',
    bottom: 0,
    left: -24,
    right: -24,
    textAlign: 'center',
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  pulseGaugeWrap: {
    alignItems: 'center',
  },
  pulseGaugeCenter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: '10%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseGaugeValue: {
    color: colors.text,
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.8,
    lineHeight: 36,
  },
  pulseGaugeUnit: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  pulseGaugeGap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
  },
  pulseGaugeGapText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
    textAlign: 'center',
  },
  pulseDoneBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
  },
  pulseDoneBar: {
    width: 5,
    borderRadius: 3,
    backgroundColor: colors.lime,
    transformOrigin: 'bottom',
  },
  pulseSegs: {
    flexDirection: 'row',
    gap: 3,
    height: 10,
    marginTop: 10,
  },
  pulseSeg: {
    flex: 1,
    borderRadius: 3,
    backgroundColor: '#30372A',
  },
  pulseSegLit: {
    backgroundColor: colors.lime,
  },
  pulseLabelAccent: {
    color: colors.lime,
  },
  pulseNowDot: {
    position: 'absolute',
    top: -9,
    width: 5,
    height: 5,
    marginLeft: -2.5,
    borderRadius: 3,
    backgroundColor: colors.text,
  },
  pulseAlbumRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 10,
  },
  pulseAlbumCount: {
    color: colors.text,
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.8,
    lineHeight: 34,
  },
  pulseAlbumUnit: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '600',
  },
  pulsePill: {
    height: 10,
    borderRadius: 5,
    backgroundColor: '#30372A',
    marginTop: 12,
  },
  pulsePillFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 5,
    backgroundColor: colors.lime,
    transformOrigin: 'left',
  },
  pulseNotch: {
    position: 'absolute',
    top: -4,
    width: 3,
    height: 18,
    marginLeft: -1.5,
    borderRadius: 2,
    backgroundColor: colors.text,
  },
  pulseMeterPart: {
    backgroundColor: colors.lime,
    transformOrigin: 'left',
  },
  pulseXHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  pulseWaffle: {
    width: 58,
    gap: 1,
  },
  pulseWaffleRow: {
    flexDirection: 'row',
    gap: 1,
  },
  pulseWaffleCell: {
    width: 4.9,
    height: 4.9,
    borderRadius: 1,
    backgroundColor: '#30372A',
  },
  pulseWaffleOn: {
    backgroundColor: colors.lime,
  },
  // ---- Your week in music: a tinted story card that folds ----
  pulseRecap: {
    backgroundColor: '#2B3821',
    borderColor: '#2B3821',
  },
  pulseStorySegs: {
    flexDirection: 'row',
    gap: 4,
  },
  pulseStorySeg: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.lime,
    opacity: 0.35,
    transformOrigin: 'left',
  },
  pulseRecapTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 18,
    marginTop: 12,
  },
  pulseRecapNew: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pulseRecapNewText: {
    color: colors.lime,
    fontSize: 12,
    fontWeight: '700',
  },
  pulseRecapRange: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  pulseTextButton: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 8,
    marginVertical: -11,
    marginRight: -8,
  },
  pulseTextButtonText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  pulseRecapBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
  },
  pulseRecapTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  pulseRecapHero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 2,
  },
  pulseRecapTotal: {
    color: colors.text,
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: -1,
    lineHeight: 40,
  },
  pulseRecapPill: {
    backgroundColor: colors.surface,
  },
  pulseRecapDays: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
  },
  pulseRecapDay: {
    alignItems: 'center',
    gap: 4,
  },
  pulseRecapDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#606A54',
  },
  pulseRecapDotPlayed: {
    borderColor: colors.lime,
  },
  pulseRecapDotGoal: {
    borderColor: colors.lime,
    backgroundColor: colors.lime,
  },
  pulseRecapDayLetter: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: '700',
  },
  pulseRecapCaption: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 6,
  },
  pulseRecapFan: {
    width: 108,
    height: 84,
  },
  pulseRecapFanCover: {
    position: 'absolute',
    top: 10,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    borderRadius: 12,
  },
  pulseRecapFold: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pulseRecapMini: {
    flexDirection: 'row',
  },
  pulseRecapFoldTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  pulseRecapFoldSub: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  pulseRecapShow: {
    color: colors.lime,
  },
  // ---- Skeleton: the same frames, while a slow load runs ----
  pulseSkel: {
    backgroundColor: colors.surface,
    borderRadius: 8,
  },
  pulseSkelCard: {
    backgroundColor: '#252C20',
    borderRadius: 8,
  },
  pulseSkelLine: {
    height: 11,
    borderRadius: 6,
    marginTop: 8,
  },
  // ---- Detail sheets ----
  pulseSheetBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  pulseSheet: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    transformOrigin: 'top left',
  },
  pulseSheetGrab: {
    paddingTop: 10,
    paddingBottom: 6,
    alignItems: 'center',
  },
  pulseSheetHandle: {
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#30372A',
  },
  pulseSheetHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  pulseSheetEyebrow: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  pulseSheetTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginTop: 2,
  },
  pulseSheetClose: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#252C20',
  },
  pulseSheetBody: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  pulseSegControl: {
    flexDirection: 'row',
    gap: 2,
    padding: 3,
    borderRadius: 12,
    backgroundColor: '#252C20',
  },
  pulseSegItem: {
    flex: 1,
    height: 36,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseSegItemOn: {
    backgroundColor: colors.surface,
  },
  pulseSegText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  pulseSegTextOn: {
    color: colors.text,
  },
  pulseSheetHero: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 20,
  },
  pulseSheetHeroText: {
    color: colors.text,
    fontSize: 40,
    fontWeight: '800',
    letterSpacing: -1.2,
    lineHeight: 44,
  },
  pulseSheetCaption: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 4,
  },
  pulseSheetChart: {
    marginTop: 20,
  },
  pulseFacts: {
    marginTop: 22,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  pulseFact: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    minHeight: 48,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pulseFactKey: {
    color: colors.muted,
    fontSize: 15,
  },
  pulseFactValue: {
    flexShrink: 1,
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'right',
  },
  pulseSheetActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 22,
  },
  pulseSheetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 44,
    paddingHorizontal: 18,
    borderRadius: 22,
  },
  pulseSheetGhost: {
    borderWidth: 1,
    borderColor: colors.border,
  },
  pulseSheetButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  pulseSheetGhostText: {
    color: colors.text,
  },
  pulseRankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
  },
  pulseRankN: {
    width: 14,
    color: colors.muted,
    fontSize: 13,
    fontWeight: '800',
  },
  pulseRankBar: {
    height: 5,
    borderRadius: 3,
    marginTop: 7,
    backgroundColor: colors.lime,
    transformOrigin: 'left',
  },
  pulseRankValue: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  pulseCalRow: {
    flexDirection: 'row',
    marginTop: 8,
  },
  pulseCalCellBox: {
    flex: 1,
    alignItems: 'center',
  },
  pulseCalCell: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#30372A',
  },
  pulseCalOn: {
    backgroundColor: colors.lime,
  },
  pulseCalHalf: {
    backgroundColor: colors.lime,
    opacity: 0.4,
  },
  pulseCalLetter: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
  },
  pulseCmpTrack: {
    height: 12,
    borderRadius: 6,
    marginTop: 6,
    overflow: 'hidden',
    backgroundColor: '#30372A',
  },
  pulseCmpFill: {
    height: '100%',
    borderRadius: 6,
    backgroundColor: colors.lime,
    transformOrigin: 'left',
  },
  pulseBigWaffle: {
    gap: 4,
  },
  pulseBigWaffleRow: {
    flexDirection: 'row',
    gap: 4,
  },
  pulseBigWaffleCell: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 4,
    backgroundColor: '#30372A',
  },
  pulseMixHead: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 16,
  },
  pulseMixAbout: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 21,
  },
  pulseMixMeta: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 8,
  },
  pulseMixCoverLinks: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 6,
  },
  pulseMixCoverLink: {
    color: colors.lime,
    fontSize: 13,
    fontWeight: '700',
    paddingVertical: 6,
  },
  pulseSongRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 60,
  },
  pulseSongTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  pulseSongArtist: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 2,
  },
  pulseSongTime: {
    color: colors.muted,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  // ---- Profile ----
  profilePreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 16,
    marginTop: 4,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  profileCamBadge: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    // A ring in the card's color, so the badge sits clear of the avatar.
    borderWidth: 3,
    borderColor: colors.surface,
  },
  profilePreviewLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  profilePreviewHello: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.6,
    lineHeight: 26,
  },
  profileField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 52,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  profileFieldFocus: {
    borderColor: colors.lime,
  },
  profileInput: {
    flex: 1,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 17,
    fontWeight: '600',
  },
  profileCount: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  profileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingTop: 4,
  },
  profilePhotoCell: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.muted,
    backgroundColor: colors.surface,
  },
  // Only the chosen one gets a ring; light mode would turn a transparent one grey.
  profileRing: {
    position: 'absolute',
    top: -4,
    left: -4,
    right: -4,
    bottom: -4,
    borderWidth: 2.5,
    borderColor: colors.lime,
  },
  profileTick: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: colors.background,
  },
  profileError: {
    color: colors.muted,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 12,
  },
  profileNote: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
    marginTop: 14,
    marginBottom: 4,
  },
  profileSave: {
    height: 52,
    borderRadius: 26,
    marginTop: 14,
  },
  pulseAvatarButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
  },
  // ---- Customize sheet ----
  pulseEditList: {
    borderRadius: 18,
    backgroundColor: '#252C20',
    overflow: 'hidden',
  },
  pulseEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 58,
    paddingRight: 12,
    backgroundColor: '#252C20',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  pulseEditHandle: {
    width: 40,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseEditName: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  pulseEditNameOff: {
    color: colors.muted,
  },
  pulseEditNote: {
    color: colors.muted,
    fontSize: 12,
  },
  pulseSize: {
    flexDirection: 'row',
    padding: 2,
    borderRadius: 10,
    backgroundColor: '#30372A',
  },
  pulseSizeOption: {
    height: 32,
    paddingHorizontal: 9,
    borderRadius: 8,
    justifyContent: 'center',
  },
  pulseSizeOptionOn: {
    backgroundColor: colors.surface,
  },
  pulseSizeText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  pulseSizeTextOn: {
    color: colors.text,
  },
  pulseSectionLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 22,
    marginBottom: 8,
  },
  pulseReset: {
    minHeight: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#252C20',
    marginTop: 18,
  },
  insightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  // More tab, playlists and the song menu.
  coverCollage: {
    width: 52,
    height: 52,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: '#252C20',
  },
  /** No songs yet: a soft filled tile under a muted icon, apart from the New playlist tile. */
  coverCollageEmpty: {
    // The collage wraps for its 2x2 grid, and wrapped lines pack to the top; one icon must not wrap.
    flexWrap: 'nowrap',
    backgroundColor: '#30372A',
  },
  starRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 6,
  },
  starButton: {
    padding: 2,
  },
  sheetHeadingCopy: {
    flex: 1,
    marginRight: 12,
  },
  sheetBody: {
    gap: 4,
  },
  // Confirm sheet: the Muse stand-in for the system alert.
  confirmBody: {
    gap: 14,
    marginTop: 14,
  },
  confirmIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2B3821',
  },
  confirmIconGlyph: {
    color: colors.lime,
  },
  confirmMessage: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  confirmButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 16,
    paddingHorizontal: 12,
  },
  confirmSecondary: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  confirmSecondaryText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  /** Removes or replaces something: a red outline, never a red fill. */
  confirmDanger: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#EAA38E',
  },
  confirmDangerText: {
    color: '#EAA38E',
    fontSize: 14,
    fontWeight: '700',
  },
  /** Release notes in the update sheet: a quiet box that scrolls when long. */
  confirmNotes: {
    maxHeight: 220,
    backgroundColor: colors.surface,
    borderRadius: 14,
  },
  confirmNotesContent: {
    padding: 14,
    gap: 6,
  },
  confirmNotesHeading: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  confirmNotesText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  /** A sheet of fields and buttons, not rows: room below the title and between parts. */
  sheetForm: {
    gap: 12,
    marginTop: 18,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    borderRadius: 14,
    paddingHorizontal: 10,
  },
  sheetRowIcon: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2B3821',
    borderRadius: 11,
  },
  sheetRowLabel: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  sheetRowDanger: {
    color: '#EAA38E',
  },
  sheetRowDetail: {
    color: colors.muted,
    fontSize: 12,
  },
  sheetInput: {
    minHeight: 48,
    color: colors.text,
    fontSize: 15,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
  },
  sheetHint: {
    color: '#EAA38E',
    fontSize: 12,
    marginVertical: 6,
  },
  sheetList: {
    maxHeight: 360,
  },
  songMenuScroll: {
    flexShrink: 1,
  },
  songMenuSectionGap: {
    marginTop: 14,
  },
  // Song info, inside the song menu: label on the left, value on the right.
  songInfoList: {
    maxHeight: 480,
  },
  songInfoSection: {
    marginTop: 10,
  },
  songInfoRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  songInfoLabel: {
    width: 92,
    color: colors.muted,
    fontSize: 13,
  },
  songInfoValue: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
  },
  sheetSearch: {
    marginBottom: 8,
  },
  sheetListFill: {
    flex: 1,
  },
  sheetFooterButton: {
    marginTop: 10,
  },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 58,
  },
  pickCheck: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#46513A',
    borderRadius: 12,
  },
  pickCheckOn: {
    backgroundColor: '#2B3821',
    borderColor: colors.lime,
  },
  songMenuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  coverGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingVertical: 6,
  },
  coverChoice: {
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0)',
    borderRadius: 14,
    padding: 2,
  },
  coverChoiceSelected: {
    borderColor: colors.lime,
  },
  moreTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  moreActionSoft: {
    flex: 1,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2B3821',
    borderRadius: 17,
  },
  // Collections tab: playlists grid, smart lists shelf, Browse rows, list pages with a big cover.
  collSectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 44,
    marginTop: 26,
    marginBottom: 8,
  },
  collSectionTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  /** A section title without a sort beside it: same height as one with. */
  collSectionGap: {
    marginTop: 6,
    marginBottom: 8,
    lineHeight: 44,
  },
  collTile: {
    marginBottom: 20,
  },
  collTileTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    marginTop: 10,
  },
  collTileHint: {
    color: '#B3B7A9',
    fontSize: 13,
    marginTop: 2,
  },
  /** An empty list keeps the title size, so its lines match the full tiles beside it. */
  collTileTitleMuted: {
    color: '#B3B7A9',
  },
  collNewTile: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
  },
  collShelf: {
    marginHorizontal: -24,
  },
  collShelfContent: {
    paddingHorizontal: 24,
    paddingBottom: 20,
    gap: 12,
  },
  collSmart: {
    width: 132,
  },
  /** A smart list with nothing in it yet. */
  collFaded: {
    opacity: 0.7,
  },
  /** Playlists page: the name search under the count and sort. */
  collSearch: {
    marginTop: 4,
    marginBottom: 16,
  },
  /** "See all N playlists" under the first few tiles. */
  collSeeAll: {
    marginTop: 2,
  },
  collRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 70,
    marginHorizontal: -8,
    paddingHorizontal: 8,
    borderRadius: 16,
  },
  collRowCopy: {
    flex: 1,
    gap: 2,
  },
  collRowTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  collRowHint: {
    color: '#B3B7A9',
    fontSize: 13,
  },
  collRowCount: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '600',
  },
  collPageTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  collNavButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: 20,
  },
  /** Settings pages and Collections lists: the back button and the title in one row (PageBar). */
  pageBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  pageBarText: {
    flex: 1,
    minWidth: 0,
  },
  pageBarTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.6,
    lineHeight: 29,
  },
  pageBarSubtitle: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 17,
  },
  collPageBar: {
    marginTop: 4,
  },
  collListMeta: {
    marginTop: 22,
  },
  collHero: {
    alignItems: 'center',
    marginTop: 16,
  },
  collHeroTitle: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.6,
    lineHeight: 31,
    textAlign: 'center',
    marginTop: 20,
  },
  collHeroMeta: {
    color: '#B3B7A9',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 4,
  },
  collHeroActions: {
    width: 296,
    maxWidth: '100%',
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
  },
  collHeroButton: {
    flex: 1,
    minHeight: 48,
    gap: 8,
    borderRadius: 24,
  },
  collHeroAdd: {
    flex: 0,
    paddingHorizontal: 22,
    marginTop: 16,
  },
  collHeroEmpty: {
    maxWidth: 260,
    color: '#B3B7A9',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 14,
  },
  collEditList: {
    marginTop: 8,
  },
  // Muse art style picker (Settings › Appearance).
  artSheetBody: {
    paddingBottom: 12,
  },
  artPreviewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 10,
    rowGap: 14,
    marginTop: 4,
  },
  artPreviewLabel: {
    color: '#B3B7A9',
    fontSize: 12,
    marginTop: 6,
  },
  artPreviewName: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
    marginTop: 16,
  },
  artPreviewHint: {
    color: '#B3B7A9',
    fontSize: 14,
    marginTop: 2,
  },
  artPreviewWhere: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 6,
  },
  artChoices: {
    gap: 4,
    marginTop: 16,
  },
  artChoiceTiles: {
    flexDirection: 'row',
    gap: 4,
  },
  artUseButton: {
    marginTop: 12,
  },
  // Seek bar. SVG reads its two colors from these, so it follows the theme.
  sliderActive: {
    backgroundColor: colors.lime,
  },
  sliderInactive: {
    backgroundColor: '#454C3F',
  },
  sliderHandle: {
    position: 'absolute',
    left: 0,
    backgroundColor: colors.lime,
  },
  sliderBubble: {
    position: 'absolute',
    top: -30,
    left: 0,
    width: 56,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#30372A',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 13,
    zIndex: 2,
  },
  sliderBubbleText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  playerTimeTextActive: {
    color: colors.text,
    fontWeight: '700',
  },
  // Chart colors, read by useChartColors so SVG follows the theme.
  chartAccent: {
    color: colors.lime,
  },
  chartFill: {
    backgroundColor: colors.lime,
  },
  chartTrack: {
    backgroundColor: '#30372A',
  },
  chartSurface: {
    backgroundColor: colors.surface,
  },
  chartGrid: {
    borderColor: colors.border,
  },
  chartAxisLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '600',
  },
  chartAxisLabelActive: {
    color: colors.text,
  },
  chartReadoutLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '600',
  },
  chartReadoutValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  chartClockHour: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  chartRankNumber: {
    width: 16,
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  chartRankLabel: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  chartRankValue: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '600',
  },
  emptyRotation: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 18,
    padding: 17,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  emptyDescription: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 5,
  },
  libraryIntro: {
    marginTop: 26,
  },
  libraryHeading: {
    color: colors.text,
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -1.3,
    lineHeight: 40,
  },
  libraryDescription: {
    color: '#B3B7A9',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
  },
  /** Solid docks flush, so the notice keeps its own margins. */
  appNoticeSolid: {
    marginHorizontal: 14,
    marginBottom: 6,
  },
  appNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  appNoticeText: {
    flex: 1,
    color: colors.text,
    fontSize: 12,
    lineHeight: 17,
  },
  appNoticeDismiss: {
    padding: 4,
  },
  // Padding only: FlashList's content container accepts padding, not flex.
  libraryListContent: {
    paddingHorizontal: 24,
    paddingBottom: 20,
  },
  libraryRows: {
    gap: 0,
    marginTop: 8,
  },
  // Library redesign: art with a now-playing overlay, a menu button instead
  // of a play button per row, Play & Shuffle, albums grid, artists, A-Z.
  libraryArtWrap: {
    borderRadius: 10,
    overflow: 'hidden',
  },
  libraryArtOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  libraryRowMenu: {
    width: 36,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  librarySearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  librarySearchField: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#30362A',
  },
  librarySearchFieldFocused: {
    borderColor: colors.lime,
  },
  /** The letters a search matched, in a song row. */
  libraryMatch: {
    color: colors.lime,
    fontWeight: '700',
  },
  /** Songs, Albums, Artists as text tabs; a short line marks the selected one. */
  libraryViewTabs: {
    flexDirection: 'row',
    gap: 22,
  },
  /** The views on the left, the sort on the right, one row. */
  libraryViewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 14,
  },
  /** The big title folds (fade and a little shrink) from its top-left corner. */
  libraryIntroFold: {
    transformOrigin: 'left top',
  },
  libraryShuffleButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#252C20',
  },
  libraryCountLine: {
    color: '#B3B7A9',
    fontSize: 13,
    marginTop: 12,
    paddingLeft: 4,
    fontVariant: ['tabular-nums'],
  },
  librarySlimBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  librarySlimBack: {
    backgroundColor: colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#30362A',
  },
  librarySlimTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  librarySlimTools: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginRight: -10,
  },
  librarySlimTool: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  librarySelectBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    backgroundColor: colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#30362A',
  },
  librarySelectButton: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 22,
    justifyContent: 'center',
  },
  librarySelectButtonText: {
    color: colors.lime,
    fontSize: 15,
    fontWeight: '700',
  },
  librarySelectCount: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
  /** Where the dock was, while songs are picked. */
  librarySelectActions: {
    position: 'absolute',
    left: 12,
    right: 12,
    height: 72,
    borderRadius: 26,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    boxShadow: '0px 18px 40px -20px rgba(0, 0, 0, 0.55)',
  },
  librarySelectAction: {
    minWidth: 60,
    minHeight: 58,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 4,
  },
  librarySelectActionText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '700',
  },
  /** A row that can be swiped is opaque, so the strip only shows where it slid away. */
  libraryTrackRowSolid: {
    backgroundColor: colors.background,
  },
  libraryTrackRowSelected: {
    backgroundColor: '#252C20',
    borderRadius: 14,
    marginHorizontal: -10,
    paddingLeft: 10,
    paddingRight: 4,
  },
  libraryCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#46513A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  libraryCheckOn: {
    backgroundColor: colors.lime,
    borderColor: colors.lime,
  },
  /** Under a swiped row: the action it will do. */
  swipeStrip: {
    borderRadius: 14,
    backgroundColor: '#252C20',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    overflow: 'hidden',
  },
  swipeStripArmed: {
    borderRadius: 14,
    backgroundColor: colors.lime,
  },
  swipeAction: {
    flexDirection: 'row',
  },
  swipeActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  swipeActionRowTrailing: {
    flexDirection: 'row-reverse',
  },
  swipeActionText: {
    color: colors.lime,
    fontSize: 13,
    fontWeight: '700',
  },
  swipeRow: {
    zIndex: 1,
  },
  toastWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 50,
  },
  toast: {
    maxWidth: '90%',
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 15,
    paddingRight: 20,
    paddingVertical: 10,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
  },
  toastCopy: {
    flexShrink: 1,
  },
  toastText: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  toastDetail: {
    marginTop: 1,
    fontSize: 12.5,
    fontWeight: '500',
  },
  libraryViewTab: {
    minHeight: 44,
    justifyContent: 'center',
  },
  libraryViewTabLabel: {
    color: '#B3B7A9',
    fontSize: 16,
    fontWeight: '600',
  },
  libraryViewTabLabelActive: {
    color: colors.text,
    fontWeight: '700',
  },
  libraryViewTabLine: {
    position: 'absolute',
    left: 0,
    bottom: 4,
    width: 100,
    height: 3,
    borderRadius: 2,
    transformOrigin: 'left center',
  },
  libraryShuffle: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
  /** With no count before it, it lines up with the search field's edge. */
  libraryShuffleFirst: {
    marginLeft: -8,
  },
  libraryShuffleText: {
    color: colors.lime,
    fontSize: 14,
    fontWeight: '700',
  },
  /** "1,204 songs" on the left, the sort on the right. */
  libraryListMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 4,
    marginBottom: 6,
    paddingLeft: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#30362A',
  },
  libraryListMetaText: {
    flexShrink: 1,
    color: '#B3B7A9',
    fontSize: 13,
  },
  /** Reverse arrow and sort name, side by side at the right. */
  librarySortControls: {
    maxWidth: '68%',
    flexDirection: 'row',
    alignItems: 'center',
  },
  librarySortReverse: {
    minWidth: 36,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  librarySortLink: {
    flexShrink: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 8,
  },
  libraryEmptyAction: {
    alignSelf: 'flex-start',
    minHeight: 40,
    marginTop: 12,
  },
  librarySortButtonText: {
    flexShrink: 1,
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  librarySortButtonDetail: {
    color: colors.muted,
    fontWeight: '500',
  },
  libraryActionPressed: {
    backgroundColor: '#252C20',
  },
  libraryAlbumCard: {
    flex: 1,
    paddingBottom: 18,
  },
  libraryAlbumCardLeft: {
    paddingRight: 7,
  },
  libraryAlbumCardRight: {
    paddingLeft: 7,
  },
  libraryAlbumTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    marginTop: 8,
  },
  libraryAlbumSubtitle: {
    color: '#B3B7A9',
    fontSize: 13,
    marginTop: 2,
  },
  libraryAlbumDetail: {
    color: '#B3B7A9',
    fontSize: 12,
    marginTop: 2,
  },
  libraryArtistRow: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 8,
    borderRadius: 14,
  },
  libraryIndex: {
    position: 'absolute',
    right: 0,
    width: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  libraryIndexLetter: {
    color: colors.lime,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
    textAlign: 'center',
    width: 26,
  },
  libraryIndexBubble: {
    position: 'absolute',
    right: 48,
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    boxShadow: '0px 6px 18px rgba(0, 0, 0, 0.3)',
  },
  libraryIndexBubbleText: {
    color: colors.lime,
    fontSize: 28,
    fontWeight: '700',
  },
  // The current sort, as a chip that opens the sort sheet.
  librarySortChipPressed: {
    opacity: 0.7,
  },
  libraryTrackRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 2,
    paddingVertical: 8,
    borderRadius: 14,
  },
  // The playing song: a soft accent card, so it is easy to spot in a long list.
  libraryTrackRowPlaying: {
    backgroundColor: '#2B3821',
    borderRadius: 14,
    borderBottomColor: 'transparent',
    marginHorizontal: -10,
    paddingLeft: 10,
    paddingRight: 4,
  },
  libraryTrackFavorite: {
    color: colors.muted,
    marginRight: -4,
  },
  libraryTrackRowDisabled: {
    opacity: 0.72,
  },
  libraryTrackCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  libraryTrackTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  libraryTrackTitleCurrent: {
    color: colors.lime,
  },
  libraryTrackSubtitle: {
    color: '#B3B7A9',
    fontSize: 13,
  },
  libraryTrackDuration: {
    color: '#B3B7A9',
    minWidth: 38,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  libraryTrackSortValue: {
    color: colors.lime,
    fontWeight: '600',
  },
  settingsTitle: {
    color: colors.text,
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -1.3,
    lineHeight: 40,
  },
  // Equalizer, iOS style: grouped cards, white thumbs, accent fills.
  eqHeaderTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -1,
  },
  eqStatus: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 10,
  },
  eqEditorCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    marginTop: 12,
    paddingVertical: 12,
  },
  eqEditorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  eqEditorTitle: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  eqTextButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  eqTextButtonLabel: {
    color: colors.lime,
    fontSize: 15,
    fontWeight: '600',
  },
  eqBandRow: {
    flexDirection: 'row',
    paddingHorizontal: 6,
  },
  eqBandColumn: {
    flex: 1,
    alignItems: 'center',
  },
  eqBandColumnWide: {
    width: 40,
    alignItems: 'center',
  },
  eqBandValue: {
    height: 16,
    color: colors.text,
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  eqBandTouch: {
    alignSelf: 'stretch',
    alignItems: 'center',
    marginVertical: 6,
  },
  eqBandTrack: {
    width: 4,
    height: '100%',
    borderRadius: 2,
    backgroundColor: '#30372A',
    overflow: 'hidden',
  },
  eqBandFill: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: '100%',
    backgroundColor: colors.lime,
    transformOrigin: 'top',
  },
  eqBandThumb: {
    position: 'absolute',
    top: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    boxShadow: '0px 1px 4px rgba(0, 0, 0, 0.3)',
  },
  eqBandLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  eqSlider: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
  },
  eqSliderTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  eqSliderTitle: {
    flexShrink: 1,
    color: colors.text,
    fontSize: 16,
    fontWeight: '500',
  },
  eqSliderValue: {
    color: colors.muted,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
  },
  eqSliderTouch: {
    height: 40,
    justifyContent: 'center',
  },
  eqSliderTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#30372A',
    overflow: 'hidden',
  },
  eqSliderFill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '100%',
    backgroundColor: colors.lime,
    transformOrigin: 'left',
  },
  eqSliderThumb: {
    position: 'absolute',
    left: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    boxShadow: '0px 2px 5px rgba(0, 0, 0, 0.28)',
  },
  eqPresetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    paddingHorizontal: 10,
    borderRadius: 14,
  },
  eqPresetRowPressed: {
    backgroundColor: '#252C20',
  },
  eqPresetName: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    fontWeight: '500',
  },
  // Settings, iOS grouped-list style: 16pt rows, 13pt headers and notes.
  prefSection: {
    marginTop: 22,
  },
  /** An untitled group on the main Settings list, close to the one above. */
  prefSectionGrouped: {
    marginTop: 12,
  },
  prefSectionHeader: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 6,
    marginLeft: 16,
  },
  // Settings pages: bold headings and rounder cards, set 14 from the screen edge like the dock.
  /** Settings cards, titles and buttons start 16 from the screen edge; text inside them at 32. */
  settingsEdge: {
    marginHorizontal: -8,
  },
  settingsHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 26,
  },
  settingsLede: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 21,
    marginTop: 6,
  },
  /** Library's search pill, without the flex it needs in Library's row. */
  settingsSearchField: {
    flex: 0,
    marginTop: 16,
  },
  settingsRoundButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  settingsPageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 26,
  },
  settingsPageSubtitle: {
    color: colors.muted,
    fontSize: 14,
    marginTop: 4,
    paddingHorizontal: 6,
  },
  prefSectionLarge: {
    marginTop: 24,
  },
  prefSectionLargeUntitled: {
    marginTop: 14,
  },
  prefSectionHeaderLarge: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
    marginBottom: 8,
    marginLeft: 16,
  },
  prefCardLarge: {
    borderRadius: 20,
  },
  settingsPreview: {
    marginTop: 20,
    borderRadius: 20,
    padding: 12,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  settingsPreviewCaption: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  settingsPreviewLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  settingsPreviewValue: {
    color: colors.muted,
    fontSize: 13,
  },
  prefSectionFooter: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6,
    marginHorizontal: 16,
  },
  prefCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    overflow: 'hidden',
  },
  prefRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  prefRowPressed: {
    backgroundColor: '#252C20',
  },
  prefRowDisabled: {
    opacity: 0.45,
  },
  prefRowCopy: {
    flex: 1,
    minWidth: 0,
  },
  prefRowTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '500',
  },
  prefRowTitleDestructive: {
    color: '#EAA38E',
  },
  prefRowSubtitle: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  /** Title, then (when there is a line underneath) the value at the right. */
  prefRowTitleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  prefRowValueGroup: {
    flexShrink: 1,
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  /** The current value beside a title: quiet, so it never reads as an alert. */
  prefRowValueBeside: {
    flexShrink: 1,
    color: colors.muted,
    fontSize: 13,
  },
  prefRowSwatch: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  prefRowDetail: {
    color: colors.muted,
    fontSize: 15,
    maxWidth: 170,
    textAlign: 'right',
  },
  prefSeparator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: 58,
  },
  prefIconTile: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prefSwitchTrack: {
    width: 51,
    height: 31,
    borderRadius: 16,
    padding: 2,
    justifyContent: 'center',
    backgroundColor: '#30372A',
  },
  prefSwitchThumb: {
    width: 27,
    height: 27,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.25)',
  },
  prefBlock: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
  },
  prefSwatches: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    // The first and last circles line up with the text.
    marginHorizontal: -4,
  },
  prefSwatchButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
    borderWidth: 2,
  },
  prefSwatch: {
    width: 26,
    height: 26,
    borderRadius: 13,
  },
  // About: the app, its promises, and who made it.
  // Settings › Updates: the installed version, when it was checked, a status, one button.
  updateCard: {
    padding: 16,
    gap: 16,
  },
  updateHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  updateTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  updateSubtitle: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  updateStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#252C20',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  updateDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.lime,
  },
  updateDotQuiet: {
    backgroundColor: colors.muted,
  },
  updateDotError: {
    backgroundColor: '#EAA38E',
  },
  updateStatusText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  updateButton: {
    minHeight: 48,
    borderRadius: 15,
  },
  aboutCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    padding: 20,
    gap: 14,
  },
  aboutTagline: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 21,
  },
  aboutMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  aboutPill: {
    backgroundColor: '#252C20',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  aboutPillText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  aboutDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  aboutCreditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  aboutAvatar: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2B3821',
    borderRadius: 23,
  },
  aboutAvatarIcon: {
    color: colors.lime,
  },
  aboutCreditLabel: {
    color: colors.muted,
    fontSize: 12,
    marginBottom: 2,
  },
  creditLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    minHeight: 28,
  },
  creditLinkPressed: {
    opacity: 0.6,
  },
  creditLink: {
    color: colors.lime,
    fontSize: 16,
    fontWeight: '700',
  },
  // Launch screen: the mark, a motto, and the maker's credit at the bottom.
  launch: {
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  launchCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
  },
  settingRowPressed: {
    opacity: 0.7,
  },
  settingCopy: {
    flex: 1,
  },
  // Floating glass dock: notice, mini player, then the tab pill and search.
  // Glass fills and edges come from Glass.tsx, not from here.
  dock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    gap: 6,
  },
  /** The dock's contents, in one wrapper that slides away while Library picks songs. */
  dockStack: {
    gap: 6,
  },
  /** Notice and mini player, which float in every glass style. */
  dockFloating: {
    paddingHorizontal: 14,
    gap: 6,
  },
  /** Solid: no gaps or margins, so mini player and bar read as one block. */
  dockSolid: {
    gap: 0,
  },
  dockFloatingSolid: {
    paddingHorizontal: 0,
    gap: 0,
  },
  // Solid style: one opaque bar along the bottom edge, Android style. Colors
  // are theme tokens here (not in Glass.tsx), so every accent maps them.
  // Card tone, so the bar sits a step above the page instead of blending in.
  solidBar: {
    backgroundColor: '#1C2118',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#2A3024',
    paddingHorizontal: 6,
    paddingTop: 10,
  },
  solidTabRow: {
    flexDirection: 'row',
    paddingBottom: 8,
  },
  solidItem: {
    flex: 1,
    minHeight: 60,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  solidIconWrap: {
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  solidIcon: {
    color: '#858D78',
  },
  solidIconActive: {
    color: colors.lime,
  },
  solidLabel: {
    color: '#858D78',
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  solidLabelActive: {
    color: colors.lime,
    fontWeight: '700',
  },
  solidSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 56,
    paddingHorizontal: 8,
    paddingBottom: 6,
  },
  /** The search pill in Library and the Solid bar. */
  searchPill: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 14,
    paddingRight: 2,
    backgroundColor: '#252C20',
    borderRadius: 24,
  },
  solidSearchCancel: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  solidSearchCancelText: {
    color: colors.lime,
    fontSize: 15,
    fontWeight: '600',
  },
  dockSlot: {
    flex: 1,
  },
  bottomTabs: {
    flex: 1,
    padding: 3,
  },
  bottomTabRow: {
    flexDirection: 'row',
  },
  /** Size and place come from the press animation in BottomTabs. */
  bottomTabCapsule: {
    position: 'absolute',
    left: 0,
    borderWidth: StyleSheet.hairlineWidth,
  },
  bottomTab: {
    flex: 1,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  bottomTabIcon: {
    color: colors.text,
  },
  bottomTabIconActive: {
    color: colors.lime,
  },
  bottomTabLabel: {
    color: colors.text,
    fontSize: 10,
    fontWeight: '600',
  },
  bottomTabLabelActive: {
    color: colors.lime,
    fontWeight: '700',
  },
  bottomSearch: {
    width: 56,
    height: 56,
  },
  bottomSearchButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The dock's search field, which takes the tab pill's place.
  searchField: {
    flex: 1,
    height: 56,
  },
  searchFieldRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 16,
    paddingRight: 6,
  },
  searchFieldInput: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    paddingVertical: 0,
  },
  searchFieldClear: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Search results page.
  searchSection: {
    marginTop: -4,
  },
  searchSeeAll: {
    minHeight: 44,
    justifyContent: 'center',
  },
  searchChipRow: {
    paddingHorizontal: 24,
    gap: 8,
    paddingTop: 4,
  },
  searchChip: {
    minHeight: 40,
    borderRadius: 20,
  },
  searchTopArt: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#252C20',
    borderRadius: 14,
  },
  searchTopTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  searchTopPlay: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
  },
  searchIconTile: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#252C20',
    borderRadius: 10,
  },
  /** A sheet's labelled close button, such as "Done", in place of the cross. */
  // Same height as the close cross, so a Done sheet's heading lines up with the rest.
  sheetDone: {
    height: 34,
    paddingHorizontal: 16,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.lime,
  },
  sheetDoneText: {
    color: '#202719',
    fontSize: 14,
    fontWeight: '700',
  },
  // Change cover: the big preview, then one grid of covers to tap. 8 dp grid.
  coverSheetPreview: {
    alignSelf: 'center',
    marginTop: 16,
  },
  coverSheetSong: {
    color: colors.muted,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 16,
  },
  coverSheetSongTitle: {
    color: colors.text,
    fontWeight: '700',
  },
  coverSheetHint: {
    color: colors.muted,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 2,
  },
  coverSheetLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 24,
    marginBottom: 10,
  },
  coverPickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 10,
    rowGap: 16,
  },
  coverTilePic: {
    borderRadius: 14,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  /** The chosen tile's outline, a little outside its picture. */
  coverTileRing: {
    position: 'absolute',
    top: -4,
    left: -4,
    right: -4,
    bottom: -4,
    borderRadius: 18,
    borderWidth: 3,
    borderColor: colors.lime,
  },
  coverTileCheck: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.lime,
  },
  coverTileName: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 8,
  },
  coverTileNameOn: {
    color: colors.lime,
  },
  coverTilePressed: {
    opacity: 0.7,
  },
  coverMessage: {
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    backgroundColor: colors.surface,
  },
  coverMessageTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  coverMessageText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 4,
  },
  coverLink: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    marginTop: 8,
  },
  coverLinkCentered: {
    alignSelf: 'center',
  },
  coverLinkText: {
    color: colors.lime,
    fontSize: 14,
    fontWeight: '700',
  },
  coverSearchRow: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 14,
    paddingRight: 6,
    borderRadius: 16,
    marginTop: 12,
    backgroundColor: colors.surface,
  },
  coverSearchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    paddingVertical: 0,
  },
  coverSearchButton: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.lime,
  },
  coverSearchButtonText: {
    color: '#202719',
    fontSize: 14,
    fontWeight: '700',
  },
  coverError: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 12,
  },
} as const;

/** Accent-filled buttons and the text on them: the accent's action color and its readable label color. */
const ACTION_FILLS = new Set(['primaryButton', 'sheetDone', 'coverSearchButton']);
const ACTION_LABELS = new Set(['primaryButtonLabel', 'buttonArrow', 'sheetDoneText', 'coverSearchButtonText']);

function buildStyles(theme: Theme, accent: Accent, isAmoled: boolean) {
  return StyleSheet.create(
    theme === 'light'
      ? createLightStyleDefinitions(styleDefinitions, accent)
      : createDarkStyleDefinitions(styleDefinitions, accent, isAmoled),
  );
}

/**
 * Each look (theme, accent, AMOLED) is built the first time it is shown and
 * kept. Building all 24 while the app loaded made about 20,000 styles before
 * the first frame, though only one look is on screen.
 */
const builtStyles = new Map<string, ReturnType<typeof buildStyles>>();

export function useAppStyles() {
  const { theme, accent, isAmoled } = useContext(ThemeContext);
  const key = [theme, theme === 'dark' && isAmoled ? 'amoled' : '', accent].join(':');
  let styles = builtStyles.get(key);
  if (!styles) {
    styles = buildStyles(theme, accent, isAmoled);
    builtStyles.set(key, styles);
  }
  return styles;
}

function createDarkStyleDefinitions<T extends Record<string, object>>(
  definitions: T,
  accentTheme: Accent,
  isAmoled: boolean,
): T {
  const accent = {
    // Muse Lime: the app icon's lime.
    lime: {
      primary: '#C4F27A',
      action: '#C4F27A',
      onAction: '#24331A',
      muted: '#93BF55',
      surface: '#313E1F',
    },
    muse: {
      primary: '#B9E77B',
      action: '#B9E77B',
      onAction: '#24331A',
      muted: '#87AE50',
      surface: '#2D3A22',
    },
    ocean: {
      primary: '#8BD7FF',
      action: '#8BD7FF',
      onAction: '#173247',
      muted: '#5AA9D8',
      surface: '#193247',
    },
    sunset: {
      primary: '#FFD18A',
      action: '#FFD18A',
      onAction: '#3B2A18',
      muted: '#D49A4A',
      surface: '#3B2A18',
    },
    rose: {
      primary: '#FF8FB8',
      action: '#FF8FB8',
      onAction: '#4A1028',
      muted: '#D9608D',
      surface: '#45192B',
    },
    coral: {
      primary: '#FFB0A8',
      action: '#FFB0A8',
      onAction: '#4A2423',
      muted: '#D47F78',
      surface: '#422625',
    },
    teal: {
      primary: '#8DE1D5',
      action: '#8DE1D5',
      onAction: '#173E3A',
      muted: '#5FB3A7',
      surface: '#1C3835',
    },
    // A strong red. Buttons use the deeper shade so white on top stays
    // readable; text uses the brighter one so it reads on near-black.
    red: {
      primary: '#FF4D4D',
      action: '#E11D2A',
      onAction: '#FFFFFF',
      muted: '#D93A40',
      surface: '#3D1214',
    },
  }[accentTheme];
  // Neutral, iOS-style darks: near-black page, grey cards, bright text. The
  // older olive-tinted greys read as murky and washed out, with low contrast
  // for secondary text and icons. Only the accent carries color now.
  const darkBackgrounds: Record<string, string> = {
    '#11130F': '#0B0B0C', // page
    '#171A14': '#161618',
    '#191C16': '#18181B',
    '#1C2118': '#1C1C1E', // cards (iOS secondary background)
    '#20251B': '#222225',
    '#20271A': '#222225',
    '#22291D': '#242427',
    '#252C20': '#2C2C2E', // raised (iOS tertiary background)
    '#30372A': '#333336',
    '#30362A': '#333336',
    '#454C3F': '#48484A',
    '#606A54': '#636366',
    '#818A72': '#8E8E93',
    '#2B3821': accent.surface,
    '#382724': '#3A2422',
  };
  const amoledBackgrounds: Record<string, string> = {
    '#0B0B0C': '#000000',
    '#161618': '#000000',
    '#18181B': '#050505',
    '#1C1C1E': '#000000',
    '#222225': '#101012',
    '#242427': '#121214',
    '#2C2C2E': '#1A1A1C',
    '#333336': '#222224',
    '#48484A': '#2C2C2E',
    '#3A2422': '#271A17',
    [accent.surface]: '#111111',
  };
  const darkBorders: Record<string, string> = {
    '#2A3123': '#38383A', // iOS opaque separator
    '#2A3024': '#2C2C2E',
    '#292E23': '#2C2C2E',
    '#30362A': '#3A3A3C',
    '#303A27': '#3A3A3C',
    '#39412F': '#3A3A3C',
    '#3B4630': '#48484A',
    '#46513A': '#48484A',
    '#606A54': '#636366',
    '#718B4E': accent.muted,
  };
  // Every secondary text and icon tone reads at 4.5:1 or better on the cards.
  const darkForegrounds: Record<string, string> = {
    '#F3F1E8': '#F5F5F7', // main text
    '#E4E6DB': '#EBEBF0',
    '#E7E8DE': '#EBEBF0',
    '#B3B7A9': '#C7C7CC',
    '#A5A99A': '#AEAEB2', // secondary text
    '#A5AA9C': '#AEAEB2',
    '#959B8D': '#A1A1A6',
    '#929987': '#A1A1A6',
    '#858D78': '#A1A1A6',
    '#818978': '#A1A1A6',
    '#EAA38E': '#FF9F8A',
    '#C4F078': accent.primary,
  };

  const transformed = Object.fromEntries(
    Object.entries(definitions).map(([styleName, style]) => [
      styleName,
      Object.fromEntries(
        Object.entries(style).map(([property, value]) => {
          if (typeof value !== 'string' || !property.toLowerCase().includes('color')) {
            return [property, value];
          }
          if (value.trim().toLowerCase().startsWith('rgba(')) {
            return [property, value];
          }
          const color = value.toUpperCase();
          if (ACTION_FILLS.has(styleName) && property === 'backgroundColor') {
            return [property, accent.action];
          }
          if (ACTION_LABELS.has(styleName) && property === 'color') {
            return [property, accent.onAction];
          }
          if (property === 'backgroundColor') {
            const darkColor = darkBackgrounds[color] ?? value;
            if (color === '#C4F078') {
              return [property, accent.primary];
            }
            if (color === '#9CC75F') {
              return [property, accent.muted];
            }
            return [
              property,
              isAmoled
                ? amoledBackgrounds[darkColor.toUpperCase()] ?? darkColor
                : darkColor,
            ];
          }
          if (property.toLowerCase().includes('border')) {
            if (color === '#C4F078') {
              return [property, accent.primary];
            }
            return [property, darkBorders[color] ?? value];
          }
          return [property, darkForegrounds[color] ?? value];
        }),
      ),
    ]),
  );
  return transformed as T;
}

function createLightStyleDefinitions<T extends Record<string, object>>(
  definitions: T,
  accentTheme: Accent,
): T {
  const accent = {
    // Muse Lime: deeper than the icon's lime so text reads on light backgrounds (4.7:1).
    lime: {
      primary: '#4F7A12',
      action: '#B5E36F',
      onAction: '#1C2913',
      border: '#5E8A1C',
      surface: '#F2F8E6',
      tint: '#E9F4D6',
    },
    muse: {
      // Was #739B42, only 3:1 on the light background.
      primary: '#4A7323',
      action: '#A5D66A',
      onAction: '#1C2913',
      border: '#739B42',
      surface: '#F1F6EC',
      tint: '#E8F2DE',
    },
    ocean: {
      primary: '#176A9A',
      action: '#76C5ED',
      onAction: '#12354A',
      border: '#2478A8',
      surface: '#F0F7FC',
      tint: '#E3F1FA',
    },
    sunset: {
      primary: '#87520F',
      action: '#F2C36F',
      onAction: '#432B0C',
      border: '#9A5E13',
      surface: '#FFF8EC',
      tint: '#FFF0D6',
    },
    rose: {
      primary: '#B0275B',
      action: '#F28AB0',
      onAction: '#4A1028',
      border: '#C93D72',
      surface: '#FFF0F5',
      tint: '#FFE1EC',
    },
    coral: {
      primary: '#A64643',
      action: '#F0A09A',
      onAction: '#4A201F',
      border: '#C26762',
      surface: '#FFF1EF',
      tint: '#FFE3E0',
    },
    teal: {
      primary: '#28766E',
      action: '#8ACCC3',
      onAction: '#143C38',
      border: '#4C9B91',
      surface: '#EAF8F6',
      tint: '#D9F0ED',
    },
    red: {
      primary: '#C3121C',
      action: '#E11D2A',
      onAction: '#FFFFFF',
      border: '#D11A26',
      surface: '#FFF1F1',
      tint: '#FFE1E2',
    },
  }[accentTheme];
  const transformed = Object.fromEntries(
    Object.entries(definitions).map(([styleName, style]) => [
      styleName,
      Object.fromEntries(
        Object.entries(style).map(([property, value]) => {
          if (typeof value !== 'string' || !property.toLowerCase().includes('color')) {
            return [property, value];
          }
          if (value.trim().toLowerCase().startsWith('rgba(')) {
            return [property, value];
          }
          const color = value.toUpperCase();
          if (ACTION_FILLS.has(styleName) && property === 'backgroundColor') {
            return [property, accent.action];
          }
          if (ACTION_LABELS.has(styleName) && property === 'color') {
            return [property, accent.onAction];
          }
          if (
            styleName === 'libraryTopBarSort' &&
            property === 'backgroundColor'
          ) {
            return [property, '#FFFFFF'];
          }
          if (
            styleName === 'libraryTopBarSort' &&
            property === 'borderColor'
          ) {
            return [property, '#B8C4B4'];
          }
          if (
            styleName === 'librarySortButtonSelected' &&
            property === 'borderColor'
          ) {
            return [property, accent.primary];
          }
          if (
            styleName === 'librarySortIconLine' &&
            property === 'backgroundColor'
          ) {
            return [property, '#26302A'];
          }
          if (color === '#C4F078') {
            return [property, property === 'borderColor' ? accent.border : accent.primary];
          }
          // Home: the recap's tint needs more colour than the surface to stand out on a pale page.
          if (styleName === 'pulseRecap') {
            return [property, property === 'borderColor' ? `${accent.border}4D` : accent.tint];
          }
          // Dark marks on white cards (the text colour would turn white as a background).
          if ((styleName === 'pulseNowDot' || styleName === 'pulseNotch') && property === 'backgroundColor') {
            return [property, '#26302A'];
          }
          // Skeleton shapes: white on a near-white page would vanish.
          if (styleName === 'pulseSkel' && property === 'backgroundColor') {
            return [property, '#E3E8DB'];
          }
          if (styleName === 'pulseSkelCard' && property === 'backgroundColor') {
            return [property, '#ECF0E6'];
          }
          if (property === 'backgroundColor') {
            if (color === '#2B3821' || color === '#20271A' || color === '#22291D') {
              return [property, accent.surface];
            }
            // A switched-on toggle uses the accent's strong color. The pale
            // tint left a white knob on near-white, so "on" was invisible.
            if (styleName === 'themeSwitchOn') {
              return [property, accent.primary];
            }
            if (color === '#9CC75F') {
              return [property, accent.tint];
            }
          }
          if (property.toLowerCase().includes('border') && color === '#718B4E') {
            return [property, accent.border];
          }
          return [property, toLightColor(property, value)];
        }),
      ),
    ]),
  );
  return transformed as T;
}

function toLightColor(property: string, value: string): string {
  const color = value.toUpperCase();
  if (property === 'backgroundColor') {
    const backgrounds: Record<string, string> = {
      '#11130F': '#F5F6F0',
      '#2A3123': '#D9DFD1',
      '#191C16': '#FFFFFF',
      '#171A14': '#FFFFFF',
      '#1C2118': '#FFFFFF',
      '#20251B': '#F5F7F2',
      '#252C20': '#F1F5EF',
      '#30372A': '#E8EEE5',
      '#22291D': '#F0F6EA',
      '#2B3821': '#F1F6EC',
      '#382724': '#F7EAE5',
      '#20271A': '#F1F6EC',
      '#454C3F': '#B9C2AD',
      '#30362A': '#DCE1D4',
      '#9CC75F': '#91BA55',
      '#E8EBDD': '#FFFFFF',
      '#FFFFFF': '#FFFFFF',
      '#818A72': '#C9D2BC',
      '#F3F4EF': '#FFFFFF',
      '#DDF3B8': '#BCE58A',
    };
    return backgrounds[color] ?? '#FFFFFF';
  }

  if (property.toLowerCase().includes('border')) {
    const borders: Record<string, string> = {
      '#2A3123': '#D9DFD1',
      '#30362A': '#D7DECF',
      '#39412F': '#D3DAC9',
      '#46513A': '#C9D4BD',
      '#303A27': '#CBD6BE',
      '#292E23': '#E0E4D9',
      '#3B4630': '#CAD5BD',
      '#718B4E': '#79964E',
      '#606A54': '#AAB59B',
      '#2A3024': '#DCE2D4',
      // A ring in the page color (badges that sit on an avatar).
      '#11130F': '#F5F6F0',
    };
    if (color === colors.lime.toUpperCase()) {
      return '#527A2C';
    }
    return borders[color] ?? '#D9E0D8';
  }

  const foregrounds: Record<string, string> = {
    '#C4F078': '#365D1C',
    '#F3F1E8': '#192218',
    '#A5A99A': '#515D49',
    '#C5C9B9': '#34402C',
    '#858D78': '#526047',
    '#E4E7DB': '#20291C',
    '#A5AA9C': '#515E49',
    '#202719': '#26311F',
    '#767D6E': '#536047',
    '#E4E6DB': '#20291C',
    '#959B8D': '#56624D',
    '#B3B7A9': '#485442',
    '#EAA38E': '#A84E35',
    '#D5D9CC': '#36412F',
    '#303A27': '#46543A',
    '#A0A895': '#4C5944',
    '#B1B6A8': '#485440',
    '#D4D8CA': '#36412F',
    '#89917E': '#55624A',
    '#E7E8DE': '#20291C',
    '#939B86': '#526047',
    '#929987': '#59644F',
    '#818978': '#56614C',
    '#A84E35': '#A84E35',
    '#27331D': '#26331D',
    '#667060': '#475341',
    '#555B52': '#4A5146',
    '#777F6E': '#58634F',
    '#68715F': '#536047',
  };
  if (color === '#FFFFFF') {
    return '#FFFFFF';
  }
  return foregrounds[color] ?? '#26302A';
}
