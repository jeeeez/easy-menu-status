import { app } from 'electron';
import {
  ChromeProfileRoutingConfig,
  openChromeProfileUrl,
} from './chrome-profile';
import { Logger } from './utils/Logger';

export interface LinkInterceptorConfig extends ChromeProfileRoutingConfig {
  enabled?: boolean;
  registerAsDefaultBrowser?: boolean;
}

interface NormalizedLinkInterceptorConfig extends ChromeProfileRoutingConfig {
  enabled: boolean;
  registerAsDefaultBrowser: boolean;
}

const URL_PROTOCOLS = ['http', 'https'];

export class LinkInterceptorController {
  // eslint-disable-next-line no-use-before-define
  private static $instance: LinkInterceptorController | null = null;
  static instance(): LinkInterceptorController {
    if (!LinkInterceptorController.$instance) {
      LinkInterceptorController.$instance = new LinkInterceptorController();
    }
    return LinkInterceptorController.$instance;
  }

  private config: NormalizedLinkInterceptorConfig =
    LinkInterceptorController.normalizeConfig();
  private configLoaded = false;
  private pendingUrls: string[] = [];

  private constructor() {
    app.on('open-url', (event, url) => {
      event.preventDefault();
      this.handleUrl(url);
    });
  }

  setConfig(config?: LinkInterceptorConfig) {
    this.config = LinkInterceptorController.normalizeConfig(config);
    this.configLoaded = true;
    this.updateDefaultProtocolClients();
    this.flushPendingUrls();
  }

  private static normalizeConfig(
    config: LinkInterceptorConfig = {},
  ): NormalizedLinkInterceptorConfig {
    return {
      enabled: config.enabled ?? false,
      registerAsDefaultBrowser: config.registerAsDefaultBrowser ?? false,
      chromePath: config.chromePath,
      defaultProfile: config.defaultProfile,
      profiles: config.profiles ?? [],
    };
  }

  private updateDefaultProtocolClients() {
    if (!this.config.enabled || !this.config.registerAsDefaultBrowser) {
      return;
    }

    if (!app.isPackaged) {
      Logger.info('Skip default browser registration outside packaged app');
      return;
    }

    URL_PROTOCOLS.forEach((protocol) => {
      const ok = app.setAsDefaultProtocolClient(protocol);
      Logger.info(
        ok
          ? `Registered as default ${protocol} handler`
          : `Failed to register default ${protocol} handler`,
      );
    });
  }

  private flushPendingUrls() {
    const pendingUrls = [...this.pendingUrls];
    this.pendingUrls = [];
    pendingUrls.forEach((url) => this.handleUrl(url));
  }

  private handleUrl(url: string) {
    if (!this.configLoaded) {
      this.pendingUrls.push(url);
      return;
    }

    if (!this.config.enabled) {
      Logger.info(`Link interceptor disabled, ignored ${url}`);
      return;
    }

    try {
      openChromeProfileUrl(url, this.config, 'System link');
    } catch (error: any) {
      Logger.error(`System link route failed: ${error.message}`);
    }
  }
}
