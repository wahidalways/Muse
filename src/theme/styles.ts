import { useContext } from 'react';
import { StyleSheet } from 'react-native';
import { type Accent, ThemeContext } from './theme';

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
    alignItems: 'center',
    gap: 9,
  },
  logo: {
    height: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  logoBar: {
    width: 3,
    height: 12,
    borderRadius: 2,
    backgroundColor: colors.lime,
  },
  brandName: {
    color: colors.text,
    fontSize: 23,
    fontWeight: '700',
    letterSpacing: -1,
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
  setupProgress: {
    marginTop: 24,
  },
  setupProgressTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 9,
  },
  setupProgressLabel: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
  setupProgressCount: {
    color: colors.lime,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
  },
  setupProgressTrack: {
    flexDirection: 'row',
    gap: 5,
  },
  setupProgressSegment: {
    flex: 1,
    height: 3,
    backgroundColor: colors.border,
    borderRadius: 2,
  },
  setupProgressSegmentActive: {
    backgroundColor: colors.lime,
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
  artworkCard: {
    height: 254,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 24,
    marginTop: 24,
    paddingHorizontal: 17,
    paddingTop: 16,
    paddingBottom: 13,
    overflow: 'hidden',
  },
  artworkTopline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardEyebrow: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  artworkTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 5,
  },
  artworkDeviceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  artworkDeviceLabel: {
    color: colors.muted,
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  artworkLiveDot: {
    width: 6,
    height: 6,
    backgroundColor: colors.lime,
    borderRadius: 3,
  },
  artworkStage: {
    height: 118,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 5,
  },
  artworkSleeveBack: {
    position: 'absolute',
    width: 84,
    height: 98,
    left: '25%',
    backgroundColor: '#30372A',
    borderWidth: 1,
    borderColor: '#39412F',
    borderRadius: 13,
    transform: [{ rotate: '-9deg' }],
  },
  artworkSleeve: {
    position: 'absolute',
    width: 84,
    height: 98,
    left: '22%',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#252C20',
    borderWidth: 1,
    borderColor: '#39412F',
    borderRadius: 13,
    padding: 9,
    transform: [{ rotate: '-5deg' }],
  },
  artworkSleeveTop: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  artworkSleeveDot: {
    width: 7,
    height: 7,
    backgroundColor: colors.lime,
    borderRadius: 4,
  },
  artworkSleeveLine: {
    width: 24,
    height: 3,
    backgroundColor: '#606A54',
    borderRadius: 2,
  },
  artworkSleeveCenter: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#30372A',
    borderWidth: 1,
    borderColor: '#46513A',
    borderRadius: 21,
  },
  artworkSleeveCore: {
    width: 18,
    height: 18,
    backgroundColor: colors.lime,
    borderRadius: 9,
  },
  artworkSleeveBottom: {
    width: '100%',
    alignItems: 'center',
    gap: 4,
  },
  artworkSleeveLineShort: {
    width: 39,
    height: 3,
    backgroundColor: colors.lime,
    borderRadius: 2,
  },
  artworkVinyl: {
    position: 'absolute',
    width: 112,
    height: 112,
    right: '22%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 56,
  },
  artworkVinylRing: {
    width: 94,
    height: 94,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#39412F',
    borderRadius: 47,
  },
  artworkVinylRingInner: {
    width: 70,
    height: 70,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#46513A',
    borderRadius: 35,
  },
  artworkVinylLabel: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.lime,
    borderRadius: 16,
  },
  artworkVinylCenter: {
    width: 6,
    height: 6,
    backgroundColor: colors.background,
    borderRadius: 3,
  },
  artworkFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 10,
  },
  artworkFooterMark: {
    width: 29,
    height: 29,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#252C20',
    borderRadius: 9,
  },
  artworkFooterMarkText: {
    color: colors.lime,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -1,
  },
  artworkFooterCopy: {
    flex: 1,
    marginLeft: 9,
  },
  artworkFooterTitle: {
    color: colors.text,
    fontSize: 10,
    fontWeight: '700',
  },
  artworkFooterNote: {
    color: colors.muted,
    fontSize: 8,
    marginTop: 2,
  },
  waveform: {
    height: 25,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 4,
  },
  waveformBar: {
    width: 2,
    backgroundColor: colors.lime,
    borderRadius: 2,
  },
  bottomArea: {
    marginTop: 'auto',
    paddingTop: 28,
  },
  privacyNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
  },
  privacyIndicator: {
    width: 7,
    height: 7,
    backgroundColor: colors.lime,
    borderRadius: 4,
  },
  privacyText: {
    color: '#A5AA9C',
    fontSize: 10,
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
  permissionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 20,
    padding: 17,
    marginTop: 26,
  },
  permissionIcon: {
    padding: 5,
    backgroundColor: '#20251B',
    borderRadius: 14,
  },
  permissionCopy: {
    flex: 1,
  },
  permissionTitle: {
    color: '#E4E6DB',
    fontSize: 14,
    fontWeight: '700',
  },
  permissionDescription: {
    color: '#959B8D',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
  },
  privacyList: {
    gap: 13,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 18,
    padding: 15,
    marginTop: 16,
  },
  privacyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  checkMark: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2B3821',
    borderRadius: 10,
  },
  checkMarkText: {
    color: colors.lime,
    fontSize: 12,
    fontWeight: '700',
  },
  privacyItemText: {
    color: '#B3B7A9',
    fontSize: 11,
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
  loadingIndicator: {
    marginTop: 12,
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
    backgroundColor: '#171A14',
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
  playerArtworkFallback: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
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
  playerTimeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  playerTimeSwap: {
    color: colors.muted,
  },
  playerSecondaryButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  playerSecondaryButtonSelected: {
    backgroundColor: colors.background,
    borderColor: colors.lime,
  },
  playerSkipButton: {
    minWidth: 34,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerSkipButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
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
  /** "1.5× · Sleep 12:30" under the header title while either is on. */
  fullPlayerHeaderStatus: {
    color: colors.lime,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 3,
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
  fullPlayerHero: {
    alignItems: 'center',
    width: '100%',
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
  lyricsContent: {
    paddingTop: 8,
    paddingBottom: 120,
    gap: 14,
  },
  lyricsLine: {
    color: colors.muted,
    fontSize: 22,
    lineHeight: 30,
    fontWeight: '700',
    opacity: 0.5,
  },
  lyricsLineActive: {
    color: colors.text,
    opacity: 1,
  },
  lyricsPlain: {
    color: colors.text,
    fontSize: 17,
    lineHeight: 27,
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
    width: '47%',
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 15,
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
  playerSpeedRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  playerSpeedChip: {
    minWidth: 56,
    minHeight: 44,
    alignItems: 'center',
  },
  fullPlayerQueue: {
    marginTop: 12,
    marginBottom: 2,
  },
  fullPlayerQueueToggle: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 2,
    paddingVertical: 6,
  },
  fullPlayerQueueToggleCopy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  fullPlayerQueueToggleTitle: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  fullPlayerQueueToggleCount: {
    color: colors.muted,
    fontSize: 11,
  },
  fullPlayerQueueToggleIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
  },
  playerQueueEmpty: {
    backgroundColor: colors.surface,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    paddingHorizontal: 15,
    paddingVertical: 13,
  },
  playerQueueEmptyText: {
    color: colors.muted,
    fontSize: 13,
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
  playerQueueRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
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
  playerQueueIndex: {
    color: colors.muted,
    fontSize: 9,
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
  homeHero: {
    marginTop: 18,
  },
  homeHeroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  homeHeroCopy: {
    flex: 1,
  },
  homeHeroTitle: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -1,
    lineHeight: 34,
  },
  homeHeroLine: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
  homeIconButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
  },
  homeChip: {
    minHeight: 32,
    justifyContent: 'center',
    backgroundColor: '#252C20',
    borderRadius: 16,
    paddingHorizontal: 12,
  },
  homeChipText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  homeChipAction: {
    backgroundColor: '#2B3821',
  },
  homeChipActionText: {
    color: colors.lime,
    fontSize: 12,
    fontWeight: '700',
  },
  mixGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  mixCell: {
    flexBasis: '46%',
    flexGrow: 1,
  },
  mixTile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 60,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 4,
    paddingRight: 10,
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
  // ---- Home board (code names say pulse) ----
  pulseHeroRow: {
    marginTop: 18,
  },
  pulseIconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
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
    padding: 14,
    overflow: 'hidden',
  },
  pulseTileSquare: {
    aspectRatio: 1,
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
  pulseDelta: {
    color: colors.lime,
    fontSize: 14,
    fontWeight: '800',
  },
  pulseDeltaDown: {
    color: colors.muted,
  },
  pulseWeekPlot: {
    flexDirection: 'row',
    gap: 10,
    height: 92,
    marginTop: 16,
  },
  pulseWeekColumn: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: '#20251B',
    borderRadius: 10,
    overflow: 'hidden',
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
    backgroundColor: '#30372A',
    color: colors.text,
  },
  pulseRingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRingValue: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
    lineHeight: 26,
    textAlign: 'center',
  },
  pulseRingUnit: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  pulseFoot: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
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
    gap: 8,
    marginTop: 10,
  },
  pulseMix: {
    flexBasis: '46%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 52,
    padding: 4,
    paddingRight: 8,
    borderRadius: 14,
    backgroundColor: '#252C20',
  },
  pulseShelf: {
    marginHorizontal: -14,
    marginTop: 10,
  },
  pulseShelfContent: {
    gap: 10,
    paddingHorizontal: 14,
  },
  pulseShelfItem: {
    width: 76,
  },
  pulseFooter: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 28,
  },
  pulseNew: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pulseNewDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  pulseNewText: {
    color: colors.lime,
    fontSize: 12,
    fontWeight: '800',
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
  pulseStack: {
    flexDirection: 'row',
  },
  pulseStackItem: {
    marginLeft: -14,
    borderWidth: 2,
    borderColor: colors.surface,
    borderRadius: 12,
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
  // ---- Profile ----
  pulseProfileCard: {
    alignItems: 'center',
    paddingTop: 6,
  },
  pulseCamBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    // A ring in the sheet's color, so the badge sits clear of the avatar.
    borderWidth: 4,
    borderColor: colors.background,
  },
  pulseNameInput: {
    alignSelf: 'stretch',
    marginTop: 18,
    marginHorizontal: 24,
    paddingTop: 6,
    paddingBottom: 8,
    borderBottomWidth: 2,
    borderBottomColor: '#30362A',
    color: colors.lime,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  // The listening name, in the accent color wherever it shows.
  pulseName: {
    color: colors.lime,
  },
  pulseNameInputFocus: {
    borderBottomColor: colors.lime,
  },
  pulseNameMeta: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    marginHorizontal: 24,
  },
  pulsePresetStrip: {
    gap: 12,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  pulseStripItem: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Only the chosen one gets a border; light mode would turn a transparent one grey.
  pulseStripItemOn: {
    borderWidth: 3,
    borderColor: colors.lime,
  },
  pulseCheck: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.background,
  },
  pulseLinkButton: {
    alignSelf: 'center',
    minHeight: 44,
    justifyContent: 'center',
    marginTop: 8,
  },
  pulseLinkText: {
    fontSize: 14,
    fontWeight: '700',
  },
  pulseNote: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
    marginTop: 4,
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
  homeFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginTop: 28,
    minHeight: 44,
  },
  homeFooterText: {
    color: colors.muted,
    fontSize: 12,
  },
  insightTrack: {
    paddingHorizontal: 24,
    gap: 12,
  },
  insightCard: {
    minHeight: 168,
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    padding: 16,
  },
  insightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  insightBig: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.8,
    lineHeight: 29,
  },
  insightGap: {
    marginBottom: 10,
  },
  insightDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
  },
  insightDot: {
    height: 6,
    borderRadius: 3,
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
  coverCollageNote: {
    color: colors.lime,
    fontWeight: '700',
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
  moreFeatureRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  moreFeature: {
    flex: 1,
    gap: 4,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    padding: 14,
  },
  moreFeatureIcon: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2B3821',
    borderRadius: 10,
  },
  moreRowIcon: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2B3821',
    borderRadius: 11,
  },
  moreRowCount: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '600',
    marginRight: 2,
  },
  moreTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  morePageHeader: {
    marginTop: 8,
    marginBottom: 12,
    gap: 8,
  },
  moreTile: {
    marginBottom: 18,
  },
  moreBanner: {
    alignItems: 'center',
    marginTop: 8,
  },
  moreWideBanner: {
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: 20,
    backgroundColor: '#252C20',
  },
  moreBannerBadge: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  moreActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  moreActionMain: {
    flex: 1,
    minHeight: 48,
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
  moreChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  moreNewTile: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#46513A',
    borderStyle: 'dashed',
    borderRadius: 12,
    backgroundColor: colors.surface,
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
    gap: 26,
    marginTop: 14,
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
  libraryMetaLeft: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
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
  /** Quick-return bar over the list: page background, so rows pass under it. */
  libraryTopBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 10,
    backgroundColor: colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  libraryTopBarText: {
    flex: 1,
    color: colors.muted,
    fontSize: 16,
  },
  libraryTopBarQuery: {
    color: colors.text,
  },
  libraryTopBarSort: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 24,
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
  libraryActionLabel: {
    color: colors.lime,
    fontSize: 16,
    fontWeight: '600',
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
  // Flips the order in one tap without opening the sheet.
  librarySortDirection: {
    minWidth: 48,
    height: 36,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    borderRadius: 11,
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
  libraryNowPlaying: {
    color: colors.lime,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
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
  playbackPause: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  playbackPauseBar: {
    borderRadius: 1,
  },
  playbackTriangle: {
    width: 0,
    height: 0,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
  },
  playbackSkip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
  },
  playbackSkipPrevious: {
    flexDirection: 'row-reverse',
  },
  playbackSkipBar: {
    borderRadius: 1,
  },
  settingsSectionLabel: {
    color: '#858D78',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginTop: 28,
    marginBottom: 9,
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
  prefRowError: {
    color: '#EAA38E',
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: 16,
    paddingBottom: 12,
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
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 8,
    marginLeft: -7,
  },
  prefSwatchButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    borderWidth: 2,
  },
  prefSwatch: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  // About: the app, its promises, and who made it.
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
  launchMotto: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  launchCreditRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  launchCreditText: {
    color: colors.muted,
    fontSize: 13,
  },
  settingsGroup: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  dropdownScrim: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.18)',
  },
  dropdownPanel: {
    position: 'absolute',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
  },
  accentOption: {
    width: '100%',
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 10,
    paddingHorizontal: 11,
  },
  themeError: {
    color: '#EAA38E',
    fontSize: 10,
    lineHeight: 15,
    paddingBottom: 10,
  },
  settingRow: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#292E23',
  },
  settingRowLast: {
    borderBottomWidth: 0,
  },
  settingRowPressed: {
    opacity: 0.7,
  },
  settingCopy: {
    flex: 1,
  },
  settingTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  settingSubtitle: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 15,
    marginTop: 3,
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
  bottomDockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
  },
  // Solid style: one opaque bar along the bottom edge, Android style. Colors
  // are theme tokens here (not in Glass.tsx), so every accent maps them.
  solidBar: {
    backgroundColor: '#171A14',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#2A3024',
    paddingHorizontal: 4,
    paddingTop: 8,
  },
  solidTabRow: {
    flexDirection: 'row',
    paddingBottom: 6,
  },
  solidItem: {
    flex: 1,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  solidIndicatorWrap: {
    width: 56,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  solidIndicator: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: '#2B3821',
    borderRadius: 15,
  },
  solidIcon: {
    color: '#858D78',
  },
  solidIconActive: {
    color: colors.lime,
  },
  solidLabel: {
    color: '#858D78',
    fontSize: 11,
    fontWeight: '500',
  },
  solidLabelActive: {
    color: colors.text,
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
} as const;

const lightThemeStyles = {
  muse: StyleSheet.create(createLightStyleDefinitions(styleDefinitions, 'muse')),
  ocean: StyleSheet.create(createLightStyleDefinitions(styleDefinitions, 'ocean')),
  sunset: StyleSheet.create(createLightStyleDefinitions(styleDefinitions, 'sunset')),
  rose: StyleSheet.create(createLightStyleDefinitions(styleDefinitions, 'rose')),
  coral: StyleSheet.create(createLightStyleDefinitions(styleDefinitions, 'coral')),
  teal: StyleSheet.create(createLightStyleDefinitions(styleDefinitions, 'teal')),
  red: StyleSheet.create(createLightStyleDefinitions(styleDefinitions, 'red')),
};

const darkThemeStyles = {
  muse: StyleSheet.create(createDarkStyleDefinitions(styleDefinitions, 'muse', false)),
  ocean: StyleSheet.create(createDarkStyleDefinitions(styleDefinitions, 'ocean', false)),
  sunset: StyleSheet.create(createDarkStyleDefinitions(styleDefinitions, 'sunset', false)),
  rose: StyleSheet.create(createDarkStyleDefinitions(styleDefinitions, 'rose', false)),
  coral: StyleSheet.create(createDarkStyleDefinitions(styleDefinitions, 'coral', false)),
  teal: StyleSheet.create(createDarkStyleDefinitions(styleDefinitions, 'teal', false)),
  red: StyleSheet.create(createDarkStyleDefinitions(styleDefinitions, 'red', false)),
};

const amoledThemeStyles = {
  muse: StyleSheet.create(createDarkStyleDefinitions(styleDefinitions, 'muse', true)),
  ocean: StyleSheet.create(createDarkStyleDefinitions(styleDefinitions, 'ocean', true)),
  sunset: StyleSheet.create(createDarkStyleDefinitions(styleDefinitions, 'sunset', true)),
  rose: StyleSheet.create(createDarkStyleDefinitions(styleDefinitions, 'rose', true)),
  coral: StyleSheet.create(createDarkStyleDefinitions(styleDefinitions, 'coral', true)),
  teal: StyleSheet.create(createDarkStyleDefinitions(styleDefinitions, 'teal', true)),
  red: StyleSheet.create(createDarkStyleDefinitions(styleDefinitions, 'red', true)),
};

export function useAppStyles() {
  const { theme, accent, isAmoled } = useContext(ThemeContext);
  if (theme === 'light') {
    return lightThemeStyles[accent];
  }
  return isAmoled ? amoledThemeStyles[accent] : darkThemeStyles[accent];
}

function createDarkStyleDefinitions<T extends Record<string, object>>(
  definitions: T,
  accentTheme: Accent,
  isAmoled: boolean,
): T {
  const accent = {
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
          if (styleName === 'primaryButton' && property === 'backgroundColor') {
            return [property, accent.action];
          }
          if (
            (styleName === 'primaryButtonLabel' || styleName === 'buttonArrow') &&
            property === 'color'
          ) {
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
    muse: {
      primary: '#739B42',
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
          if (styleName === 'primaryButton' && property === 'backgroundColor') {
            return [property, accent.action];
          }
          if (
            (styleName === 'primaryButtonLabel' || styleName === 'buttonArrow') &&
            property === 'color'
          ) {
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
