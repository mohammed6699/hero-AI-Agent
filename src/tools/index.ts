import * as dotenv from 'dotenv';
import { getUserLocation } from '../db/index.js';
dotenv.config();

export interface ToolCall {
  name: string;
  arguments: any;
}

export interface ToolContext {
  userId: string;
}

export type ToolHandler = (args: any, context: ToolContext) => Promise<string> | string;

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: any;
  handler: ToolHandler;
}

// Distance Calculation Helper (Haversine Formula)
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radius of the Earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in km
}

async function geocode(location: string): Promise<{ lat: number, lon: number, display_name: string } | null> {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1`, {
      headers: { 'User-Agent': 'HeroTelegramAgent/1.0' }
    });
    const data = (await res.json()) as any[];
    if (data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lon: parseFloat(data[0].lon),
        display_name: data[0].display_name
      };
    }
  } catch (e) {}
  return null;
}

const get_current_time: ToolDefinition = {
  name: 'get_current_time',
  description: 'Returns the current local time of the agent.',
  parameters: {
    type: 'object',
    properties: {},
    required: []
  },
  handler: () => {
    return new Date().toISOString();
  }
};

const get_weather: ToolDefinition = {
  name: 'get_weather',
  description: 'Get the current weather for a specific location.',
  parameters: {
    type: 'object',
    properties: {
      location: {
        type: 'string',
        description: 'The city or location name, e.g. London or San Francisco, CA'
      }
    },
    required: ['location']
  },
  handler: async (args: any) => {
    const location = args.location;
    try {
      const res = await fetch(`https://wttr.in/${encodeURIComponent(location)}?format=j1`);
      if (!res.ok) {
        return `Weather data not available for ${location}.`;
      }
      const data = await res.json();
      const current = data.current_condition[0];
      return `Weather in ${location}: ${current.weatherDesc[0].value}, Temperature: ${current.temp_C}°C (${current.temp_F}°F), Feels like: ${current.FeelsLikeC}°C, Humidity: ${current.humidity}%, Wind: ${current.windspeedKmph} km/h.`;
    } catch (e: any) {
      return `Failed to fetch weather for ${location}: ${e.message}`;
    }
  }
};

const get_location_info: ToolDefinition = {
  name: 'get_location_info',
  description: 'Find geographic coordinates (latitude, longitude) and full address for a place name.',
  parameters: {
    type: 'object',
    properties: {
      place: { type: 'string', description: 'Name of the place, e.g. Eiffel Tower, Paris' }
    },
    required: ['place']
  },
  handler: async (args: any) => {
    const info = await geocode(args.place);
    if (!info) return `Could not find location information for: ${args.place}`;
    return JSON.stringify(info, null, 2);
  }
};

const calculate_distance: ToolDefinition = {
  name: 'calculate_distance',
  description: 'Calculate the distance between two places. If origin is omitted, uses the user\'s current known location.',
  parameters: {
    type: 'object',
    properties: {
      origin: { type: 'string', description: 'Starting point (optional if user shared location)' },
      destination: { type: 'string', description: 'Ending point' }
    },
    required: ['destination']
  },
  handler: async (args: any, context) => {
    let originLat: number, originLon: number, originName: string;

    if (!args.origin) {
      const loc = await getUserLocation(context.userId);
      if (!loc) return "Origin matches current location, but I don't know your current location yet. Please use /location or provide an origin.";
      originLat = loc.lat;
      originLon = loc.lon;
      originName = "Your Current Location";
    } else {
      const info = await geocode(args.origin);
      if (!info) return `Could not find origin location: ${args.origin}`;
      originLat = info.lat;
      originLon = info.lon;
      originName = info.display_name;
    }

    const destInfo = await geocode(args.destination);
    if (!destInfo) return `Could not find destination location: ${args.destination}`;

    const dist = haversineDistance(originLat, originLon, destInfo.lat, destInfo.lon);
    return JSON.stringify({
      origin: originName,
      destination: destInfo.display_name,
      distance_km: dist.toFixed(2),
      distance_miles: (dist * 0.621371).toFixed(2)
    }, null, 2);
  }
};

const search_nearby: ToolDefinition = {
  name: 'search_nearby',
  description: 'Search for nearby places (like pharmacies, restaurants, or parks) around the user\'s current location or a specific point.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Type of place to find, e.g. "pharmacy" or "pizza"' },
      location: { type: 'string', description: 'Optional place name to search around. If omitted, uses your current location.' }
    },
    required: ['query']
  },
  handler: async (args: any, context) => {
    let lat: number, lon: number, centerName: string;

    if (args.location && args.location.toLowerCase() !== 'current location') {
      const info = await geocode(args.location);
      if (!info) return `Could not find center location: ${args.location}`;
      lat = info.lat;
      lon = info.lon; centerName = info.display_name;
    } else {
      const loc = await getUserLocation(context.userId);
      if (!loc) return "Please provide a location or use /location first so I know where you are.";
      lat = loc.lat;
      lon = loc.lon; centerName = "Your Current Location";
    }

    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(args.query)}&lat=${lat}&lon=${lon}&addressdetails=1&limit=5`, {
        headers: { 'User-Agent': 'HeroTelegramAgent/1.0' }
      });
      if (!res.ok) {
        return `Search service currently unavailable (HTTP ${res.status}). Please try again later.`;
      }
      const data = await res.json() as any[];
      if (data.length === 0) return `No results found for "${args.query}" near ${centerName}.`;

      const results = data.map(item => ({
        name: item.display_name,
        type: item.type,
        distance_km: haversineDistance(lat, lon, parseFloat(item.lat), parseFloat(item.lon)).toFixed(2)
      }));

      return JSON.stringify({ center: centerName, results }, null, 2);
    } catch (e: any) {
      return `Search failed: ${e.message}`;
    }
  }
};

export const toolsMap = new Map<string, ToolDefinition>();

export function registerTool(tool: ToolDefinition) {
  toolsMap.set(tool.name, tool);
}

// Register default tools
registerTool(get_current_time);
registerTool(get_weather);
registerTool(get_location_info);
registerTool(calculate_distance);
registerTool(search_nearby);

export function getToolDefinitions() {
  return Array.from(toolsMap.values()).map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }
  }));
}

export async function executeTool(name: string, args: any, userId: string): Promise<string> {
  const tool = toolsMap.get(name);
  if (!tool) {
    return `Error: Tool ${name} not found.`;
  }
  try {
    const result = await tool.handler(args, { userId });
    return result;
  } catch (err: any) {
    return `Error executing ${name}: ${err.message}`;
  }
}
