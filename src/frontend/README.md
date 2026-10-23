# AI Career Navigator — Argon Edition

This is the **default frontend**. It is built directly on the vendored Argon Theme source
from [`src/argon-theme`](../argon-theme), not on a re-created "Argon-style" skin.

The previous teapot frontend is preserved as a complete, independent copy in
[`src/frontend_bak`](../frontend_bak). When the FastAPI entry is running:

- `/` — this Argon frontend (default)
- `/legacy/` — the previous frontend

Use the **Classic** button in the Argon navigation to switch back, and the floating
**Argon design** link on the legacy page to return.

## Argon source usage

The following files are copied unchanged from the Argon Theme source tree:

~~~text
vendor/argon/argon_css_merged.css   # Argon Design System + Bootstrap + theme vendor CSS
vendor/argon/style.css              # Argon WordPress theme styles
vendor/argon/argon.min.js           # Argon Design System JavaScript
vendor/argon/bootstrap.bundle.min.js
vendor/argon/jquery.min.js
vendor/argon/LICENSE                # Argon Theme GPLv3 license
~~~

The page uses Argon's own classes and components (navbar, banner/shape, cards, badges,
buttons, forms, grid, footer). `css/app.css` only adds product-specific layout, score-ring
and section spacing; it does not replace the Argon palette or components.

Argon Theme is by [solstice23](https://github.com/solstice23/argon-theme) and is licensed
under GPLv3. The theme name and link are retained in the footer as required by the project.

## Run

~~~bash
python src/main.py
# open http://127.0.0.1:8000/
~~~

For frontend-only static serving:

~~~bash
python tools/serve_frontend.py --port 8003
~~~

The frontend calls the existing `/api/v1` contract. It loads meta/catalog/signals on boot,
persists a profile, then requests matches, a three-phase pathway, the SDG map and a streamed
narrative.

## Files

~~~text
index.html                 Argon navbar + banner + product sections
css/app.css                app layout, cards and score-ring styling
js/app.js                  API loading, profile form, matching, pathway, SDG, SSE narrative
vendor/argon/              vendored Argon Theme source and dependencies
assets/argon-mark.svg      Argon Edition favicon
~~~
