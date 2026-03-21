# Pikagent

Application desktop de gestion d'espaces de travail terminaux, conçue pour superviser et piloter des agents IA (Claude, Codex, OpenCode) depuis une interface unifiée.

## Fonctionnalités

- **Multi-onglets** — Espaces de travail indépendants avec terminaux, explorateur de fichiers et visionneuse de code
- **Terminaux** — Sessions shell multiples avec panneaux redimensionnables, thèmes et liens cliquables (xterm.js)
- **Board d'agents** — Monitoring temps réel des agents IA : statut, durée, détection d'inactivité
- **Explorateur de fichiers** — Arborescence avec lazy loading, création/renommage/suppression, watch du système de fichiers
- **Visionneuse de code** — Coloration syntaxique (highlight.js), diff Git staged/unstaged
- **Flows d'automatisation** — Séquences de commandes planifiables (once, daily, weekly, monthly, intervalle)
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

## Packaging

```bash
# Application macOS (.app)
npm run package

# Installeur DMG
npm run package:dmg
```

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

Les données sont stockées dans `~/.config/.pickagent/` :
- `workspaces.json` — Configurations des espaces de travail
- `flows/` — Définitions et logs des flows
- `sessions.json` — Métriques des sessions
