/**
 * Telegram WebApp SDK wrapper.
 * Provides type-safe access to Telegram Mini App APIs with
 * graceful fallback when running outside Telegram (browser dev mode).
 */

import { config } from './config';

interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
}

interface TelegramThemeParams {
  bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
  secondary_bg_color?: string;
}

interface TelegramWebApp {
  initData: string;
  initDataUnsafe: {
    user?: TelegramUser;
    start_param?: string;
    auth_date?: number;
    hash?: string;
  };
  version: string;
  platform: string;
  colorScheme: 'light' | 'dark';
  themeParams: TelegramThemeParams;
  isExpanded: boolean;
  viewportHeight: number;
  viewportStableHeight: number;
  ready: () => void;
  expand: () => void;
  close: () => void;
  MainButton: {
    text: string;
    color: string;
    textColor: string;
    isVisible: boolean;
    isActive: boolean;
    show: () => void;
    hide: () => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
    setText: (text: string) => void;
    enable: () => void;
    disable: () => void;
  };
  BackButton: {
    isVisible: boolean;
    show: () => void;
    hide: () => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
  };
  HapticFeedback: {
    impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
    notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
    selectionChanged: () => void;
  };
  openTelegramLink: (url: string) => void;
  openLink: (url: string, options?: { try_instant_view?: boolean }) => void;
  switchInlineQuery: (query: string, chatTypes?: string[]) => void;
  sendData: (data: string) => void;
  setBackgroundColor: (color: string) => void;
  setHeaderColor: (color: string) => void;
  showPopup: (params: { title?: string; message: string; buttons?: Array<{ id?: string; type?: string; text?: string }> }, callback?: (id: string) => void) => void;
  showAlert: (message: string, callback?: () => void) => void;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}

function getWebApp(): TelegramWebApp | null {
  return window.Telegram?.WebApp ?? null;
}

/** Whether the app is running inside Telegram WebView */
export function isTelegram(): boolean {
  const wa = getWebApp();
  const result = !!wa && !!wa.initData && wa.initData.length > 0;
  console.log('[Telegram] isTelegram:', result, 'initData length:', wa?.initData?.length ?? 0);
  return result;
}

/** Raw initData string for server-side validation */
export function getInitData(): string {
  return getWebApp()?.initData ?? '';
}

/** Telegram user info (null outside Telegram) */
export function getTelegramUser(): TelegramUser | null {
  return getWebApp()?.initDataUnsafe?.user ?? null;
}

/** The startapp parameter from the deep link */
export function getStartParam(): string | null {
  const param = getWebApp()?.initDataUnsafe?.start_param ?? null;
  console.log('[Telegram] getStartParam:', param, 'initDataUnsafe:', JSON.stringify(getWebApp()?.initDataUnsafe));
  return param;
}

/** Current color scheme */
export function getColorScheme(): 'light' | 'dark' {
  return getWebApp()?.colorScheme ?? 'light';
}

/** Theme params from Telegram */
export function getThemeParams(): TelegramThemeParams {
  return getWebApp()?.themeParams ?? {};
}

/** Signal Telegram that the Mini App is ready to be displayed */
export function ready(): void {
  const wa = getWebApp();
  if (wa) {
    wa.ready();
    wa.expand();
  }
}

// --- Haptic feedback ---

export function hapticImpact(style: 'light' | 'medium' | 'heavy' = 'light'): void {
  getWebApp()?.HapticFeedback?.impactOccurred(style);
}

export function hapticNotification(type: 'success' | 'error' | 'warning'): void {
  getWebApp()?.HapticFeedback?.notificationOccurred(type);
}

export function hapticSelection(): void {
  getWebApp()?.HapticFeedback?.selectionChanged();
}

// --- Main Button ---

let _mainBtnHandler: (() => void) | null = null;

export function showMainButton(text: string, onClick: () => void): void {
  const btn = getWebApp()?.MainButton;
  if (!btn) return;
  if (_mainBtnHandler) btn.offClick(_mainBtnHandler);
  _mainBtnHandler = onClick;
  btn.setText(text);
  btn.onClick(onClick);
  btn.show();
}

export function hideMainButton(): void {
  const btn = getWebApp()?.MainButton;
  if (!btn) return;
  if (_mainBtnHandler) btn.offClick(_mainBtnHandler);
  _mainBtnHandler = null;
  btn.hide();
}

// --- Back Button ---

let _backBtnHandler: (() => void) | null = null;

export function showBackButton(onClick: () => void): void {
  const btn = getWebApp()?.BackButton;
  if (!btn) return;
  if (_backBtnHandler) btn.offClick(_backBtnHandler);
  _backBtnHandler = onClick;
  btn.onClick(onClick);
  btn.show();
}

export function hideBackButton(): void {
  const btn = getWebApp()?.BackButton;
  if (!btn) return;
  if (_backBtnHandler) btn.offClick(_backBtnHandler);
  _backBtnHandler = null;
  btn.hide();
}

// --- Navigation / Sharing ---

export function openTelegramLink(url: string): void {
  const wa = getWebApp();
  if (wa) {
    wa.openTelegramLink(url);
  } else {
    window.open(url, '_blank');
  }
}

export function switchInlineQuery(query: string): void {
  getWebApp()?.switchInlineQuery(query, ['users', 'groups', 'channels']);
}

/**
 * Build the correct invite link depending on context.
 * Telegram users get t.me deep link, browser users get the web URL.
 */
function buildInviteLink(roomId: string, forTelegram: boolean): string {
  const { tgBotUsername, tgAppName } = config;
  if (forTelegram && tgBotUsername && tgAppName) {
    return `https://t.me/${tgBotUsername}/${tgAppName}?startapp=${roomId}`;
  }
  const origin = window.location.origin;
  return `${origin}/room/${roomId}`;
}

/**
 * Share a room invite link.
 * In Telegram: copies t.me deep link to clipboard (navigator.share causes WebView reload).
 * In browser: native share or clipboard.
 */
export async function shareRoom(roomId: string): Promise<void> {
  const wa = getWebApp();
  const inTelegram = !!wa;
  const link = buildInviteLink(roomId, inTelegram);

  console.log('[shareRoom] inTelegram:', inTelegram, 'link:', link);

  if (inTelegram && wa) {
    // In TMA: show alert with link (clipboard may not work in WebView)
    wa.showAlert(link);
    return;
  }

  // Browser: try native share, then clipboard
  if (navigator.share) {
    try {
      await navigator.share({ url: link });
      return;
    } catch { /* cancelled */ }
  }

  try {
    await navigator.clipboard.writeText(link);
    alert('Link copied!');
  } catch {
    prompt('Copy this link:', link);
  }
}

// --- Theming ---

export function setHeaderColor(color: string): void {
  getWebApp()?.setHeaderColor(color);
}

export function setBackgroundColor(color: string): void {
  getWebApp()?.setBackgroundColor(color);
}
