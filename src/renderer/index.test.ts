/** @jest-environment jsdom */

const render = jest.fn();

jest.mock('react-dom/client', () => ({
  createRoot: jest.fn(() => ({ render })),
}));

jest.mock('./App', () => ({
  __esModule: true,
  default: () => null,
}));

describe('renderer entry', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    delete (window as unknown as { electron?: Window['electron'] }).electron;
    render.mockClear();
  });

  it('loads outside Electron without requiring the preload bridge', () => {
    expect(() => {
      jest.isolateModules(() => {
        // eslint-disable-next-line global-require
        require('./index');
      });
    }).not.toThrow();

    expect(render).toHaveBeenCalledTimes(1);
  });
});
