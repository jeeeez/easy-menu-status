## Starting Development

Start the app in the `dev` environment:

```bash
npm start
```

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
    "commands": [
      {
        "name": "RingCentral",
        "command": "rc",
        "aliases": ["ringcentral"],
        "description": "Open",
        "action": "browser-window",
        "url": "https://app.ringcentral.com/",
        "size": "maximized"
      },
      {
        "name": "Work Email",
        "command": "email",
        "description": "Copy",
        "action": "copy-value",
        "value": "jeff.li@ringcentral.com"
      },
      {
        "name": "Open Config",
        "command": "config",
        "description": "Run",
        "action": "execute-command",
        "shellCommand": "open -a Cursor ~/easy-tray.config.json"
      },
      {
        "name": "Chrome Auto Profile",
        "command": "chrome",
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
        "name": "Jira FIJI",
        "command": "fiji",
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

Supported command actions:

- `web-search`: search with a configured URL.
- `browser-window`: open a URL inside EasyTray.
- `copy-value`: copy static or generated text to the clipboard.
- `execute-command`: run a local shell command.
- `open-chrome-profile`: open a URL with a Chrome profile selected by domain.
- `quit-app`: quit EasyTray.

When input matches a command by partial command text or alias, the first
`Enter` completes the canonical command prefix and the next `Enter` executes it.
Commands that require input only execute after a query is present. For example,
typing `FIJI-103480` with the `fiji` command selected first becomes
`fiji FIJI-103480`, then the next `Enter` opens the Jira URL.

Use `{{query}}` or `{{encodedQuery}}` for URL-encoded text, and `{{rawQuery}}`
for the unencoded input. For `copy-value`, `{{CommandValue}}` is the output of
`shellCommand`. Set `openIn` to `browser-window` on a `web-search` command to
open results inside EasyTray instead of the default browser.

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

## Packaging for Production

To package apps for the local platform:

```bash
npm run package
```

To package app for Mac

```base
npm run package -- --mac
```
