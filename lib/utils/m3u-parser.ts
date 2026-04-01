/**
 * M3U Playlist Parser
 * Parses M3U/M3U8 IPTV playlist format and JSON channel lists
 */

export interface M3UChannel {
  name: string;
  url: string;
  logo?: string;
  group?: string;
  tvgId?: string;
  tvgName?: string;
  routes?: string[];
  sourceId?: string;
  sourceName?: string;
  httpUserAgent?: string;
  httpReferrer?: string;
}

export interface M3UPlaylist {
  channels: M3UChannel[];
  groups: string[];
}

export interface PlaylistReference {
  kind: 'playlist' | 'config';
  name: string;
  url: string;
  httpUserAgent?: string;
  httpReferrer?: string;
}

function resolveReferenceUrl(baseUrl: string | undefined, target: string): string {
  if (!baseUrl) return target;
  try {
    return new URL(target, baseUrl).toString();
  } catch {
    return target;
  }
}

export function extractPlaylistReferences(content: string, baseUrl?: string): PlaylistReference[] {
  try {
    const data = JSON.parse(content);
    if (!data || typeof data !== 'object') return [];

    const references: PlaylistReference[] = [];

    if (Array.isArray((data as any).lives)) {
      for (const entry of (data as any).lives) {
        if (!entry || typeof entry.url !== 'string') continue;
        references.push({
          kind: 'playlist',
          name: entry.name || entry.title || '直播源',
          url: resolveReferenceUrl(baseUrl, entry.url),
          httpUserAgent: entry.ua || entry.userAgent || entry.http_user_agent || entry.httpUserAgent,
          httpReferrer: entry.referer || entry.referrer || entry.http_referrer || entry.httpReferrer,
        });
      }
    }

    if (Array.isArray((data as any).urls)) {
      for (const entry of (data as any).urls) {
        if (!entry || typeof entry.url !== 'string') continue;
        references.push({
          kind: 'config',
          name: entry.name || entry.title || '配置源',
          url: resolveReferenceUrl(baseUrl, entry.url),
        });
      }
    }

    return references;
  } catch {
    return [];
  }
}

/**
 * Try to parse content as JSON channel list.
 * Supports formats:
 * - Array of channel objects: [{ name, url, group?, logo?, ... }]
 * - Object with channels/list field: { channels: [...] } or { list: [...] }
 */
function tryParseJSON(content: string): M3UPlaylist | null {
  try {
    const data = JSON.parse(content);
    let channels: any[] = [];

    if (Array.isArray(data)) {
      channels = data;
    } else if (data && typeof data === 'object') {
      channels = data.channels || data.list || data.items || data.data || [];
      if (!Array.isArray(channels)) return null;
    } else {
      return null;
    }

    if (channels.length === 0) return null;

    // Validate that items look like channel data
    const first = channels[0];
    if (!first || typeof first !== 'object') return null;
    // Must have at least a name and url
    if (!first.name && !first.title && !first.channel_name && !first.channel) return null;
    if (!first.url && !first.stream_url && !first.src && !first.link && !first.stream) return null;

    const groupSet = new Set<string>();
    const parsed: M3UChannel[] = [];

    for (const ch of channels) {
      const name = ch.name || ch.title || ch.channel_name || ch.channel || '';
      const url = ch.url || ch.stream_url || ch.src || ch.link || ch.stream || '';
      if (!name || !url) continue;

      const group = ch.group || ch.group_title || ch.groupName || ch.category || '';
      if (group) groupSet.add(group);

      parsed.push({
        name,
        url,
        logo: ch.logo || ch.icon || ch.tvg_logo || undefined,
        group: group || undefined,
        tvgId: ch.tvg_id || ch.tvgId || undefined,
        tvgName: ch.tvg_name || ch.tvgName || undefined,
        httpUserAgent: ch.http_user_agent || ch.httpUserAgent || ch.user_agent || undefined,
        httpReferrer: ch.http_referrer || ch.httpReferrer || ch.referer || ch.referrer || undefined,
      });
    }

    if (parsed.length === 0) return null;

    return {
      channels: parsed,
      groups: Array.from(groupSet).sort(),
    };
  } catch {
    return null;
  }
}

/**
 * Parse M3U playlist content into structured data.
 * Also supports JSON format channel lists.
 */
export function parseM3U(content: string): M3UPlaylist {
  const trimmed = content.trim();

  // Try JSON first if it looks like JSON
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const jsonResult = tryParseJSON(trimmed);
    if (jsonResult) return jsonResult;
  }

  const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const channels: M3UChannel[] = [];
  const groupSet = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('#EXTINF:')) {
      // Parse EXTINF line
      const channel: M3UChannel = { name: '', url: '' };

      // Extract attributes from EXTINF
      const tvgNameMatch = line.match(/tvg-name="([^"]*)"/i);
      const tvgLogoMatch = line.match(/tvg-logo="([^"]*)"/i);
      const groupTitleMatch = line.match(/group-title="([^"]*)"/i);
      const tvgIdMatch = line.match(/tvg-id="([^"]*)"/i);
      const httpUserAgentMatch = line.match(/http-user-agent="([^"]*)"/i);
      const httpReferrerMatch = line.match(/http-referrer="([^"]*)"/i);

      if (tvgNameMatch) channel.tvgName = tvgNameMatch[1];
      if (tvgLogoMatch) channel.logo = tvgLogoMatch[1];
      if (groupTitleMatch) {
        channel.group = groupTitleMatch[1];
        if (channel.group) groupSet.add(channel.group);
      }
      if (tvgIdMatch) channel.tvgId = tvgIdMatch[1];
      if (httpUserAgentMatch) channel.httpUserAgent = httpUserAgentMatch[1];
      if (httpReferrerMatch) channel.httpReferrer = httpReferrerMatch[1];

      // Extract channel name (after last comma)
      const commaIndex = line.lastIndexOf(',');
      if (commaIndex !== -1) {
        channel.name = line.substring(commaIndex + 1).trim();
      }

      // Next non-comment line should be the URL
      for (let j = i + 1; j < lines.length; j++) {
        if (!lines[j].startsWith('#')) {
          channel.url = lines[j];
          i = j; // Skip to after URL
          break;
        }
      }

      if (channel.name && channel.url) {
        // Use tvgName as fallback for name
        if (!channel.name && channel.tvgName) {
          channel.name = channel.tvgName;
        }
        channels.push(channel);
      }
    }
  }

  // If no EXTINF entries were found, also try JSON as a fallback
  if (channels.length === 0) {
    const jsonResult = tryParseJSON(content);
    if (jsonResult) return jsonResult;
  }

  return {
    channels,
    groups: Array.from(groupSet).sort(),
  };
}

/**
 * Group channels with the same name into single entries with multiple routes.
 * This merges duplicate channel names (common in M3U playlists with multiple streams).
 */
export function groupChannelsByName(channels: M3UChannel[]): M3UChannel[] {
  const groups = new Map<string, M3UChannel>();

  for (const ch of channels) {
    const key = `${ch.sourceId || ''}::${ch.name.toLowerCase().trim()}`;
    const existing = groups.get(key);
    if (existing) {
      if (!existing.routes) {
        existing.routes = [existing.url];
      }
      if (!existing.routes.includes(ch.url)) {
        existing.routes.push(ch.url);
      }
      // Use first logo found
      if (!existing.logo && ch.logo) existing.logo = ch.logo;
    } else {
      groups.set(key, { ...ch });
    }
  }

  // Only add routes array when there are multiple routes
  const result = Array.from(groups.values());
  for (const ch of result) {
    if (ch.routes && ch.routes.length <= 1) {
      delete ch.routes;
    }
  }
  return result;
}
