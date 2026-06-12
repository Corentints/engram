# Rapport de comparaison : Vercel `skills` vs `engram`

> Analyse comparative entre [Vercel `skills`](https://github.com/vercel-labs/skills) (l'écosystème open agent skills de Vercel) et **engram**, notre gestionnaire de skills IA adossé à git.
>
> Date : 2026-06-12

---

## 1. Résumé exécutif

Vercel `skills` et engram répondent au **même problème** : installer, partager et versionner des « skills » (dossiers d'instructions + ressources chargés par un agent IA) à travers plusieurs projets, équipes et outils IA. Les deux s'appuient sur le **standard ouvert open agent skills** (`SKILL.md` + frontmatter) et distribuent les skills depuis des **dépôts git**.

Ce sont donc des **concurrents directs**. Vercel `skills` est nettement plus mature (22k+ étoiles, 70+ agents supportés, registre `skills.sh`, lockfile, télémétrie), tandis qu'engram est un projet jeune (v0.1.0) au périmètre plus resserré mais avec une base technique différente (Effect-TS) et quelques choix d'architecture propres (notion explicite de *registry* nommé, manifeste `engram.json`).

**Verdict synthétique :** engram couvre déjà le cœur fonctionnel (add/install/sync/list/search/remove) avec une UX soignée, mais accuse un retard sur trois axes structurants face à Vercel : (1) le **modèle de stockage** (engram copie, Vercel utilise des symlinks vers un store canonique), (2) le **lockfile / vérification d'intégrité** (Vercel pin par hash, engram ne pin pas), et (3) l'**étendue du support d'agents** (2 vs 70+).

---

## 2. Présentation des deux systèmes

### Vercel `skills`
- CLI distribuée via `npx skills`, écrite en **TypeScript**, licence MIT.
- Commandes : `add`, `use`, `list/ls`, `find`, `remove/rm`, `update`, `check`, `init`.
- Sources : raccourci GitHub (`owner/repo`), URL GitHub/GitLab, URL git SSH, chemins locaux, chemins imbriqués (`.../tree/main/skills/web-design`).
- Découverte centralisée via **[skills.sh](https://skills.sh)** (annuaire + leaderboard).
- Installation par **symlink** (par défaut, store canonique) ou **copie** (`--copy`).
- **Lockfile** `skills-lock.json` (projet) et `~/.agents/.skill-lock.json` (global) avec hash d'intégrité (`skillFolderHash` / `computedHash`).
- **70+ agents** supportés (Claude Code, Cursor, Copilot, Cline, Windsurf, Codex, Gemini CLI, Goose…).

### engram (notre système)
- CLI Node/TypeScript exécutée via `tsx`, packagée pour `npx engram`, bâtie sur **Effect-TS** (`@effect/cli`, `@effect/platform`).
- Commandes : `registry add/list/remove`, `add` (raccourci), `install`, `sync`, `list`, `remove`, `search`.
- Concept central de **registry nommé** : on enregistre d'abord un dépôt git (`engram registry add`), puis on installe via une référence `registry/skill`.
- Config globale : `~/.config/engram/config.json` (liste des registries).
- Manifeste projet : `engram.json` (skills déclarés + providers + branche).
- Installation par **copie** (`copyDir`), via **sparse-checkout** git (`--filter=blob:none --depth=1`).
- **2 providers** supportés : `claude` et `copilot`.

---

## 3. Tableau comparatif synthétique

| Axe | Vercel `skills` | engram |
|---|---|---|
| **Maturité** | v1.x, 22k★, large adoption | v0.1.0, jeune |
| **Stack** | TypeScript « classique » | TypeScript + **Effect-TS** |
| **Standard de skill** | `SKILL.md` + frontmatter YAML | `<skill>.md` (open agent skills spec) |
| **Modèle de source** | URL/raccourci git, local, npm-like, chemins imbriqués | **Registry nommé** (git) enregistré au préalable |
| **Découverte** | Registre central **skills.sh** + `find` | `search` local sur les registries configurés (clone + `ls-tree`) |
| **Stockage** | **Symlink** vers store canonique (ou copie) | **Copie** uniquement |
| **Manifeste projet** | `skills-lock.json` (avec hash) | `engram.json` (sans hash) |
| **Lockfile / intégrité** | ✅ hash + `skills check`/`update` | ❌ pas de pinning, `sync` reprend le dernier commit |
| **Versioning** | hash + détection de mises à jour via API Vercel | branche uniquement (`--branch`), pas de SHA pin |
| **Scopes** | projet (défaut) / global (`-g`) | projet / global (défaut **global**) |
| **Agents/providers** | **70+** | **2** (claude, copilot) |
| **Récupération git** | clone + symlink/copie | **sparse-checkout** (efficace en bande passante) |
| **UX interactive** | prompts, sélection multi-agents | prompts `@clack` (multiselect, groupes) |
| **Télémétrie** | ✅ (désactivable) | ❌ |
| **Licence** | MIT | (à définir) |

---

## 4. Comparaison détaillée par axe

### 4.1 Format de skill & standard
**Identiques sur le fond.** Les deux suivent le standard open agent skills : un dossier contenant un fichier markdown avec frontmatter YAML (`name`, `description`). engram extrait d'ailleurs la description en parsant le frontmatter puis la première ligne non-titre (`extractFirstLine` dans `search.ts`/`list.ts`), ce qui est cohérent avec le format `SKILL.md` de Vercel.

- **Nuance :** Vercel impose la convention de nom `SKILL.md` et gère des métadonnées additionnelles (`metadata.internal` pour masquer un skill de la découverte). engram cherche un `<nom-du-skill>.md` à l'intérieur du dossier — convention différente, légèrement moins standard.
- **Opportunité engram :** s'aligner explicitement sur `SKILL.md` améliorerait l'interopérabilité avec l'écosystème skills.sh (un skill publié pour Vercel serait directement installable par engram).

### 4.2 Sources & modèle de registry
C'est la **divergence conceptuelle majeure**.

- **Vercel** : pas de notion de registry à pré-enregistrer. On pointe directement une source à chaque commande (`npx skills add vercel-labs/agent-skills`). La centralisation se fait côté serveur via skills.sh.
- **engram** : modèle « package manager » plus classique — on **déclare des registries nommés** une fois (`engram registry add myorg git@…`), puis on référence `myorg/skill`. Le manifeste `engram.json` stocke ces références courtes.

**Analyse :** l'approche engram est plus proche d'un `npm`/`cargo` (registries + noms courts, reproductibilité d'équipe via `engram.json` + `sync`). C'est un **vrai point fort** pour les usages d'équipe/monorepo. L'approche Vercel est plus « zéro-config » et bénéficie d'un annuaire central que nous n'avons pas.

### 4.3 Installation & stockage
- **engram** copie physiquement les fichiers du skill dans chaque répertoire provider (`~/.claude/skills/<skill>`, `.claude/skills/<skill>`, etc.) via `copyDir`. Conséquence : **duplication** si un skill est installé pour plusieurs providers, et pas de source unique de vérité.
- **Vercel** télécharge une **copie canonique** unique (`~/.agents/skills/`) puis crée des **symlinks** depuis chaque répertoire d'agent. Avantage : une seule mise à jour propage à tous les agents ; `--copy` reste disponible quand les symlinks ne sont pas supportés (Windows restreint, certains FS).

**Retard engram :** le modèle copie-partout complique les mises à jour et gonfle l'empreinte disque. Adopter un store canonique + symlinks (avec fallback copie) serait un alignement à fort impact.

**Point fort engram :** le **sparse-checkout** (`--filter=blob:none --no-checkout --depth=1` puis `sparse-checkout set`) est élégant et économe — on ne télécharge que le sous-arbre du skill, pas tout le dépôt. C'est plus fin que beaucoup d'approches « clone complet ».

### 4.4 Manifeste, lockfile & intégrité
- **engram** : `engram.json` liste les skills d'un projet avec `providers` et `branch` optionnels. **Pas de SHA figé** : `sync` réinstalle « toujours le dernier commit » (cf. README). Reproductible au niveau *branche*, **pas au niveau commit**.
- **Vercel** : `skills-lock.json` enregistre `version`, `source`, `sourceType`, et un **hash de contenu** (`skillFolderHash`/`computedHash`). `skills check`/`update` comparent ce hash à l'upstream via une API.

**Retard engram (important) :** sans hash ni SHA verrouillé, deux `sync` à des moments différents peuvent produire des skills différents — problème de **reproductibilité et de supply-chain**. Le `resolveRemoteSha` existe déjà dans `git.ts` (on résout bien un SHA à l'install !) : il suffirait de **persister ce SHA dans `engram.json`** pour obtenir un vrai lockfile, à moindre coût.

### 4.5 Support des agents / providers
- **Vercel : 70+ agents**, avec une table de compatibilité de chemins projet/global par agent.
- **engram : 2 providers** (`claude` → `.claude/skills`, `copilot` → `.agents/skills` global / `.github/skills` projet). L'architecture est cependant **extensible proprement** : `ProviderDef` + `REGISTRY` dans `providers/index.ts` rend l'ajout d'un provider trivial (quelques lignes, cf. `claude.ts`/`copilot.ts`).

**Retard quantitatif** mais dette faible : ajouter Cursor, Cline, Windsurf, etc. ne demande que de nouvelles `ProviderDef`.

### 4.6 Découverte / search
- **Vercel** : `find` + annuaire web skills.sh (recherche, leaderboard, descriptions).
- **engram** : `search` clone chaque registry configuré (`--filter=blob:none --depth=1`), liste l'arbre (`ls-tree`), détecte les dossiers feuilles comme skills et lit la première ligne du `.md` comme description. Fonctionnel et offline-friendly, mais **pas de découverte cross-registry centralisée** ni de signal social (popularité, etc.).

### 4.7 Versioning & mises à jour
- **Vercel** : `update`/`check` basés sur hash + API. Détection non-destructive des mises à jour disponibles.
- **engram** : pas de commande `update` dédiée ; `sync` réinstalle. Pas de diff « qu'est-ce qui a changé ». Pinning limité à la branche.

### 4.8 Stack technique
- **Vercel** : TypeScript classique, orienté DX/CLI, télémétrie.
- **engram** : **Effect-TS** de bout en bout (`Effect.gen`, gestion d'erreurs typées via `EngramError`, `@effect/platform` pour FS/Command). Plus rigoureux sur la gestion d'erreurs et la composition, au prix d'une courbe d'apprentissage.
- **Observation sur les dépendances :** `package.json` déclare des libs lourdes **non utilisées actuellement** dans `src/` (`@effect/cluster`, `@effect/sql`, `@effect/workflow`, `@effect/rpc`, `@effect/experimental`, `ioredis`, `lmdb`). Cela suggère une **ambition serveur/registre distribué/cache** non encore concrétisée. À nettoyer si hors-scope court terme (poids d'install `npx`, surface de maintenance), ou à assumer comme feuille de route (un éventuel **service de registre type skills.sh**).

---

## 5. Forces & faiblesses d'engram (synthèse)

### Points forts
1. **Modèle de registry nommé + manifeste `engram.json` + `sync`** : excellente reproductibilité d'équipe, proche d'un vrai gestionnaire de paquets.
2. **Sparse-checkout git** : récupération économe en bande passante.
3. **Architecture provider extensible** (`ProviderDef`) : ajout d'agents trivial.
4. **Effect-TS** : erreurs typées, composition robuste, bonne testabilité (suite de tests présente).
5. **UX interactive soignée** (`@clack/prompts`, sélection groupée des skills).
6. **Aucune télémétrie** : argument confidentialité.

### Faiblesses / dettes vs Vercel
1. **Pas de lockfile à hash/SHA** → reproductibilité incomplète (alors que le SHA est déjà résolu à l'install : quick win).
2. **Stockage par copie** au lieu d'un store canonique + symlinks → duplication, mises à jour lourdes.
3. **2 providers** vs 70+.
4. **Pas de découverte centralisée** (équivalent skills.sh).
5. **Convention `<nom>.md`** au lieu de `SKILL.md` → interop moindre.
6. **Pas de commande `update`/`check`** non-destructive.
7. **Dépendances lourdes inutilisées** dans le `package.json`.

---

## 6. Recommandations / opportunités

Par ordre rapport impact/effort :

| Priorité | Action | Pourquoi | Statut |
|---|---|---|---|
| 🟢 Quick win | **Persister le SHA résolu dans `engram.json`** (déjà calculé par `resolveRemoteSha`) | Vrai lockfile, reproductibilité au commit | ✅ **Fait** — champ `sha`, `sync` réinstalle le commit pinné (fetch-par-SHA) |
| 🟠 Structurant | **Store canonique + symlinks** (fallback copie) | Source unique de vérité, mises à jour atomiques | ✅ **Fait** — store `~/.local/share/engram/store/`, symlinks + fallback copie |
| 🟢 Quick win | **Élaguer les dépendances inutilisées** | Poids `npx`, surface de maintenance | ✅ **Fait** — 7 deps retirées (`cluster`, `experimental`, `rpc`, `sql`, `workflow`, `ioredis`, `lmdb`) ; imports `@effect/platform-node` par sous-chemin pour éviter le barrel cluster |
| 🟢 Quick win | **Aligner sur `SKILL.md`** (accepter `SKILL.md` en plus de `<nom>.md`) | Interop directe avec l'écosystème skills.sh | À faire |
| 🟡 Moyen | **Ajouter des providers** (Cursor, Cline, Windsurf, Gemini CLI…) | Combler l'écart d'adoption, coût faible grâce à `ProviderDef` | À faire |
| 🟡 Moyen | **Commande `update`/`check`** comparant SHA/hash local vs upstream | Mises à jour non-destructives | À faire |
| 🔵 Stratégique | **Découverte centralisée** (indexer plusieurs registries, voire un service) | Réponse à skills.sh | À faire |

> Note : `@effect/printer`, `@effect/printer-ansi` et `@effect/typeclass` sont **conservés** — ce sont des peer-deps réellement requises par `@effect/cli` pour le rendu de l'aide (et non du code mort).

### Positionnement différenciant suggéré
engram peut se distinguer **non pas en imitant skills.sh**, mais en assumant un angle « **package manager rigoureux, privacy-first, orienté équipe/monorepo** » : registries privés first-class, lockfile à hash, zéro télémétrie, reproductibilité stricte via `engram.json` + `sync`. C'est précisément le terrain où le modèle de registry nommé et Effect-TS donnent un avantage, là où Vercel optimise pour le « zéro-config + annuaire public ».

---

## 7. Sources

- [vercel-labs/skills (GitHub)](https://github.com/vercel-labs/skills)
- [vercel-labs/agent-skills (GitHub)](https://github.com/vercel-labs/agent-skills)
- [Vercel Docs — Agent Skills](https://vercel.com/docs/agent-resources/skills)
- [Vercel Changelog — Introducing skills](https://vercel.com/changelog/introducing-skills-the-open-agent-skills-ecosystem)
- [Vercel Blog — Agent skills explained: an FAQ](https://vercel.com/blog/agent-skills-explained-an-faq)
- [Issue #283 — `skills install`/`sync` depuis lockfile](https://github.com/vercel-labs/skills/issues/283)
- [Issue #977 — `skills remove` & `skills-lock.json`](https://github.com/vercel-labs/skills/issues/977)
- [Thilo Maier — A lockfile for agent skills](https://maier.tech/notes/a-lockfile-for-agent-skills)
- [InfoQ — Vercel Introduces Skills.sh](https://www.infoq.com/news/2026/02/vercel-agent-skills/)
- Code source engram analysé : `src/main.ts`, `src/git.ts`, `src/config.ts`, `src/manifest.ts`, `src/providers/*`, `src/commands/*`, `package.json`, `README.md`
