// Shared weather-description → emoji mapping. Keys are English phrases;
// match against English text (NWS shortForecast, or the ZFP `shortEn`
// narrative) so translated strings still resolve to the right glyph.

export const weatherEmojiMap: Record<string, string> = {
  snow: "❄️",
  freezing: "🧊",
  sleet: "🧊",
  thunder: "⛈️",
  rain: "🌧️",
  "partly cloudy": "🌥️",
  "mostly cloudy": "🌥️",
  "partly sunny": "🌤️",
  "mostly sunny": "🌤️",
  sunny: "☀️",
  cloudy: "☁️",
  fog: "🌫️",
  clear: "🌕",
};

export function mapWeatherToEmoji(description: string): string {
  const lowerDesc = description.toLowerCase();
  for (const [key, emoji] of Object.entries(weatherEmojiMap)) {
    if (lowerDesc.includes(key)) {
      return emoji;
    }
  }
  return description;
}
