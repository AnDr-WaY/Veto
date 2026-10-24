# Veto brand assets (chapter 2)

Programmatically generated monochrome "V" marks. Regenerate with
`python3 gen_veto_assets.py` (kept in the chapter workspace, pure stdlib).

| File | Size | Description |
| --- | --- | --- |
| `icon.png` | 1024x1024 | App icon: `#0A0A0A` background, `#FFFFFF` V (full-bleed) |
| `adaptive-icon.png` | 1024x1024 | Android adaptive foreground: same colors, V inside the launcher safe zone (~70%) |
| `splash.png` | 2048x2048 | Splash: `#0A0A0A` background, centered `#FFFFFF` V |

## Wiring (for app.config.ts — chapter 1 owns the file)

```ts
export default {
  // ...
  icon: './assets/icon.png',
  splash: {
    image: './assets/splash.png',
    backgroundColor: '#0A0A0A', // keep in sync with the brand ink
    resizeMode: 'contain',
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#0A0A0A',
    },
  },
};
```

Both backgrounds must stay `#0A0A0A` (`tokens.colors.ink`) — the assets
already carry that background, so the config value is a fallback that must
match, never contrast.
