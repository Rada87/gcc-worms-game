# GCC Worms

**GCC Game Competition 2026.**

Hra ve stylu Worms. Dva a více týmů se střídá
na jednom zařízení, kolo za kolem se snaží sejmout soupeře.

Postaveno v TypeScriptu nad [pixi.js](https://pixijs.com/) (rendering) a [Rapier](https://rapier.rs/) (fyzika).

---

## ▶️ Zahrát si hned (online)

**[🎮 Hrát v prohlížeči → rada87.github.io/gcc-worms-game](https://rada87.github.io/gcc-worms-game/)**

Nic se neinstaluje — stačí otevřít odkaz v aktuálním Chrome nebo Firefoxu.
Verze na webu se automaticky aktualizuje při každém pushi do `main`.

> Chceš ji raději spustit lokálně? Pokračuj návodem níže.

---

## 🚀 Jak hru stáhnout a spustit

> Spuštění zabere ~2 minuty.

### Požadavky

- **[Node.js 22](https://nodejs.org/)** (verze je zapsaná v `.node-version`)
- **[Yarn 1.x](https://classic.yarnpkg.com/)** (`npm install -g yarn`)

### Postup

```sh
# 1. Naklonuj repozitář
git clone https://github.com/Rada87/gcc-worms-game.git
cd gcc-worms-game

# 2. Nainstaluj závislosti
yarn install

# 3. Spusť hru
yarn dev
```

Po spuštění Vite vypíše do terminálu adresu (obvykle
**http://localhost:5173**) — otevři ji v prohlížeči a hra naběhne.

To je vše — **žádná konfigurace ani `.env` není potřeba**. Hra je plně lokální.

> 💡 Doporučený prohlížeč: aktuální Chrome nebo Firefox.
> ⚠️ Hru je nutné spustit přes server (`yarn dev`). Otevření souboru
> `dist/index.html` přímo v prohlížeči (`file://`) nefunguje z důvodu bezpečnostních politik většiny prohlížečů.

### Produkční build (volitelné)

```sh
yarn build     # sestaví hru do složky dist/
yarn preview   # naservíruje sestavenou hru lokálně
```

---

## 🎮 Jak hrát

- Hra je **lokální a tahová**: týmy se střídají na jednom zařízení.
- Cílem je pomocí zbraní a terénu sejmout všechny červíky soupeře.
- Výsledky se ukládají do lokálního žebříčku.

---

## 📜 Licence a atribuce

Hra je postavena na enginu
**[wormgine](https://github.com/Half-Shot/wormgine)** od Half-Shot, který je
šířen pod licencí **GNU AGPL-3.0**. Proto je i tento projekt — včetně soutěžní
nadstavby (menu, žebříček, výsledky, správa týmů a ladění hratelnosti) — vydán
pod **[GNU AGPL-3.0](./LICENSE)**.

Herní assety (grafika, zvuky) jsou použity podle svých licencí — viz upstream
[ASSETS.md](https://github.com/Half-Shot/wormgine/blob/main/src/assets/ASSETS.md).

---

## 🛠️ Vývoj

```sh
yarn lint        # ESLint + Prettier
yarn test        # Jest testy
yarn assets      # regenerace manifestu assetů (po přidání nového assetu)
```

Stručný přehled architektury (entity systém, terén, fyzika, menu) najdeš
v [`docs/`](./docs).

---

_Vytvořeno pro GCC Vibe Coding Competition 2026._
