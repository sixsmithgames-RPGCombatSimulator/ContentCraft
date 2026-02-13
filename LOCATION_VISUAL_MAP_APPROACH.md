# Location Visual Map - Pure HTML Approach

## Problem Solved

**Original Issue**: Asking the AI to wrap HTML in JSON caused parsing failures due to:
- HTML quotes conflicting with JSON string quotes
- HTML special characters (`, {, }`) breaking JSON syntax
- Escape sequence nightmares

**Solution**: AI outputs **PURE HTML** directly. No JSON wrapper. No markdown. Just clean HTML.

## How It Works

### Stage 5: Visual Map

**AI Output Format**: Pure HTML
```html
<div style="max-width:900px;margin:20px auto;font-family:Arial,sans-serif;">
  <h3>Castle Blood Forge - Ground Level</h3>
  <div style="display:grid;grid-template-columns:repeat(10,1fr);gap:4px;">
    <div style="grid-column:span 3;background:#e3f2fd;border:2px solid #1976d2;padding:8px;">
      <strong>Main Gate</strong><br/>
      <small>20×30 ft</small>
    </div>
    <!-- 44 more spaces... -->
  </div>
  <div style="margin-top:15px;">
    <strong>Legend:</strong> Blue=Public, Green=Private, Red=Restricted
  </div>
</div>
```

**No JSON wrapper!** The AI response is the HTML itself.

### Storage Strategy

Since we're not using JSON, we store the HTML separately:

#### Option 1: Separate File (Recommended)
```
project/
  └── locations/
      └── castle_blood_forge/
          ├── location.json          (location data)
          └── visual_map.html        (HTML map)
```

**Metadata Linking**:
```json
{
  "name": "Castle Blood Forge",
  "location_type": "castle",
  "visual_map_file": "castle_blood_forge/visual_map.html",
  "spaces": [...]
}
```

#### Option 2: Base64 Encoding (Alternative)
Store HTML as base64 in JSON:
```json
{
  "visual_map_base64": "PGRpdiBzdHlsZT0ibWF4LXdpZHRoOjkwMHB4Oy4uLg=="
}
```

Decode when rendering:
```typescript
const html = atob(location.visual_map_base64);
```

#### Option 3: Database BLOB (For Server Storage)
Store HTML in separate column:
```sql
CREATE TABLE locations (
  id INT PRIMARY KEY,
  name VARCHAR(255),
  data JSON,
  visual_map_html TEXT
);
```

## Component: VisualMapRenderer

### Features
- ✅ Renders pure HTML safely
- ✅ Toggle between rendered view and raw HTML
- ✅ Download as standalone HTML file
- ✅ Collapse/expand functionality
- ✅ Shows metadata (pure HTML, no JSON wrapper)

### Usage
```tsx
<VisualMapRenderer
  htmlContent={rawHtmlFromAI}
  locationName="Castle Blood Forge"
/>
```

### Download Feature
Users can download the HTML as a standalone file:
- Filename: `Castle_Blood_Forge_visual_map.html`
- Opens in any browser
- Can be shared with players
- Can be embedded in VTT tools

## AI Prompt Strategy

### System Prompt
```
⚠️ CRITICAL OUTPUT REQUIREMENT ⚠️
Output PURE HTML ONLY. NO JSON. NO markdown code blocks. NO explanations.
Start your response with <div> and end with </div>.
Do NOT wrap the HTML in JSON or any other format.
```

### User Prompt
```
Create a simple HTML visual map showing the castle layout.

LOCATION: Castle Blood Forge - Ground Level
SCALE: massive
TOTAL SPACES: 45

Use a grid-based layout...

⚠️ CRITICAL: Output PURE HTML ONLY. NO JSON wrapper.
Start immediately with <div> and end with </div>.
```

### Expected Response
```html
<div style="...">
  <!-- HTML content -->
</div>
```

NOT:
```json
{
  "visual_map_html": "<div>...</div>"  // ❌ WRONG
}
```

NOT:
```markdown
```html
<div>...</div>
```  // ❌ WRONG
```

## Benefits

1. **No Parsing Errors**: HTML doesn't conflict with JSON
2. **Cleaner Output**: AI focuses on HTML quality, not escaping
3. **Standalone Files**: HTML can be saved/shared independently
4. **Better Separation**: Content vs. presentation clearly separated
5. **Flexible Storage**: Can be stored as file, base64, or BLOB
6. **Easier Debugging**: View raw HTML without JSON escaping

## Integration Points

### ManualGenerator.tsx
When receiving Visual Map stage response:
```typescript
if (stage.name === 'Visual Map') {
  // Response is raw HTML, not JSON
  const htmlContent = response; // No JSON.parse needed!

  // Store as separate file or base64
  stageResults.location_visual_map = {
    html: htmlContent,
    filename: `${locationName}_visual_map.html`,
    generated_at: new Date().toISOString()
  };
}
```

### SaveContentModal.tsx
When saving location:
```typescript
// Option 1: Save as separate file
await saveVisualMapFile(location.visual_map.html, location.visual_map.filename);

// Option 2: Store base64 in JSON
location.visual_map_base64 = btoa(location.visual_map.html);

// Option 3: Send to server for BLOB storage
await saveLocation({
  ...location,
  visual_map_html: location.visual_map.html
});
```

## Future Enhancements

1. **Interactive Maps**: Add click handlers to spaces
2. **Zoom/Pan**: SVG or canvas-based maps
3. **Export Formats**:
   - PDF (for printing)
   - PNG (for sharing)
   - Foundry VTT JSON (for virtual tabletops)
4. **Live Updates**: Regenerate map as spaces are added
5. **3D View**: Three.js visualization of multi-floor locations

## Color Coding System

```css
/* Public/Common Spaces */
background: #e3f2fd;
border: 2px solid #1976d2;

/* Private/Residential Areas */
background: #e8f5e9;
border: 2px solid #388e3c;

/* Restricted/Military Zones */
background: #ffebee;
border: 2px solid #c62828;

/* Service/Industrial Areas */
background: #fff9c4;
border: 2px solid #f57f17;
```

## Summary

**Problem**: JSON + HTML = Parsing Hell
**Solution**: Pure HTML output, stored separately
**Result**: Clean, reliable, flexible visual maps

The Visual Map stage now outputs production-ready HTML that can be rendered, downloaded, shared, and stored without any JSON parsing issues. 🎉
