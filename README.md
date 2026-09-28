# Iwé, Vocabulary Buddy

A small offline-first vocabulary app: flashcards, a quiz mode, a daily
word, and a personal dictionary, with a friendly owl mascot whose mood
reflects your practice streak. "Iwé" is the Yoruba word for "book."

## How the offline/dictionary combination works
Iwé ships with 60 starter words (six categories, three difficulty
levels, including nine clearly tagged slang terms with derivations,
and six words shown with both British and American spellings).
These work fully offline from the moment you install it. Looking up
any other word needs an internet connection the first time; once looked up, that word is cached on your device and stays available offline forever after, whether or not you save it to My Words.

## Features
- Home: word of the day (deterministic per date), streak counter,
  quick stats (saved words, quiz accuracy, best streak).
- Cards: flip-to-reveal flashcards over your whole collection,
  marked "Got it" / "Still learning".
- Quiz: multiple-choice quiz (needs at least 4 saved words),
  8 questions per round, with a score summary.
- Dictionary: look up any word, and save it to My Words if you want
  to keep it.
- My Words: your full collection, searchable, filterable by
  category and difficulty, with favourites.
- Offline pronunciation via the browser's built-in text-to-speech. The UK/US switch in the header picks British or American
  English. Which voices exist depends on the device.
- Dictionary lookups show UK and US phonetics when the API provides them, and searching an American spelling (color) finds the British entry (colour).
- Word of the day and streak refresh on their own if the app stays open
  past midnight.
- A link at the bottom, opening a contact page with the developer's email and socials.


## Data
Everything is stored in that browser's `localStorage`. Your saved
words, favorites, progress, and streak are all local to one device,
with no account and no server.

