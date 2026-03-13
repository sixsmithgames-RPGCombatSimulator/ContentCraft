import type { LiveMapSpace } from '../types/liveMapTypes';

export interface SpaceColorScheme {
  bg: string;
  border: string;
}

export function getLocationSpaceColor(spaceFunction?: string): SpaceColorScheme {
  const func = spaceFunction?.toLowerCase() || '';

  if (func.includes('entrance') || func.includes('lobby') || func.includes('hall')) {
    return { bg: '#e3f2fd', border: '#1976d2' };
  }
  if (func.includes('private') || func.includes('bedroom') || func.includes('quarters')) {
    return { bg: '#e8f5e9', border: '#388e3c' };
  }
  if (func.includes('military') || func.includes('armory') || func.includes('guard')) {
    return { bg: '#ffebee', border: '#c62828' };
  }
  if (func.includes('kitchen') || func.includes('storage') || func.includes('workshop')) {
    return { bg: '#fff9c4', border: '#f57f17' };
  }
  if (func.includes('throne') || func.includes('court') || func.includes('council')) {
    return { bg: '#f3e5f5', border: '#7b1fa2' };
  }

  return { bg: '#f5f5f5', border: '#9e9e9e' };
}

export function buildLocationMapBodyContent(
  locationName: string,
  spaces: LiveMapSpace[],
  totalSpaces: number,
  spaceRowsHtml: string
): string {
  return `
<style>
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
  }
</style>
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="margin-bottom:20px;">
    <h2 style="margin:0 0 8px 0;color:#1f2937;font-size:20px;">${locationName}</h2>
    <div style="display:flex;align-items:center;gap:8px;color:#6b7280;font-size:13px;">
      <span>🗺️ ${spaces.length} of ${totalSpaces} spaces generated</span>
      <span>•</span>
      <span>${Math.round((spaces.length / totalSpaces) * 100)}% complete</span>
    </div>
  </div>

  <div style="display:flex;flex-direction:column;gap:16px;margin-bottom:20px;">
    ${spaceRowsHtml}
  </div>

  <div style="background:#f9fafb;padding:12px;border-radius:6px;border:1px solid #e5e7eb;">
    <div style="font-weight:600;color:#374151;margin-bottom:8px;font-size:13px;">Legend</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:6px;">
      <div style="display:flex;align-items:center;gap:6px;font-size:11px;">
        <div style="width:16px;height:16px;background:#e3f2fd;border:2px solid #1976d2;border-radius:3px;"></div>
        <span style="color:#666;">Public Spaces</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px;font-size:11px;">
        <div style="width:16px;height:16px;background:#e8f5e9;border:2px solid #388e3c;border-radius:3px;"></div>
        <span style="color:#666;">Private Areas</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px;font-size:11px;">
        <div style="width:16px;height:16px;background:#ffebee;border:2px solid #c62828;border-radius:3px;"></div>
        <span style="color:#666;">Restricted Zones</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px;font-size:11px;">
        <div style="width:16px;height:16px;background:#fff9c4;border:2px solid #f57f17;border-radius:3px;"></div>
        <span style="color:#666;">Service Areas</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px;font-size:11px;">
        <div style="width:16px;height:16px;background:#f3e5f5;border:2px solid #7b1fa2;border-radius:3px;"></div>
        <span style="color:#666;">Important Rooms</span>
      </div>
    </div>
  </div>

  <div style="margin-top:12px;padding:10px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;font-size:11px;color:#1e40af;">
    💡 <strong>Tip:</strong> This map updates in real-time as each space is generated.
  </div>
</div>`;
}

export function wrapLocationMapHtmlDocument(
  locationName: string,
  bodyContent: string,
  inline: boolean
): string {
  if (inline) {
    return bodyContent;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${locationName} - Map In Progress</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      margin: 0;
      padding: 20px;
      background: #f3f4f6;
    }
  </style>
</head>
<body>
  <div style="max-width:1200px;margin:0 auto;background:white;padding:24px;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
    ${bodyContent}
  </div>
</body>
</html>`;
}
