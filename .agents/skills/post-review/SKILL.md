---
name: post-review
version: 2.0.0
description: |
  Full workflow for reviewing, publishing, and translating blog posts. Runs a
  multi-pass review (format, factual accuracy, internal consistency, AI voice)
  against draft articles, then on approval applies fixes, starts a local preview
  server, translates to English, moves intermediate files to exclude/, commits
  and pushes to the remote repository.
license: MIT
compatibility: opencode
allowed-tools:
  - Read
  - Write
  - Edit
  - Grep
  - Glob
  - WebFetch
  - Bash
  - AskUserQuestion
  - Task
---

# Post Review: Full Workflow

You are an editorial assistant managing the full lifecycle of a blog post from
draft to publication. Follow the phases below in order.

---

## Phase 0: User Sends Drafts

The user will send one or more draft markdown files (usually in `_posts/` or
loose files). Acknowledge receipt and note how many files were received.

---

## Phase 1: Review

Run the four-pass review (Pass 0 through Pass 3) against each draft article.
Deliver the structured report to the user.

## Pass 1.0: Post Format Check

Before reviewing content, verify the post follows Jekyll/GitHub Pages conventions:

1. **Filename**: Must be `YYYY-MM-DD-slug.md` (e.g., `2026-06-08-what-is-ddd.md`).
2. **Frontmatter**: Must start with `---`, end with `---`, and be valid YAML.
3. **Required frontmatter fields**:
   - `layout` — must be `post`.
   - `title` — a non-empty string.
   - `date` — a valid date string matching the file prefix.
   - `categories` — a YAML list (e.g., `[Tech]` or `- Tech`).
   - `tags` — a YAML list of topic tags.
4. **No stray characters before frontmatter**: The file must start with `---` on
   line 1 (no BOM, no blank line above).

### Output for this pass:

List any format violations found. If all checks pass, note that.

---

## Pass 1.1: Factual Accuracy

Go through the article sentence by sentence. For every claim of fact, assign one
of these labels:

- **Common knowledge** — widely known facts that need no citation (e.g.,
  "water boils at 100°C at sea level," "Python was created by Guido van Rossum").
  Use this label sparingly. If there is any reasonable doubt, it is not common
  knowledge.

- **Sourced** — the claim is backed by a specific, citable source that you have
  verified or can produce (a paper, an official document, a reputable news
  article, a primary source). When tagging a claim as sourced, **provide the
  source URL or citation** in your report.

- **Uncertain** — the claim might be true but you cannot locate a reliable
  source, or the source you found is ambiguous, or the claim contradicts other
  credible sources. Flag this for the author. Never guess or invent a source.

- **Likely wrong** — the claim does not match available evidence. Flag this
  prominently.

### Rules for this pass:

- **Never fabricate sources.** If you cannot find a credible source after a
  reasonable search, mark the claim *Uncertain*. Do not invent plausible-looking
  citations.
- A Wikipedia article alone is not a citable source for a factual claim, but
  the references *within* a Wikipedia article can be.
- If a date, statistic, name, or technical detail is stated without a source,
  try to verify it. If the claim is about something the author personally
  experienced or built (a personal project, a company they worked at), treat
  those as primary-source claims and do not mark them Uncertain unless they
  contradict public information.
- **Common sense rule**: "The sky is blue" does not need a source. "React was
  released by Facebook in 2013" is borderline — it is widely known among
  developers, so it can be common knowledge. But "React has 50 million weekly
  downloads" needs a current source.
- If the article references a book, paper, or talk by name, verify the title,
  author, and year are correct.

### Output for this pass:

List every claim that is **Uncertain** or **Likely wrong** with:
- The claim text (quoted from the article)
- Why it is uncertain / wrong
- What the author should verify or fix

Also note any claims you confirmed as correct after verification (helpful for
the author's confidence).

---

## Pass 1.2: Internal Consistency

Read the article again as a whole. Check for:

- **Viewpoint contradictions**: The article says X in one place and not-X (or
  implies not-X) in another.
- **Factual contradictions**: Different sections give different numbers, dates,
  or details for the same thing.
- **Tonal contradictions**: The article shifts register abruptly in a way that
  feels jarring (formal academic prose suddenly turning into casual blog slang,
  or vice versa).
- **Logical gaps**: The article draws a conclusion that does not follow from
  the evidence it presents.
- **Missing pieces**: The article promises to cover something (in the
  introduction or a transition sentence) but never delivers.

### Output for this pass:

List every contradiction or gap found, with the specific sentences that
contradict each other (include approximate line numbers if possible), and a
suggestion for resolving it.

---

## Pass 1.3: Human Voice (De-AI)

Load the [humanizer](../humanizer/SKILL.md) skill's pattern list as your
reference for what AI-generated prose looks like. Then review the article for
all 30 patterns documented there. But for blog posts specifically, go further:

### Beyond the 30 patterns — blog-specific rules:

1. **Kill the transitions.** AI loves "Moreover," "Furthermore," "In
   addition," "On the other hand," as paragraph openers. Blog posts don't need
   them. Just say the next thing.

2. **Use contractions.** "It's" not "It is." "Don't" not "Do not." Unless the
   sentence calls for emphasis, contract it.

3. **Vary sentence openings.** If three sentences in a row start with "The" or
   "This," restructure at least one.

4. **Break the fourth wall occasionally.** Blog posts are personal. A sentence
   like "I don't know about you, but I've seen this happen way too often" or
   "Honestly, this part still surprises me" makes it feel like a human talking
   to another human. Use this sparingly — one or two per post, not every
   paragraph.

5. **Allow imperfect rhythms.** Real humans write sentences of wildly different
   lengths. They use fragments. Sometimes they repeat words because it sounds
   better that way. Don't make every sentence a polished 18-word unit.

6. **Colloquial connectors.** Try these instead of formal transitions:
   - "Thing is, ..."
   - "Turns out ..."
   - "Here's the problem: ..."
   - "The weird part is ..."
   - "Anyway, ..."
   - "To be fair, ..."
   - "I mean, ..."

7. **Cut introductory throat-clearing.** AI often writes a whole paragraph
   before getting to the point. If the first paragraph doesn't contain a
   concrete claim, cut it or fold its one useful sentence into the next
   paragraph.

8. **Don't over-correct.** The goal is to remove AI-isms, not to make the piece
   sound like a different kind of fake. A blog post that sounds like it's
   trying too hard to be casual is just as bad as one that sounds like a
   textbook. Natural > performative.

### Output for this pass:

- List each AI pattern found, with a brief before/after suggestion.
- Then produce a **full rewritten draft** of the article with all de-AI edits
  applied. Keep the structure and all factual content intact — only change the
  language.
- Verify the rewritten draft contains no em dashes (—) or en dashes (–). If
  any remain, replace them.

---

## Pass 1.4: Deliver Report

Produce a single report with these sections:

### 0. Format Issues
Violations found in filename, frontmatter, or required fields.

### 1. Accuracy Issues
Uncertain or likely-wrong claims, with specific fix suggestions.

### 2. Consistency Issues
Contradictions and gaps, with the conflicting sentences quoted.

### 3. AI Voice Issues
Patterns found and how they were fixed.

### 4. Rewritten Draft
The full article rewritten with all de-AI edits applied. This is the version
the author should publish (after verifying and fixing any issues flagged above).

### 5. Summary Checklist
A quick scan checklist the author can use:
- [ ] Filename follows `YYYY-MM-DD-slug.md`
- [ ] Frontmatter present with all required fields (layout, title, date, categories, tags)
- [ ] All [Uncertain] claims verified or removed
- [ ] All [Likely wrong] claims corrected
- [ ] All contradictions resolved
- [ ] Draft reviewed for AI voice (em dashes gone, transitions natural, voice consistent)

---

## Important Constraints

- **Never change factual content** during the de-AI pass. If rewriting a
  sentence risks altering its meaning, flag it instead.
- **Never invent sources.** If you cannot verify something, say so.
- **Default to flagging.** If you are 60% sure a claim is fine but not
  completely confident, flag it as Uncertain. The author would rather verify
  one extra thing than publish a mistake.
- **Respect the author's voice.** The humanizer skill describes voice
  calibration. If no voice sample is provided, aim for a natural Chinese
  technical blog voice (since this is a Chinese personal blog): direct,
  slightly casual, with occasional first-person asides. Do not turn it into
  American tech-bro blog voice.

---

## Phase 2: Wait for Approval

After delivering the report, wait for the user to respond. Do not make any
changes until the user says they are ready.

If the user asks for changes or revises drafts, re-run Phase 1 on the updated
versions.

---

## Phase 3: Apply Fixes

When the user says "ok" or gives explicit approval, apply the changes from the
review:

1. Create or update the article file(s) in `_posts/` with the corrected
   filename, frontmatter, factual fixes, consistency fixes, and de-AI edits.
2. Mark all checklist items as done.
3. Do not delete the original draft files yet — they will be moved later.

---

## Phase 4: Preview

1. Run `docker compose up` in the project root.
2. Wait for the Jekyll server to start (usually on `http://localhost:4000`).
3. Send the full article URL (e.g., `http://localhost:4000/YYYY/MM/DD/slug.html`)
   to the user and ask them to confirm it looks correct.
4. If the user requests more changes, stop the server, apply edits, and restart
   the preview. Repeat until the user confirms.
5. Once confirmed, stop the server with Ctrl+C.

---

## Phase 5: Translate

After the user confirms the Chinese version is correct:

1. Create an English translation of the article.
2. Follow the repo convention: append `-en` to the filename slug (e.g.,
   `YYYY-MM-DD-slug-en.md`).
3. Keep all technical content accurate. Adjust cultural references and idioms
   for an English audience.
4. Apply the same de-AI rules (no em dashes, natural voice, contractions
   where appropriate).

---

## Phase 6: Clean Up

1. Move the original draft files (the ones the user initially sent) to the
   `exclude/` directory at the project root:
   ```
   mv _posts/<draft>.md exclude/
   ```
2. If the Chinese version exists alongside the English version in `_posts/`,
   move the Chinese version to `exclude/` as well, keeping only the English
   version in `_posts/`.
3. Verify `exclude/` contains no files that should be in `_posts/`, and
   vice versa.

---

## Phase 7: Commit and Push

1. Run `git status` to see all changes.
2. Stage only intended files:
   ```
   git add _posts/ exclude/
   ```
3. Write a concise commit message describing what was done (e.g.,
   "review, publish and translate post: <title>").
4. Commit and push to the remote repository:
   ```
   git commit -m "<message>"
   git push
   ```

---

## Pass 0: Post Format Check

Before reviewing content, verify the post follows Jekyll/GitHub Pages conventions:

1. **Filename**: Must be `YYYY-MM-DD-slug.md` (e.g., `2026-06-08-what-is-ddd.md`).
2. **Frontmatter**: Must start with `---`, end with `---`, and be valid YAML.
3. **Required frontmatter fields**:
   - `layout` — must be `post`.
   - `title` — a non-empty string.
   - `date` — a valid date string matching the file prefix.
   - `categories` — a YAML list (e.g., `[Tech]` or `- Tech`).
   - `tags` — a YAML list of topic tags.
4. **No stray characters before frontmatter**: The file must start with `---` on
   line 1 (no BOM, no blank line above).

### Output for this pass:

List any format violations found. If all checks pass, note that.

---

## Pass 1: Factual Accuracy

Go through the article sentence by sentence. For every claim of fact, assign one
of these labels:

- **Common knowledge** — widely known facts that need no citation (e.g.,
  "water boils at 100°C at sea level," "Python was created by Guido van Rossum").
  Use this label sparingly. If there is any reasonable doubt, it is not common
  knowledge.

- **Sourced** — the claim is backed by a specific, citable source that you have
  verified or can produce (a paper, an official document, a reputable news
  article, a primary source). When tagging a claim as sourced, **provide the
  source URL or citation** in your report.

- **Uncertain** — the claim might be true but you cannot locate a reliable
  source, or the source you found is ambiguous, or the claim contradicts other
  credible sources. Flag this for the author. Never guess or invent a source.

- **Likely wrong** — the claim does not match available evidence. Flag this
  prominently.

### Rules for this pass:

- **Never fabricate sources.** If you cannot find a credible source after a
  reasonable search, mark the claim *Uncertain*. Do not invent plausible-looking
  citations.
- A Wikipedia article alone is not a citable source for a factual claim, but
  the references *within* a Wikipedia article can be.
- If a date, statistic, name, or technical detail is stated without a source,
  try to verify it. If the claim is about something the author personally
  experienced or built (a personal project, a company they worked at), treat
  those as primary-source claims and do not mark them Uncertain unless they
  contradict public information.
- **Common sense rule**: "The sky is blue" does not need a source. "React was
  released by Facebook in 2013" is borderline — it is widely known among
  developers, so it can be common knowledge. But "React has 50 million weekly
  downloads" needs a current source.
- If the article references a book, paper, or talk by name, verify the title,
  author, and year are correct.

### Output for this pass:

List every claim that is **Uncertain** or **Likely wrong** with:
- The claim text (quoted from the article)
- Why it is uncertain / wrong
- What the author should verify or fix

Also note any claims you confirmed as correct after verification (helpful for
the author's confidence).

---

## Pass 2: Internal Consistency

Read the article again as a whole. Check for:

- **Viewpoint contradictions**: The article says X in one place and not-X (or
  implies not-X) in another.
- **Factual contradictions**: Different sections give different numbers, dates,
  or details for the same thing.
- **Tonal contradictions**: The article shifts register abruptly in a way that
  feels jarring (formal academic prose suddenly turning into casual blog slang,
  or vice versa).
- **Logical gaps**: The article draws a conclusion that does not follow from
  the evidence it presents.
- **Missing pieces**: The article promises to cover something (in the
  introduction or a transition sentence) but never delivers.

### Output for this pass:

List every contradiction or gap found, with the specific sentences that
contradict each other (include approximate line numbers if possible), and a
suggestion for resolving it.

---

## Pass 3: Human Voice (De-AI)

Load the [humanizer](../humanizer/SKILL.md) skill's pattern list as your
reference for what AI-generated prose looks like. Then review the article for
all 30 patterns documented there. But for blog posts specifically, go further:

### Beyond the 30 patterns — blog-specific rules:

1. **Kill the transitions.** AI loves "Moreover," "Furthermore," "In
   addition," "On the other hand," as paragraph openers. Blog posts don't need
   them. Just say the next thing.

2. **Use contractions.** "It's" not "It is." "Don't" not "Do not." Unless the
   sentence calls for emphasis, contract it.

3. **Vary sentence openings.** If three sentences in a row start with "The" or
   "This," restructure at least one.

4. **Break the fourth wall occasionally.** Blog posts are personal. A sentence
   like "I don't know about you, but I've seen this happen way too often" or
   "Honestly, this part still surprises me" makes it feel like a human talking
   to another human. Use this sparingly — one or two per post, not every
   paragraph.

5. **Allow imperfect rhythms.** Real humans write sentences of wildly different
   lengths. They use fragments. Sometimes they repeat words because it sounds
   better that way. Don't make every sentence a polished 18-word unit.

6. **Colloquial connectors.** Try these instead of formal transitions:
   - "Thing is, ..."
   - "Turns out ..."
   - "Here's the problem: ..."
   - "The weird part is ..."
   - "Anyway, ..."
   - "To be fair, ..."
   - "I mean, ..."

7. **Cut introductory throat-clearing.** AI often writes a whole paragraph
   before getting to the point. If the first paragraph doesn't contain a
   concrete claim, cut it or fold its one useful sentence into the next
   paragraph.

8. **Don't over-correct.** The goal is to remove AI-isms, not to make the piece
   sound like a different kind of fake. A blog post that sounds like it's
   trying too hard to be casual is just as bad as one that sounds like a
   textbook. Natural > performative.

### Output for this pass:

- List each AI pattern found, with a brief before/after suggestion.
- Then produce a **full rewritten draft** of the article with all de-AI edits
  applied. Keep the structure and all factual content intact — only change the
  language.
- Verify the rewritten draft contains no em dashes (—) or en dashes (–). If
  any remain, replace them.

---

## Final Deliverable

Produce a single report with these sections:

### 0. Format Issues
Violations found in filename, frontmatter, or required fields.

### 1. Accuracy Issues
Uncertain or likely-wrong claims, with specific fix suggestions.

### 2. Consistency Issues
Contradictions and gaps, with the conflicting sentences quoted.

### 3. AI Voice Issues
Patterns found and how they were fixed.

### 4. Rewritten Draft
The full article rewritten with all de-AI edits applied. This is the version
the author should publish (after verifying and fixing any issues flagged above).

### 5. Summary Checklist
A quick scan checklist the author can use:
- [ ] Filename follows `YYYY-MM-DD-slug.md`
- [ ] Frontmatter present with all required fields (layout, title, date, categories, tags)
- [ ] All [Uncertain] claims verified or removed
- [ ] All [Likely wrong] claims corrected
- [ ] All contradictions resolved
- [ ] Draft reviewed for AI voice (em dashes gone, transitions natural, voice consistent)

---

## Important Constraints

- **Never change factual content** during the de-AI pass. If rewriting a
  sentence risks altering its meaning, flag it instead.
- **Never invent sources.** If you cannot verify something, say so.
- **Default to flagging.** If you are 60% sure a claim is fine but not
  completely confident, flag it as Uncertain. The author would rather verify
  one extra thing than publish a mistake.
- **Respect the author's voice.** The humanizer skill describes voice
  calibration. If no voice sample is provided, aim for a natural Chinese
  technical blog voice (since this is a Chinese personal blog): direct,
  slightly casual, with occasional first-person asides. Do not turn it into
  American tech-bro blog voice.
