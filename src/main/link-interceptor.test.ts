const appOn = jest.fn();
const setAsDefaultProtocolClient = jest.fn(() => true);
const openChromeProfileUrl = jest.fn();
const loggerError = jest.fn();

jest.mock('electron', () => ({
  app: {
    isPackaged: true,
    on: appOn,
    setAsDefaultProtocolClient,
  },
}));

jest.mock('./chrome-profile', () => ({
  openChromeProfileUrl,
}));

jest.mock('./utils/Logger', () => ({
  Logger: {
    info: jest.fn(),
    error: loggerError,
  },
}));

describe('LinkInterceptorController', () => {
  beforeEach(() => {
    jest.resetModules();
    appOn.mockClear();
    setAsDefaultProtocolClient.mockClear();
    openChromeProfileUrl.mockReset();
    loggerError.mockReset();
  });

  function loadController() {
    // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires
    const { LinkInterceptorController } = require('./link-interceptor');
    const controller = LinkInterceptorController.instance();
    LinkInterceptorController.instance();

    return {
      controller,
      openFileListener: appOn.mock.calls.find(
        ([eventName]) => eventName === 'open-file',
      )?.[1],
      openUrlListener: appOn.mock.calls.find(
        ([eventName]) => eventName === 'open-url',
      )?.[1],
    };
  }

  it('queues an early macOS open-file event and routes it after config loads', () => {
    const { controller, openFileListener } = loadController();
    const event = { preventDefault: jest.fn() };

    expect(openFileListener).toBeDefined();
    openFileListener(event, '/Users/jeff.li/Documents/Release Notes.html');
    expect(openChromeProfileUrl).not.toHaveBeenCalled();

    controller.setConfig({
      enabled: true,
      defaultProfile: 'Profile 9',
    });

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(openChromeProfileUrl).toHaveBeenCalledWith(
      '/Users/jeff.li/Documents/Release Notes.html',
      expect.objectContaining({ defaultProfile: 'Profile 9' }),
      'System file',
    );
  });

  it('registers web protocols and routes open-url events', () => {
    const { controller, openUrlListener } = loadController();
    controller.setConfig({
      enabled: true,
      registerAsDefaultBrowser: true,
      defaultProfile: 'Profile 9',
    });

    expect(setAsDefaultProtocolClient.mock.calls).toEqual([
      ['http'],
      ['https'],
    ]);

    const event = { preventDefault: jest.fn() };
    openUrlListener(event, 'https://example.com/docs');
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(openChromeProfileUrl).toHaveBeenCalledWith(
      'https://example.com/docs',
      expect.objectContaining({ defaultProfile: 'Profile 9' }),
      'System link',
    );
  });

  it('ignores targets while interception is disabled', () => {
    const { controller, openUrlListener } = loadController();
    controller.setConfig({ enabled: false });

    openUrlListener({ preventDefault: jest.fn() }, 'https://example.com');
    expect(openChromeProfileUrl).not.toHaveBeenCalled();
  });

  it('logs routing errors without crashing the app', () => {
    const { controller, openUrlListener } = loadController();
    controller.setConfig({ enabled: true, defaultProfile: 'Profile 9' });
    openChromeProfileUrl.mockImplementation(() => {
      throw new Error('Invalid target');
    });

    expect(() =>
      openUrlListener({ preventDefault: jest.fn() }, 'https://example.com'),
    ).not.toThrow();
    expect(loggerError).toHaveBeenCalledWith(
      'System link route failed: Invalid target',
    );
  });
});
