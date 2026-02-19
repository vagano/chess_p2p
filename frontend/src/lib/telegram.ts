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
  return !!wa && !!wa.initData && wa.initData.length > 0;
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
  return getWebApp()?.initDataUnsafe?.start_param ?? null;
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

export function showMainButton(text: string, onClick: () => void): void {
  const btn = getWebApp()?.MainButton;
  if (!btn) return;
  btn.setText(text);
  btn.onClick(onClick);
  btn.show();
}

export function hideMainButton(): void {
  getWebApp()?.MainButton?.hide();
}

// --- Back Button ---

export function showBackButton(onClick: () => void): void {
  const btn = getWebApp()?.BackButton;
  if (!btn) return;
  btn.onClick(onClick);
  btn.show();
}

export function hideBackButton(): void {
  getWebApp()?.BackButton?.hide();
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
 * Share a room invite link.
 * Strategy: switchInlineQuery → openTelegramLink/share → clipboard.
 */
export function shareRoom(roomId: string): void {
  const { tgBotUsername, tgAppName } = config;
  const wa = getWebApp();

  const inviteLink = (tgBotUsername && tgAppName)
    ? `https://t.me/${tgBotUsername}/${tgAppName}?startapp=${roomId}`
    : window.location.href;

  if (wa) {
    // Strategy 1: switchInlineQuery (WebApp 6.7+, doesn't close the app)
    if (typeof wa.switchInlineQuery === 'function' && tgBotUsername) {
      try {
        wa.switchInlineQuery(roomId, ['users', 'groups', 'channels']);
        return;
      } catch { /* fall through */ }
    }

    // Strategy 2: open Telegram share dialog (closes the Mini App)
    try {
      const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${encodeURIComponent('Join my chess game!')}`;
      wa.openTelegramLink(shareUrl);
      return;
    } catch { /* fall through */ }
  }

  // Strategy 3: clipboard (browser / fallback)
  navigator.clipboard.writeText(inviteLink)
    .then(() => alert('Link copied!'))
    .catch(() => prompt('Copy this link:', inviteLink));
}

// --- Theming ---

export function setHeaderColor(color: string): void {
  getWebApp()?.setHeaderColor(color);
}

export function setBackgroundColor(color: string): void {
  getWebApp()?.setBackgroundColor(color);
}
