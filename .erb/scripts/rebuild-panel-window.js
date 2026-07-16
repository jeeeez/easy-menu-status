const path = require('path');
const { execFileSync } = require('child_process');

const ARCH_NAMES = {
  0: 'ia32',
  1: 'x64',
  2: 'armv7l',
  3: 'arm64',
  4: 'universal',
};

module.exports = async ({ arch, electronPlatformName }) => {
  if (electronPlatformName !== 'darwin') {
    return;
  }

  const projectRoot = path.resolve(__dirname, '../..');
  const targetArch = ARCH_NAMES[arch];
  if (!targetArch || targetArch === 'universal') {
    throw new Error(`Unsupported panel-window architecture: ${arch}`);
  }

  const electronVersion = require(
    path.join(projectRoot, 'node_modules/electron/package.json'),
  ).version;
  execFileSync(
    process.execPath,
    [path.join(__dirname, 'patch-panel-window.js')],
    {
      cwd: projectRoot,
      stdio: 'inherit',
    },
  );
  execFileSync(
    process.execPath,
    [
      path.join(projectRoot, 'node_modules/node-gyp/bin/node-gyp.js'),
      'rebuild',
      '--directory=release/app/node_modules/@akiflow/electron-panel-window',
      `--target=${electronVersion}`,
      `--arch=${targetArch}`,
      '--dist-url=https://electronjs.org/headers',
    ],
    { cwd: projectRoot, stdio: 'inherit' },
  );
};
