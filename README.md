# Pikagent

Application desktop de gestion d'espaces de travail terminaux, conçue pour superviser et piloter des agents IA (Claude, Codex, OpenCode) depuis une interface unifiée.

## Fonctionnalités

- **Multi-onglets** — Espaces de travail indépendants avec terminaux, explorateur de fichiers et visionneuse de code
- **Terminaux** — Sessions shell multiples avec panneaux redimensionnables, thèmes et liens cliquables (xterm.js)
- **Board d'agents** — Monitoring temps réel des agents IA : statut, durée, détection d'inactivité
- **Explorateur de fichiers** — Arborescence avec lazy loading, création/renommage/suppression, watch du système de fichiers
- **Visionneuse de code** — Coloration syntaxique (highlight.js), diff Git staged/unstaged
- **Flows d'automatisation** — Prompts agent planifiables ou déclenchés par hooks/events
- **Métriques** — Suivi des sessions agents, tokens consommés et exécutions de flows
- **Raccourcis clavier** — Navigation rapide entre onglets et actions courantes

## Stack technique

| Couche | Technologies |
|--------|-------------|
| Desktop | Electron |
| Terminal | xterm.js, node-pty |
| Build | esbuild |
| Packaging | electron-builder |

## Installation

```bash
npm install
```

## Utilisation

```bash
# Développement (watch + Electron)
npm run dev

# Build + lancement
npm start

# Build seul
npm run build
```

## Hooks de flows

Les flows en mode `Hook` peuvent être déclenchés depuis un watcher, un hook Codex/Claude ou un script local :

```bash
npm run hook -- emit file.changed --provider watcher --cwd "$PWD" --path src/renderer.js --dry-run
pickagent-hook run flow_abc123
```

La commande lit les flows dans `~/.config/.pickagent/flows/`, matche `event`, `provider`, `cwd` et `paths`, applique le debounce du flow, puis écrit les runs/logs dans la même UI Flow.

## Packaging

```bash
# Application de la plateforme courante (macOS ici, Windows sur Windows)
npm run package

# Installeur DMG + ZIP d'update macOS
npm run package:dmg

# Installeur NSIS + ZIP Windows
npm run package:win
```

## Releases et mises à jour

Les mises à jour de l'application packagée passent par GitHub Releases via
`electron-updater`. Un tag `v*` déclenche le workflow `.github/workflows/release.yml`,
qui exécute les tests puis publie les artefacts macOS et Windows requis :

- `Pickagent-*.dmg`
- `Pickagent-*-mac.zip`
- `latest-mac.yml`
- `Pickagent Setup *.exe`
- `Pickagent-*-win.zip`
- `latest.yml`

```bash
git tag v1.0.1
git push origin v1.0.1
```

Pour une distribution macOS propre, configure les secrets GitHub
`CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` et
`APPLE_TEAM_ID` afin que le workflow puisse signer et préparer la notarisation
des artefacts.

Les artefacts Windows x64 sont construits par `npm run release:win` sur
`windows-2022`. Sans certificat de signature Windows, l'installateur peut
afficher un avertissement SmartScreen même si le build est valide.

## Structure du projet

```
├── main.js              # Process principal Electron
├── preload.js           # Bridge IPC sécurisé
├── src/
│   ├── index.html
│   ├── renderer.js      # Point d'entrée renderer
│   ├── components/      # Composants UI (14 modules)
│   ├── styles/          # Feuilles de style (13 fichiers)
│   └── utils/           # Utilitaires (events, icons, themes)
├── main/                # Modules du process principal
│   ├── pty-manager.js   # Gestion des PTY
│   ├── fs-manager.js    # Opérations fichiers
│   ├── git-manager.js   # Commandes Git
│   ├── flow-manager.js  # Planification des flows
│   └── ...
└── dist/                # Bundle généré
```

## Configuration

Les données sont stockées dans `~/.config/.pickagent/` (sur Windows :
`%USERPROFILE%\.config\.pickagent`) :
- `workspaces.json` — Configurations des espaces de travail
- `flows/` — Définitions et logs des flows
- `hook-state.json` — État de debounce des triggers hook
- `sessions.json` — Métriques des sessions
