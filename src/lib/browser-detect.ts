/**
 * In-app browser detection utility
 *
 * Detects if the user is accessing the app from an in-app browser
 * (LINE WORKS, LINE, Facebook, Instagram, etc.) which have
 * storage partitioning and popup blocking issues that break Firebase auth.
 */

export interface BrowserInfo {
  isInAppBrowser: boolean;
  browserName: string | null;
  canUsePopup: boolean;
}

/**
 * Detects if the current browser is an in-app browser
 */
export function detectInAppBrowser(): BrowserInfo {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { isInAppBrowser: false, browserName: null, canUsePopup: true };
  }

  const ua = navigator.userAgent || navigator.vendor || '';

  // LINE WORKS in-app browser
  if (/LINEWORKS/i.test(ua) || /LINE WORKS/i.test(ua) || /LWGB/i.test(ua)) {
    return { isInAppBrowser: true, browserName: 'LINE WORKS', canUsePopup: false };
  }

  // LINE in-app browser
  if (/Line\//i.test(ua)) {
    return { isInAppBrowser: true, browserName: 'LINE', canUsePopup: false };
  }

  // Facebook in-app browser
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) {
    return { isInAppBrowser: true, browserName: 'Facebook', canUsePopup: false };
  }

  // Instagram in-app browser
  if (/Instagram/i.test(ua)) {
    return { isInAppBrowser: true, browserName: 'Instagram', canUsePopup: false };
  }

  // Twitter/X in-app browser
  if (/Twitter/i.test(ua)) {
    return { isInAppBrowser: true, browserName: 'Twitter', canUsePopup: false };
  }

  // WeChat in-app browser
  if (/MicroMessenger/i.test(ua)) {
    return { isInAppBrowser: true, browserName: 'WeChat', canUsePopup: false };
  }

  // Slack in-app browser
  if (/Slack/i.test(ua)) {
    return { isInAppBrowser: true, browserName: 'Slack', canUsePopup: false };
  }

  // Generic WebView detection for Android
  if (/wv\)/.test(ua) && /Android/i.test(ua)) {
    return { isInAppBrowser: true, browserName: 'WebView', canUsePopup: false };
  }

  // iOS WebView detection (WKWebView doesn't have Safari in UA when embedded)
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isSafari = /Safari/i.test(ua);
  const isChrome = /CriOS/i.test(ua);
  const isFirefox = /FxiOS/i.test(ua);

  if (isIOS && !isSafari && !isChrome && !isFirefox) {
    // iOS WebView (no Safari, Chrome, or Firefox identifier)
    return { isInAppBrowser: true, browserName: 'アプリ内ブラウザ', canUsePopup: false };
  }

  return { isInAppBrowser: false, browserName: null, canUsePopup: true };
}

/**
 * Returns the current URL for copying or sharing
 */
export function getCurrentUrl(): string {
  if (typeof window === 'undefined') {
    return '';
  }
  return window.location.href;
}

/**
 * Copies text to clipboard
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.clipboard) {
    // Fallback for older browsers
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      return true;
    } catch {
      return false;
    }
  }

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
