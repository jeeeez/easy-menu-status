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

interface PendingTarget {
  input: string;
  sourceName: string;
}

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
  private pendingTargets: PendingTarget[] = [];

  private constructor() {
    app.on('open-url', (event, url) => {
      event.preventDefault();
      this.handleTarget(url, 'System link');
    });
    app.on('open-file', (event, filePath) => {
      event.preventDefault();
      this.handleTarget(filePath, 'System file');
    });
  }

  setConfig(config?: LinkInterceptorConfig) {
    this.config = LinkInterceptorController.normalizeConfig(config);
    this.configLoaded = true;
    this.updateDefaultProtocolClients();
    this.flushPendingTargets();
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

  private flushPendingTargets() {
    const pendingTargets = [...this.pendingTargets];
    this.pendingTargets = [];
    pendingTargets.forEach(({ input, sourceName }) =>
      this.handleTarget(input, sourceName),
    );
  }

  private handleTarget(input: string, sourceName: string) {
    if (!this.configLoaded) {
      this.pendingTargets.push({ input, sourceName });
      return;
    }

    if (!this.config.enabled) {
      Logger.info(`Link interceptor disabled, ignored ${input}`);
      return;
    }

    try {
      openChromeProfileUrl(input, this.config, sourceName);
    } catch (error: any) {
      Logger.error(`${sourceName} route failed: ${error.message}`);
    }
  }
}
