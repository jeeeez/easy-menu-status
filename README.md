## Starting Development

Start the app in the `dev` environment:

```bash
npm start
```

## Settings UI

Open Quick Command and run `Settings` to edit `~/easy-tray.config.json`
without changing the file manually. The editor supports General, Quick
Command, Commands, Open in Browser, Web Search, Tray Menu, and Custom Themes
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
    "appSearch": {
      "enabled": true
    },
    "openInBrowser": {
      "interceptSystemLinks": true,
      "registerAsDefaultBrowser": true,
      "profiles": [
        {
          "id": "Profile-1",
          "name": "Work",
          "profileDirectory": "Profile 11",
          "path": "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
        },
        {
          "id": "Profile-2",
          "name": "Personal",
          "profileDirectory": "Default",
          "path": "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
        }
      ],
      "domainProfiles": [
        {
          "domains": ["ringcentral.com", "*.ringcentral.com"],
          "profileId": "Profile-1"
        },
        {
          "domains": ["google.com", "*.google.com"],
          "profileId": "Profile-2"
        }
      ],
      "defaultProfileId": "Profile-1"
    },
    "commands": [
      {
        "name": "rc",
        "label": "RingCentral",
        "icon": "ringcentral.svg",
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
        "action": "open-in-browser"
      },
      {
        "name": "fiji",
        "label": "Jira FIJI",
        "aliases": ["FIJI"],
        "description": "Jira",
        "action": "open-in-browser",
        "url": "https://jira.ringcentral.com/browse/{{query}}"
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
Command. Results show `name / label` as the primary text, `description` as the
supporting text below it, the configured `icon` at the left edge, and `action`
at the right edge. For `copy-value` and `execute-command`, `command` contains
the local shell command to run.

Custom icon files belong in EasyTray's persistent icon directory. On macOS the
fixed location is
`~/Library/Application Support/easy-menu-status/icons`. This directory is
outside the installed App bundle, so replacing or reinstalling the App does not
remove it. In Settings, an Icon field can import an image with the Finder
picker, the Paste Image button, `Command+V` in the drop zone, or a drag from
Finder or a webpage. Every imported image is decoded, resized when necessary,
converted to PNG, and saved in that directory; only the generated filename is
written to the configuration. Webpage URL imports accept public HTTPS images.
Imported images also appear in the Icon dropdown with thumbnails. The
`Manage Local…` action can delete any stored image without assigning it to the
current field; deletion preserves configuration references, which then display
the default icon.

A non-absolute `icon` such as `ringcentral.svg` is resolved from the persistent
directory first, then from the bundled `assets/icons` directory. Built-in names
include `cat`, `flame`, `snowflake`, and `figure.run.circle.fill`. Existing
absolute and `~/` paths remain supported for backward compatibility, but the
Settings import controls keep custom resources persistent and the JSON
configuration portable. Missing or invalid Quick Command icons fall back to an
action-specific symbol; the tray uses the bundled default icon.

On macOS, application search is enabled by default. EasyTray indexes apps in
`~/Applications`, `/Applications`, and `/System/Applications`, then mixes App
matches into Quick Command results. Select an App with the arrow keys and press
`Enter` to open it. Set `quickCommand.appSearch.enabled` to `false` to disable
App results.

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
- `open-in-browser`: open a URL with the browser profile selected by domain.
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

For `open-in-browser`, each entry in `openInBrowser.profiles` defines an
immutable `id`, a display `name`, the Chrome `profileDirectory`, and the browser
executable `path`. Only `profileDirectory` is passed to Chrome as
`--profile-directory`; `domainProfiles[].profileId` and `defaultProfileId`
reference the stable `id`, so renaming the display name does not break routing.
The Settings editor generates IDs as `Profile-1`, `Profile-2`, and so on.
`domainProfiles` selects a profile for exact domains or wildcards such as
`*.ringcentral.com`, and `defaultProfileId` handles everything else. Input URLs
without a protocol automatically get `https://` added. For example,
`chrome app.ringcentral.com` opens `https://app.ringcentral.com` with the
matching profile. You can also set `url` as a command template, for example
`fiji FIJI-103480` opens
`https://jira.ringcentral.com/browse/FIJI-103480` through the same profile
rules. Typing a URL directly into Quick Command and pressing `Enter` also runs
`open-in-browser`; an explicit command prefix still takes precedence.

## System Link Routing

System-level link interception only works when EasyTray is registered as the
default handler for `http` and `https`. In `quickCommand.openInBrowser`, enable
both `interceptSystemLinks` and `registerAsDefaultBrowser`, then package and
install the app. System links reuse the same `profiles`, `domainProfiles`, and
`defaultProfileId` configuration used by Quick Command.

```json
{
  "quickCommand": {
    "openInBrowser": {
      "interceptSystemLinks": true,
      "registerAsDefaultBrowser": true
    }
  }
}
```

When enabled, a system click on `app.ringcentral.com` is routed through EasyTray
and opened in Chrome with the matched profile. Links without a matched domain use
`defaultProfileId`. Development builds skip default-browser registration; use
the packaged app for real system link interception.

Local file targets are also supported when they reach EasyTray. For example,
`chrome /Users/me/Documents/report.html` and a macOS `open-file` event are
forwarded using the default browser profile. Registering EasyTray as the default
browser only covers `http` and `https`; macOS still chooses handlers for raw files
by file type, so it does not make EasyTray the default app for every file.

## Packaging for Production

To package apps for the local platform:

```bash
npm run package
```

To package app for Mac

```base
npm run package -- --mac
```
