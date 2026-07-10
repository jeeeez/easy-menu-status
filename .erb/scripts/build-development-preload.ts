import { execFileSync } from 'child_process';

export function buildDevelopmentPreload() {
  execFileSync('npm', ['run', 'build:preload'], { stdio: 'inherit' });
}
