# Interpretation review page (B19)

A web page where the claims team reviews the readings that the system answers from **interpretation** rather than literal policy wording
(graph nodes and details marked `interp`, e.g. flood under Type 1).

The page is published as a private Claude artifact. The owner must share it with reviewers as **Contributors** before they can save answers.

## Files

| File | Purpose |
|---|---|
| `page.tpl.html` | Page template |
| `gen.mjs` | Fills the template with every `interp` node/detail from `public/js/data.js`, together with the relevant policy wording |

## Workflow

1. **Regenerate after each build:**
   ```bash
   node research/b19_review/gen.mjs public/js/data.js research/b19_review/page.tpl.html <out.html>
   ```
   Then publish `<out.html>` to the same artifact URL.
2. **Reviewers answer on the page.** Answers are stored in the page's database as
   `reviews/<user id>` = `{ answers: { <node id>: { v: ok | wrong | unsure, fix, at } } }`.
   Everyone can read all reviews; each reviewer can edit only their own.
3. **Apply the answers** in [`ingest/interp_review.py`](../../ingest/interp_review.py):
   `ok` → `confirmed`; `wrong` → fix the node, then mark it `confirmed`. Then rebuild `data.js`.
