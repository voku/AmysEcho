# Symbols and other assets

Card NG-15. Which pictures the app ships, under which licence, and how a family gets the symbols a
child already knows (for example METACOM) onto the board.

## Decision (owner, 2026-11-23)

**No third-party symbol set is bundled.** The app ships only its own drawings, under the MIT
licence of this repository. Symbols a child knows from kindergarten or home, above all METACOM,
reach a board only as **pictures a caregiver imports on the device**, from material the family or
the institution is licensed to use (card NG-8673323346005092805).

Why:

- **METACOM** (© Annette Kitzinger) is sold as a licence to use. Its terms
  ([Nutzungsbedingungen](https://metacom-symbole.de/webextra/Nutzungsbedingungen.pdf), checked
  2026-11-23) allow copying, editing, passing on and publishing only as far as they expressly
  say. This repository and the app hosted from it are public, so bundling METACOM would publish the
  symbols. A family with a personal licence, or a kindergarten or school with a Pro licence, may
  use the symbols for their own child; whether a given use is covered is for the licensee to check
  against the current terms, not for this app to decide. Bundling would need written permission
  from the rights holder; none has been asked for.
- **ARASAAC** is CC BY-NC-SA: the non-commercial and share-alike terms do not fit the MIT licence
  of the code, and its pictures are not the ones German kindergartens mostly use.
- The placeholders of the five example concepts stay until the real concept set is chosen (card
  NG-7); then own drawings or imported pictures replace them.

## Bundled assets

Every file in `public/icons/` has an entry in `public/icons/licences.json` with what it shows,
its source and its licence. `test/assets.test.mjs` fails when a file has no entry, when an entry
names a file that does not exist, or when an entry lacks a source or licence. A new bundled
picture therefore needs a licence record in the same change. Only licences that allow
redistribution in a public MIT repository may be added without an owner decision on the card.

| Files | Source | Licence |
| --- | --- | --- |
| `public/icons/*.svg` | Drawn by hand for this repository | MIT ([LICENSE](../LICENSE)) |

## Pictures a caregiver imports

Rules for pictures that do not come with the app (the import itself is card
NG-8673323346005092805):

- They stay on the device, in the profile of the child they were chosen for. The app sends
  nothing. They leave the device only in a backup the family makes itself.
- They never enter this repository, a test fixture, an issue, CI or a log. Public fixtures are
  synthetic.
- The family or institution is responsible for having the right to use them (for example a
  METACOM licence). The caregiver area says so where a picture is chosen.
- A concept stays usable without its picture: the board falls back to the app's picture or to
  text.
- A photo of a child or of anything that identifies a child is personal data of that child, with
  the same retention and deletion rules as the rest of the profile (card NG-7).
