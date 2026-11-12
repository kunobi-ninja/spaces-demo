# Spaces demo

Examples of what you can make in a Kunobi space: plans, tools and games for everyday life and for work. Open `index.mdx` for the gallery.

## Open it in Kunobi

In a Kunobi build with Git import (local, dev or unstable), add a space with **From a Git URL…** and paste this repository's URL. Kunobi clones it into your spaces folder and opens the gallery.

## Make one yours

Each example keeps its data in its own folder. Change it on the page, or ask your AI to, and everyone with the space sees the change. Each page shows two prompts to start with.

| Example | Folder | Saved on the page | Data files |
| --- | --- | --- | --- |
| Finding a home, together | `home-hunt/` | Each person's take on a home | `data/homes.json`, `data/people.json` |
| A weekend in Lisbon | `trip/` | What is booked | `data/places.json` |
| A 40th birthday party | `event/` | Replies and seating | `data/event.json` |
| Shared house costs | `expenses/` | Expenses and payments | `data/group.json` |
| Dinners this week | `meals/` | The week and the shopping list | `data/recipes.json` |
| Sol Bakery team space | `team/` | The task board | `data/team.json`, `wiki/` |
| Monthly report | `monthly-report/` | | `data/report.json` |
| Hiring, side by side | `hiring/` | Stages and quick verdicts | `data/hiring.json` |
| Content calendar | `content-calendar/` | Post dates and status | `data/calendar.json` |
| Dino Snack | `dino-snack/` | | `KID` at the top of `index.mdx` |
| Quiz Night | `quiz-night/` | Team scores | `data/quiz.json` |
| A birthday film | `birthday-film.mdx/` | | `data/film.json` |
| Seed pitch | `pitch-deck.mdx/` | | `data/deck.json` and the slide text in `full.mdx` |
| Felipe, in 3D | `scan-viewer/` | | `data/scene.json` |
| Music Jam | `music-jam/` | The pattern, one track per person | `data/pattern.start.json` |
| Flat tour | `flat-tour/` | Pins and their comments | `data/flat.json`, `data/pins.start.json` |
| Cat chase | `cat-chase/` | Nothing: the game lives in a room while someone has it open | |

What a page saves lives in a LiveStore, defined in `.kunobi/stores/<name>/store.json`. A new copy of the space starts each store from its starting data: the `*.start.json` file beside it, or `data/week.json` and `data/shopping.json` for meals. Kunobi keeps a readable JSON copy of each store next to the example, so you and your AI can still read it as a file. Ask your AI to change a store's data and it edits the store, not the copy.

LiveStores need a Kunobi build with live editing, and live editing turned on for the space. Elsewhere the pages show their starting data and cannot be changed. The people, numbers and places are made up.

## Credits

Felipe is "[ChatGPT dots - Felipe](https://superspl.at/scene/ca6a4c9b)" by abstrakt, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); see `scan-viewer/CREDITS.md` for the changes made. Maps use © OpenStreetMap contributors.
