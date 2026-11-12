# EvilLeoncraft 2
# Leoncraft 2 Cheat Utils Mod

Run `python main.py` and open `http://localhost:5000` to play the locally served game.

<<<<<<< HEAD
Version #0.0.1
    - Storage ESP (need to add item frames)
    - Player ESP
=======
The contents of the game's `public/leoncraft2` directory are at the repository root
(`index.html`, `js/`, `shaders/`, `sounds/`, and `textures/`). They were imported
from the authorized source repository at
[commit `11e4e7a`](https://github.com/leonzcode/portfolio/tree/11e4e7a/public/leoncraft2).
The Three.js dependency is in `js/three.module.js`.

The app serves the game directly at `/`; it does not use a `public/` or
`leoncraft2/` directory. The original game's separate multiplayer backend is
not included locally. HTTPS deployments use the official Leoncraft backend
(`apps.leonzhao.dev`) for authentication and multiplayer; localhost can still
use a backend configured with the `mp` query parameter.

The Evilleoncraft settings include an optional Auto Target module for offline
single-player worlds, with controls for mob types, target priority, aim, reach,
attack timing, and pause conditions. Player entities are always excluded, and
the module disables itself whenever a multiplayer connection is present.
>>>>>>> de715e4 (Initial commit)
