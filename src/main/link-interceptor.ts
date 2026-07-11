import { app } from 'electron';
import {
  BrowserProfileConfig,
  DomainProfileConfig,
  OpenInBrowserConfig,
} from '../shared/browser-routing';
import { openUrlInBrowser } from './open-in-browser';
import { Logger } from './utils/Logger';

interface NormalizedLinkInterceptorConfig extends OpenInBrowserConfig {
  interceptSystemLinks: boolean;
  registerAsDefaultBrowser: boolean;
  profiles: BrowserProfileConfig[];
  domainProfiles: DomainProfileConfig[];
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

  setConfig(config?: OpenInBrowserConfig) {
    this.config = LinkInterceptorController.normalizeConfig(config);
    this.configLoaded = true;
    this.updateDefaultProtocolClients();
    this.flushPendingTargets();
  }

  private static normalizeConfig(
    config: OpenInBrowserConfig = {},
  ): NormalizedLinkInterceptorConfig {
    return {
      interceptSystemLinks: config.interceptSystemLinks ?? false,
      registerAsDefaultBrowser: config.registerAsDefaultBrowser ?? false,
      defaultProfileId: config.defaultProfileId,
      profiles: config.profiles ?? [],
      domainProfiles: config.domainProfiles ?? [],
    };
  }

  private updateDefaultProtocolClients() {
    if (!app.isPackaged) {
      if (
        this.config.interceptSystemLinks &&
        this.config.registerAsDefaultBrowser
      ) {
        Logger.info('Skip default browser registration outside packaged app');
      }
      return;
    }

    const shouldRegister =
      this.config.interceptSystemLinks && this.config.registerAsDefaultBrowser;
    URL_PROTOCOLS.forEach((protocol) => {
      const ok = shouldRegister
        ? app.setAsDefaultProtocolClient(protocol)
        : app.removeAsDefaultProtocolClient(protocol);
      Logger.info(
        `${ok ? '' : 'Failed to '}${
          shouldRegister ? 'register' : 'unregister'
        } default ${protocol} handler`,
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

    if (!this.config.interceptSystemLinks) {
      Logger.info(`Link interceptor disabled, ignored ${input}`);
      return;
    }

    try {
      openUrlInBrowser(input, this.config, sourceName);
    } catch (error: any) {
      Logger.error(`${sourceName} route failed: ${error.message}`);
    }
  }
}
