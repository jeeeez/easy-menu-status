const { app, Menu, Tray, nativeImage } = require('electron');
const { execSync } = require('node:child_process');

let count = 0;

let tray: Tray | null = null;
app.whenReady().then(() => {
  tray = new Tray(nativeImage.createEmpty());

  tray.setTitle(`Code`);
  tray.setToolTip('This is my application.');

  updateCode();

  tray.on('click', () => {
    updateCode();
  });

  function updateCode(copy = false) {
    try {
      tray.setTitle(`Code ${++count}`);
      const code = execSync('~/Tools/totp/bin/totp-darwin-amd64 rc')
        .toString()
        .trim();
      tray.setContextMenu(
        Menu.buildFromTemplate([
          {
            label: `Okta: ${code}`,
            type: 'normal',
            click: () => updateCode(true),
          },
        ]),
      );
      if (copy) {
        pbcopy(code);
      }
      return code;
    } catch (error) {
      console.warn(error);
    }
  }
});

function pbcopy(data) {
  const proc = require('child_process').spawn('pbcopy');
  proc.stdin.write(data);
  proc.stdin.end();
}
