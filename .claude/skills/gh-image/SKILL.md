---
name: gh-image
description: Download an image attached to a GitHub issue, PR, or comment (URLs under https://github.com/user-attachments/) so it can be read with the Read tool. Use whenever the user references such a URL or asks you to look at an image attached to a GitHub issue/PR — those URLs require the gh CLI's auth token and won't work via plain WebFetch or curl.
allowed-tools:
  - Bash
  - Read
---

# gh-image

GitHub user-attachments URLs (the ones GitHub creates when you drag-and-drop an image into an issue/PR/comment) are gated by auth and can't be fetched anonymously. The bundled `gh-image` script wraps `curl` with the `gh auth token`, follows the redirect to the CDN, and saves the file locally.

## When to use

- The user pastes or references a `https://github.com/user-attachments/...` URL.
- The user asks you to look at an image attached to a GitHub issue, PR, or comment.
- You're inspecting an issue/PR via `gh` and need to view an embedded image.

## How to use

Run the bundled script (lives next to this SKILL.md) with the URL as the first argument:

```bash
.claude/skills/gh-image/gh-image <url>
```

It prints the local path on stdout (default: `/tmp/gh-image-<hash>.<ext>`). Then read that path with the Read tool to view the image.

Optional second argument is an explicit output path:

```bash
.claude/skills/gh-image/gh-image <url> /tmp/myname.png
```

## Notes

- Only `https://github.com/user-attachments/...` URLs are supported. For other GitHub URLs (raw.githubusercontent.com, etc.) use WebFetch or plain curl.
- Requires `gh` to be installed and authenticated (`gh auth status` to verify).
- To find image URLs in an issue/PR body or comments, use `gh issue view <n> --json body,comments` or `gh api repos/<owner>/<repo>/issues/<n>/comments`.
