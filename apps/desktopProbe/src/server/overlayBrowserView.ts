import { OverlayBrowserViewResult } from '@/lib/types';
import { WebPageRuntimeData } from '@first2apply/core';
import { BrowserWindow, WebContentsView } from 'electron';

import { consumeRuntimeData } from './browserHelpers';
import { logger } from './logger';

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * Class used to render a WebContentsView on top of the main window
 * to be used as a browser window. The UI (back/forward buttons, URL bar, etc)
 * should be implemented in React.
 */
export class OverlayBrowserView {
  private _mainWindow?: BrowserWindow;
  private _searchView?: WebContentsView;
  private _resizeListener?: () => void;

  /**
   * Set the parent main window.
   */
  setMainWindow(mainWindow: BrowserWindow) {
    this._mainWindow = mainWindow;
  }

  /**
   * Open the browser view.
   */
  open(url: string) {
    if (!this._mainWindow) {
      throw new Error('Main window is not set');
    }
    if (this._searchView) {
      throw new Error('Search view is already open');
    }

    this._searchView = new WebContentsView({
      webPreferences: {
        // the partition here is shared with the main window, so that cookies and local storage are shared
        partition: 'persist:scraper',
      },
    });

    // set the bounds of the view to be the same as the main window
    this._updateSearchViewBounds();

    // Add resize listener
    this._resizeListener = this._updateSearchViewBounds.bind(this);
    this._mainWindow.on('resize', this._resizeListener);

    // Listen for navigation events and send the new URL to the renderer
    const sendUrlUpdate = (newUrl: string) => {
      this._mainWindow?.webContents.send('browser-view-url-changed', newUrl);
    };
    this._searchView.webContents.on('did-navigate', (_event, url) => {
      logger.info('[OverlayBrowserView] did-navigate', { url });
      sendUrlUpdate(url);
    });
    this._searchView.webContents.on('did-navigate-in-page', (_event, url) => {
      logger.info('[OverlayBrowserView] did-navigate-in-page', { url });
      sendUrlUpdate(url);
    });
    this._searchView.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
      logger.error('[OverlayBrowserView] did-fail-load', { errorCode, errorDescription, validatedURL });
    });
    this._searchView.webContents.on('did-finish-load', () => {
      logger.info('[OverlayBrowserView] did-finish-load', { url: this._searchView?.webContents.getURL() });
    });
    this._searchView.webContents.on('render-process-gone', (_event, details) => {
      logger.error('[OverlayBrowserView] render-process-gone', { reason: details.reason });
    });

    this._mainWindow.contentView.addChildView(this._searchView);

    this.navigate(url);
  }

  /**
   * Navigate to a URL.
   */
  navigate(url: string) {
    if (!this._searchView) {
      throw new Error('Search view is not ready');
    }

    // if the url contains spaces, replace them go a google search
    if (url.split(' ').length > 1) {
      url = 'https://www.google.com/search?q=' + encodeURIComponent(url);
    }
    // make sure the string starts with http or https
    else if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    this._searchView.webContents.loadURL(url);
  }

  /**
   * Go back in the browser view history.
   */
  canGoBack(): boolean {
    if (!this._searchView) {
      return false;
    }

    return this._searchView.webContents.navigationHistory.canGoBack();
  }
  goBack() {
    if (!this._searchView) {
      throw new Error('Search view is not ready');
    }

    if (this._searchView.webContents.navigationHistory.canGoBack()) {
      this._searchView.webContents.navigationHistory.goBack();
    }
  }

  /**
   * Go forward in the browser view history.
   */
  canGoForward(): boolean {
    if (!this._searchView) {
      return false;
    }

    return this._searchView.webContents.navigationHistory.canGoForward();
  }
  goForward() {
    if (!this._searchView) {
      throw new Error('Search view is not ready');
    }

    if (this._searchView.webContents.navigationHistory.canGoForward()) {
      this._searchView.webContents.navigationHistory.goForward();
    }
  }

  /**
   * Update the search view bounds to match the main window
   */
  private _updateSearchViewBounds() {
    if (this._mainWindow && this._searchView) {
      const contentBounds = this._mainWindow.getContentBounds();
      // Start 50px from the top, maintain the width, and adjust the height accordingly
      this._searchView.setBounds({
        x: 0, // Start at left edge of content area
        y: 50, // 50px from top of content area
        width: contentBounds.width,
        height: contentBounds.height - 50,
      });
    }
  }

  /**
   * Get the html content, title, and URL of the current page and close the modal.
   */
  async finish(): Promise<OverlayBrowserViewResult> {
    logger.info('[OverlayBrowserView.finish] called');
    if (!this._searchView) {
      logger.error('[OverlayBrowserView.finish] _searchView is undefined');
      throw new Error('Search view is not set');
    }

    const wc = this._searchView.webContents;
    const preUrl = wc.getURL();
    logger.info('[OverlayBrowserView.finish] webContents state', {
      url: preUrl,
      isLoading: wc.isLoading(),
      isCrashed: wc.isCrashed(),
      isDestroyed: wc.isDestroyed(),
      isWaitingForResponse: wc.isWaitingForResponse(),
    });

    logger.info('[OverlayBrowserView.finish] executing outerHTML...');
    const html = await withTimeout(
      wc.executeJavaScript('document.documentElement.outerHTML'),
      10_000,
      'executeJavaScript(outerHTML)',
    );
    logger.info('[OverlayBrowserView.finish] outerHTML returned', { length: html?.length ?? 0 });

    logger.info('[OverlayBrowserView.finish] executing document.title...');
    const title = await withTimeout(
      wc.executeJavaScript('document.title'),
      5_000,
      'executeJavaScript(title)',
    );
    logger.info('[OverlayBrowserView.finish] title returned', { title });

    const url = wc.getURL();
    logger.info('[OverlayBrowserView.finish] final getURL', { url });

    // Read runtime data captured by the protocol handler (stored in main-process memory)
    const webPageRuntimeData: WebPageRuntimeData = consumeRuntimeData(url);

    this.close();
    logger.info('[OverlayBrowserView.finish] returning result');

    return {
      url,
      title,
      html,
      webPageRuntimeData,
    };
  }

  /**
   * Close the job board modal.
   * This is used when the user cancels the modal.
   */
  close() {
    // Remove the resize listener
    if (this._resizeListener && this._mainWindow) {
      this._mainWindow.removeListener('resize', this._resizeListener);
      this._resizeListener = undefined;
    }

    if (this._searchView) {
      this._mainWindow.contentView.removeChildView(this._searchView);
      this._searchView.webContents.close();
      this._searchView = undefined;
    }
  }
}
