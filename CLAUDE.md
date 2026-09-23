# Ethan's Personal Blog

A static blog: hand-written HTML files, no build step, no framework. `assets/site.js`
rebuilds each page into an app shell at runtime (topbar, post tree, tag list).

## Git

- **Commit directly to `main` and push.** No feature branch, no PR unless asked.
- Commit as the repo owner. **Do not add Claude attribution** — no `Co-Authored-By`,
  no session trailer, and the author is `Aditya Suresh <ethanaditya@gmail.com>`.
- `git push -u origin main`; retry only on network errors.

## Adding a post

1. Create `posts/<name>.html`. Posts are **flat in `posts/`** — don't nest them in
   subdirectories (`tools/new-post.js` writes to `posts/<dir>/`, which doesn't match
   the existing layout).
2. Run `node tools/generate-manifest.js` — this regenerates `posts/index.json`, which
   drives the post list, tree and tags. It is generated; never hand-edit it.
3. Commit both the post and the regenerated `index.json`.

### Post file shape

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Post Title</title>
  <meta name="title" content="Post Title" />
  <meta name="date" content="YYYY-MM-DD" />
  <meta name="tags" content="tag1,tag2" />
  <link rel="stylesheet" href="../assets/styles.css" />
  <script defer src="../assets/site.js" ></script>
</head>
<body>
  <article id="post-article" class="article">
    <div id="post-meta"></div>
    <p>…</p>
  </article>
</body>
</html>
```

- `<meta name="title">` and `<meta name="date">` are what the manifest reads — without
  them a post falls to the bottom of the list with its filename as the title.
- **Daily notes** are named `YYYY-MM-DD.html`, use the date as the title, and carry an
  explicit `<h1>` (see `tools/new-daily.js`). Tag them `daily` plus topic tags.
- **Titled posts** omit the `<h1>`; `site.js` injects one from `<meta name="title">`.
- Images live in `media/`, referenced as `../media/<file>`. `.article img` is capped at
  100% width; constrain individual figures inline if a scan renders too large.

## Writing conventions

- Posts are Ethan's own words. When he supplies text, **fix clear typos and leave
  everything else alone** — wording, sentence fragments, informal voice, and any
  deliberate repetition. Don't smooth out prose or invent journal text in his voice.
- Much of the blog is drafted first in the separate **`asuradev99/Thoughts`** Obsidian
  vault (`Ponderings/`, `Free Will/`, `Daily/`, `Dreams/`). Published posts are usually
  near-verbatim copies of a note there. Check it before writing anything new.

## Front-end gotchas

- `assets/styles.css` is the static baseline; `site.js` injects a **runtime style block**
  that overrides it at equal specificity. If a CSS change appears to do nothing, check
  that block first.
- `site.js` empties `document.body` and reassembles it. Anything that must survive has to
  come through `bodyNodes`; re-inserted `<iframe>`s reload, so their `src` is parked and
  restored after insertion.
- The mindmap viewer (`assets/new-viewer.html`) loads d3 from a CDN and reads JSON from
  `media/`. It renders blank if either is unreachable.

## Local preview

```sh
python3 -m http.server 8765    # then open http://localhost:8765/index.html
```
