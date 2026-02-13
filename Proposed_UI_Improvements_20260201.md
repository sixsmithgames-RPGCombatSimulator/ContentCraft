# Proposed UI Improvements (2026-02-01)

## Writing Reader Modal (Published Work / Block Reader)
- **Audio toggle**
  - Use icon-only toggle (speaker) instead of a labeled “Audio” button.
  - Keep audio controls visible by default.
  - Keep audio controls in a single row with horizontal scroll as-needed.
- **Audio controls layout**
  - Keep controls on one line: Read/Pause, Stop, (optional) Dictate, Voice select, Rate slider.
  - Reduce voice select width (avoid consuming full modal width).
  - Consider truncating long voice labels in the dropdown and show full name on hover.
- **Reduce header clutter**
  - Avoid repeating “Draft”/status labels between modal chrome and rendered content.
  - Prefer a single, consistent “status chip” location (modal header).
- **Reading view defaults**
  - Default to showing the text immediately (no collapsing the primary content section).
  - Prefer collapsing *by chapter* rather than collapsing the entire manuscript.

## Content Renderer (Writing)
- **Chapter-first reading**
  - When the manuscript is markdown and uses `# Chapter Title` headings, render an always-open “Chapters” section containing collapsible chapter panels.
  - Keep the full-text panel hidden in this scenario (prevents duplication and aligns with the chapter tiles concept).
- **Navigation chips**
  - Ensure nav items don’t include a “Draft”/“Text” link if content is chapter-split.
  - Consider making the nav chips sticky inside the scroll container for long documents.

## Project Detail (Content Blocks)
- **Left list ergonomics**
  - Add a visible “selected” indicator (already present) and consider a stronger contrast for the active item.
  - Consider showing a small published/notes icon rather than a full label to reduce row width.
- **Published view discoverability**
  - Keep the button disabled when there are 0 published blocks, but consider a tooltip explaining why.

## Dashboard
- **Filter density**
  - Consider collapsing the filter row on smaller widths (search + type) into a single “Filters” popover.

## Create Project
- **Faster setup**
  - Consider a short “template” chooser (Fiction / Non-fiction / D&D) that preselects sensible defaults.

## Generator
- **Clarity of workflow**
  - Consider moving the long “How It Works” into a collapsible help panel to keep the generator controls above the fold.

## Canon Management
- **Consistency**
  - Consider a consistent header layout with Project Detail (same back button placement, same heading sizing).
