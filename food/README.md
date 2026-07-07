# Field Notes: Food

A food-review map at [maleenkidiwela.github.io/food](https://maleenkidiwela.github.io/food/).

## How it works

Everything is driven by **`restaurants.csv`** in this folder — that file *is* the
spreadsheet. Edit it (in Excel, Numbers, VS Code, or the GitHub web editor),
commit, push. The existing `deploy-pages.yml` workflow publishes the site on
every push, and `validate-food-csv.yml` fails the push's CI if a row is
malformed (bad score, swapped coordinates, duplicate name), so a typo can't
silently break the map.

## Columns

| column | meaning |
|---|---|
| `name` | Restaurant name (must be unique) |
| `cuisine` | Short label, e.g. "Ramen", "Thai" |
| `address` | Street address (shown in popup) |
| `lat`, `lng` | Decimal coordinates (used to place the marker) |
| `ambience` | 0–10 — how cool it looks |
| `can_i_eat` | 0–10 — beef/pork-allergy friendliness |
| `service` | 0–10 |
| `taste` | 0–10 |
| `would_return` | 0–10 |
| `notes` | Free-text review, shown in the marker popup (quote if it contains commas) |

Leave any score blank for places not yet rated — they show up gray as
"unrated" and sink to the bottom of the ranking. **Overall** is the mean of
whichever scores are filled in.

## Adding a new place

Add a row with at least `name`, `lat`, `lng`. Quick way to get coordinates:
right-click the spot in Google Maps → the first menu item is `lat, lng`.
