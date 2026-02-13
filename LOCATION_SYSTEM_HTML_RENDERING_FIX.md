# HTML Rendering Fix - Inline vs Full Document

## Problem

The live map HTML wasn't rendering in the side panel. The raw HTML was visible when toggling to "HTML" mode, but the rendered view showed nothing.

## Root Cause

The `generateMapHTML` function was generating a **full HTML document** with:
- `<!DOCTYPE html>`
- `<html>` and `</html>` tags
- `<head>` section with `<meta>` and `<style>`
- `<body>` tags

When this full HTML document is injected into a div using `innerHTML`, the browser **strips out** the `<html>`, `<head>`, and `<body>` tags, leaving only the body content. However, the styles defined in the `<head>` are also lost, and the structure doesn't render correctly.

### Why It Worked for Download

The full HTML document format is **perfect for downloading** as a standalone file - you can open it in a browser and it displays correctly with all styles.

### Why It Didn't Work for Inline Display

When you set `innerHTML` on a div inside an existing HTML page:
- Browser ignores `<!DOCTYPE>`, `<html>`, `<head>`, `<body>` tags
- Only content inside `<body>` is retained
- Styles from `<head>` are lost
- Result: blank or broken display

## Solution

Modified `generateMapHTML` to accept an `inline` parameter:
- **`inline: true`** → Returns just the styled content (no document tags)
- **`inline: false`** → Returns full HTML document (for download)

### Code Changes

**Function Signature** (line 176):
```typescript
function generateMapHTML(
  locationName: string,
  spaces: Array<{...}>,
  totalSpaces: number,
  currentSpace: number,
  inline: boolean = false  // NEW parameter
): string
```

**Dual HTML Generation** (lines 50-56):
```typescript
// Generate full HTML for download
const fullHtml = generateMapHTML(locationName, spaces, totalSpaces, currentSpace, false);
setHtmlContent(fullHtml);  // Used for download button

// Generate inline HTML for display (without html/head/body tags)
const inlineHtml = generateMapHTML(locationName, spaces, totalSpaces, currentSpace, true);
containerRef.current.innerHTML = inlineHtml;  // Used for rendering
```

**Content Structure** (lines 244-297):
```typescript
// Extract body content into reusable variable
const bodyContent = `
<style>
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
  }
</style>
<div style="font-family:...">
  <!-- Map header, grid, legend, tip -->
</div>
`.trim();

// Return inline HTML or full document based on parameter
if (inline) {
  return bodyContent;  // Just the content
}

return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${locationName} - Visual Map</title>
  <style>body { ... }</style>
</head>
<body>
  <div style="max-width:1200px;margin:0 auto;...">
    ${bodyContent}
  </div>
</body>
</html>
`.trim();
```

## HTML Structure Differences

### Full HTML (for download):
```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Castle Blood Forge - Visual Map</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      margin: 0;
      padding: 20px;
      background: #f9fafb;
    }
  </style>
</head>
<body>
  <div style="max-width:1200px;margin:0 auto;background:white;padding:24px;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
    <!-- Content here -->
  </div>
</body>
</html>
```

### Inline HTML (for display):
```html
<style>
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
  }
</style>
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="margin-bottom:20px;">
    <h2 style="margin:0 0 8px 0;color:#1f2937;font-size:20px;">Castle Blood Forge</h2>
    <div style="display:flex;align-items:center;gap:8px;color:#6b7280;font-size:13px;">
      <span>🗺️ 3 of 60 spaces generated</span>
      <span>•</span>
      <span>5% complete</span>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:repeat(8,1fr);gap:12px;margin-bottom:20px;">
    <!-- Space cards here -->
  </div>

  <div style="background:#f9fafb;padding:12px;border-radius:6px;border:1px solid #e5e7eb;">
    <!-- Legend here -->
  </div>

  <div style="margin-top:12px;padding:10px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;font-size:11px;color:#1e40af;">
    💡 <strong>Tip:</strong> This map updates in real-time as each space is generated.
  </div>
</div>
```

## Styling Adjustments for Side Panel

Since the inline version is displayed in a narrower side panel, adjusted some sizes:
- **Font sizes**: Reduced from 14px/24px to 13px/20px
- **Legend items**: Smaller icons (16px instead of 20px)
- **Legend text**: 11px font size
- **Padding/margins**: Reduced spacing for tighter layout
- **Min-width**: Changed legend grid to 140px min (was 150px)

## Benefits

✅ **HTML renders correctly** in the side panel
✅ **Download still works** - gets full HTML document
✅ **Raw HTML view** - shows full document (for debugging/inspection)
✅ **Single source of truth** - `bodyContent` used in both versions
✅ **Proper styling** - inline styles preserved in both formats
✅ **Optimized for context** - inline version sized for narrow panel

## Debug Logging Added

Added console logs to track HTML generation:
```typescript
console.log('[LiveMap] No spaces yet');
console.log('[LiveMap] Generating HTML for', spaces.length, 'spaces');
console.log('[LiveMap] Inline HTML length:', inlineHtml.length);
console.log('[LiveMap] Setting innerHTML on container');
console.log('[LiveMap] Container innerHTML set, children count:', containerRef.current.children.length);
console.log('[LiveMap] Container ref not ready or showRawHtml is true. Ref:', !!containerRef.current, 'showRawHtml:', showRawHtml);
```

These logs help verify:
- Spaces are being received
- HTML is being generated
- Container ref is ready
- innerHTML is being set
- Children are being created

## Testing Verification

1. **Rendered View**:
   - Panel should show colorful grid of space cards
   - Header with location name and progress
   - Legend with color-coded space types
   - Tip box at bottom

2. **Raw HTML View**:
   - Toggle "HTML" button
   - Should show full HTML document (with DOCTYPE, html tags)
   - This is what gets downloaded

3. **Download**:
   - Click "Download" button
   - Opens in browser with full styling
   - Standalone HTML file works independently

4. **Real-time Updates**:
   - As each space is generated, card appears in grid
   - Progress percentage updates
   - Placeholder spaces decrease

## Summary

The fix separates **content generation** from **document structure**:
- **Content** (`bodyContent`) contains the actual map HTML
- **Wrapper** (full HTML document) wraps it for downloads
- **Inline rendering** uses just the content, no wrapper

This pattern is common when you need to:
- Display HTML inside an existing page (use content only)
- Export HTML as standalone file (use full document)

The HTML now renders beautifully in the side panel! 🎨
