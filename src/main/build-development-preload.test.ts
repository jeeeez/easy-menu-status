import { execFileSync } from 'child_process';
import { buildDevelopmentPreload } from '../../.erb/scripts/build-development-preload';

jest.mock('child_process', () => ({
  execFileSync: jest.fn(),
}));

describe('development preload startup', () => {
  it('builds preload synchronously before Electron starts', () => {
    buildDevelopmentPreload();

    expect(execFileSync).toHaveBeenCalledWith('npm', ['run', 'build:preload'], {
      stdio: 'inherit',
    });
  });
});
