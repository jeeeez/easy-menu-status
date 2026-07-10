## Starting Development

Start the app in the `dev` environment:

```bash
npm start
```

## Settings UI

Open Quick Command and run `settings` to edit `~/easy-tray.config.json`
without changing the file manually. The editor supports General, Quick
Command, Commands, Web Search, Link Routing, Tray Menu, and Custom Themes
settings. Use the Save button or `CommandOrControl+S` to apply changes
immediately.

Before each save, EasyTray copies the previous configuration to
`~/easy-tray.config.json.bak` and then replaces the active file atomically.
The settings editor writes standard JSON, so comments from the original file
are not retained after saving.

## Quick Command

Press `CommandOrControl+Shift+Space` to open the quick command window. By
default, any text searches Google. You can also prefix input with a configured
command, for example:

```text
g electron globalShortcut
```

Add `quickCommand` to `~/easy-tray.config.json` to customize the shortcut,
default command, web search engines, and Alfred-style commands:

```json
{
  "quickCommand": {
    "shortcut": "CommandOrControl+Shift+Space",
    "defaultCommand": "g",
    "theme": "alfred-classic",
    "commands": [
      {
        "name": "rc",
        "label": "RingCentral",
        "aliases": ["ringcentral"],
        "description": "Open",
        "action": "browser-window",
        "url": "https://app.ringcentral.com/",
        "size": "maximized"
      },
      {
        "name": "email",
        "label": "Work Email",
        "description": "Copy",
        "action": "copy-value",
        "value": "jeff.li@ringcentral.com"
      },
      {
        "name": "OKta Code",
        "label": "{{CommandValue}}",
        "aliases": ["otp", "totp", "code"],
        "description": "Copy",
        "action": "copy-value",
        "command": "~/Tools/totp/bin/totp-darwin-amd64 rc",
        "value": "{{CommandValue}}",
        "requiresInput": false,
        "autoUpdateInterval": 10000
      },
      {
        "name": "config",
        "label": "Open Config",
        "description": "Run",
        "action": "execute-command",
        "command": "open -a Cursor ~/easy-tray.config.json"
      },
      {
        "name": "chrome",
        "label": "Chrome Auto Profile",
        "aliases": ["c"],
        "description": "Chrome",
        "action": "open-chrome-profile",
        "defaultProfile": "Profile 11",
        "profiles": [
          {
            "domains": ["ringcentral.com", "*.ringcentral.com"],
            "profile": "Profile 11"
          },
          {
            "domains": ["google.com", "*.google.com"],
            "profile": "Default"
          }
        ]
      },
      {
        "name": "fiji",
        "label": "Jira FIJI",
        "aliases": ["FIJI"],
        "description": "Jira",
        "action": "open-chrome-profile",
        "url": "https://jira.ringcentral.com/browse/{{query}}",
        "defaultProfile": "Profile 11",
        "profiles": [
          {
            "domains": ["jira.ringcentral.com"],
            "profile": "Profile 11"
          }
        ]
      }
    ],
    "webSearch": {
      "defaultEngine": "g",
      "engines": [
        {
          "name": "Google",
          "command": "g",
          "aliases": ["google", "web"],
          "url": "https://www.google.com/search?q={{query}}",
          "openIn": "external"
        },
        {
          "name": "DuckDuckGo",
          "command": "d",
          "aliases": ["duck"],
          "url": "https://duckduckgo.com/?q={{query}}",
          "openIn": "external"
        }
      ]
    }
  }
}
```

Within `quickCommand.commands`, `name` is the canonical text entered in Quick
Command, `label` is the primary result text, `description` is supporting text
shown below the label, and `action` is shown at the right edge. For
`copy-value` and `execute-command`, `command` contains the local shell command
to run.

### Quick Command Themes

Set `quickCommand.theme` to any built-in theme:

- `alfred-classic`: charcoal surfaces, warm input, and orange accents.
- `macos-glass`: translucent light glass with macOS blue accents.
- `spotlight-light`: opaque, bright Spotlight-style presentation.
- `minimal-mono`: high-contrast monochrome with restrained geometry.
- `neo-brutalism`: bold outlines, hard shadows, and vivid color blocks.
- `fluent-mica`: soft Mica-like layers and Fluent blue accents.
- `material-expressive`: warm surfaces, teal accents, and stronger motion.
- `terminal`: compact monospace styling with green terminal highlights.
- `catppuccin`: Catppuccin Mocha-inspired pastel dark palette.
- `nord`: cool, low-saturation Nord palette.
- `dracula`: dark Dracula-inspired palette with pink and cyan accents.

Unknown theme names fall back to `alfred-classic`. To create a custom theme,
add it to `quickCommand.themes`, inherit from a built-in preset, then select its
name:

```json
{
  "quickCommand": {
    "theme": "work",
    "themes": {
      "work": {
        "extends": "nord",
        "tokens": {
          "color.panel": "rgba(35, 40, 49, 0.96)",
          "color.input": "#303846",
          "color.accent": "#5bc0be",
          "color.itemActive": "#3f4a5a",
          "radius.panel": 10,
          "radius.item": 6,
          "density.itemHeight": 50,
          "effect.blur": 28,
          "motion.duration": 140
        }
      }
    }
  }
}
```

Supported custom token groups:

- `color.*`: `panel`, `panelRaised`, `input`, `inputFocus`, `inputText`,
  `text`, `muted`, `border`, `accent`, `accentStrong`, `danger`, `item`,
  `itemHover`, `itemActive`, `itemActiveText`, `tag`, `tagText`, `tagActive`,
  `tagActiveText`, `placeholder`, `selection`, `icon`, and `iconGlyph`.
- `radius.*`: `panel`, `input`, `item`, `tag`, and `icon`.
- `border.*`: `panelWidth`, `inputWidth`, and `itemWidth`.
- `density.*`: `itemHeight`, `inputMinHeight`, and `pagePadding`.
- `typography.*`: `fontFamily`, `inputSize`, `inputWeight`, and `itemSize`.
- `effect.*`: `blur`, `saturation`, `panelShadow`, `inputShadow`, and
  `activeShadow`.
- `motion.duration`: transition duration for interactive states.

Numeric dimensions are interpreted as pixels, while numeric
`motion.duration` values are interpreted as milliseconds. Unsupported tokens
and unsafe CSS values are ignored.

During development, built-in themes can be previewed without invoking an
action at `http://localhost:1212/?page=quick-command&theme=nord`. Replace
`nord` with any built-in theme ID.

Supported command actions:

- `web-search`: search with a configured URL.
- `browser-window`: open a URL inside EasyTray.
- `copy-value`: copy static or generated text to the clipboard.
- `execute-command`: run a local shell command.
- `open-chrome-profile`: open a URL with a Chrome profile selected by domain.
- `open-settings`: open the EasyTray settings editor.
- `quit-app`: quit EasyTray.

When input matches a command by partial command text or alias, the first
`Enter` completes the canonical command prefix and the next `Enter` executes it.
Commands that require input only execute after a query is present. For example,
typing `FIJI-103480` with the `fiji` command selected first becomes
`fiji FIJI-103480`, then the next `Enter` opens the Jira URL.

Use `{{query}}` or `{{encodedQuery}}` for URL-encoded text, and `{{rawQuery}}`
for the unencoded input. For `copy-value`, `{{CommandValue}}` is the output of
`command`; it can be used in `label` and `value`. When `label` contains
`{{CommandValue}}`, the displayed value refreshes every 10 seconds by default;
set `autoUpdateInterval` in milliseconds to customize it, or `0` to disable
periodic display refresh. Set `openIn` to `browser-window` on a `web-search`
command to open results inside EasyTray instead of the default browser.

For `open-chrome-profile`, input URLs without a protocol automatically get
`https://` added. For example, `chrome app.ringcentral.com` opens
`https://app.ringcentral.com` with the matching profile. Use `chromePath` only
if Chrome is installed somewhere other than
`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`.
You can also set `url` as a template, for example `fiji FIJI-103480` opens
`https://jira.ringcentral.com/browse/FIJI-103480` and still routes through the
Chrome profile rules.

## Link Interceptor

System-level link interception only works when EasyTray is registered as the
default handler for `http` and `https`. Add `linkInterceptor` to
`~/easy-tray.config.json`, package/install the app, then enable
`registerAsDefaultBrowser`:

```json
{
  "linkInterceptor": {
    "enabled": true,
    "registerAsDefaultBrowser": true,
    "defaultProfile": "Profile 11",
    "profiles": [
      {
        "domains": ["ringcentral.com", "*.ringcentral.com"],
        "profile": "Profile 9"
      },
      {
        "domains": ["rclabenv.com", "*.rclabenv.com"],
        "profile": "Profile 11"
      }
    ]
  }
}
```

When enabled, a system click on `app.ringcentral.com` is routed through EasyTray
and opened in Chrome with the matched profile. Links without a matched domain use
`defaultProfile`. Development builds skip default-browser registration; use the
packaged app for real system link interception.

Local file targets are also supported when they reach EasyTray. For example,
`chrome /Users/me/Documents/report.html` and a macOS `open-file` event are
forwarded to Chrome with `defaultProfile`. Registering EasyTray as the default
browser only covers `http` and `https`; macOS still chooses handlers for raw
files by file type, so it does not make EasyTray the default app for every file.

## Packaging for Production

To package apps for the local platform:

```bash
npm run package
```

To package app for Mac

```base
npm run package -- --mac
```
