// A time zone in plain words (MOM-111, the quick path): "London time", not "Europe/London". The name a person knows is the city;
// the IANA name is what is saved and is shown only as small secondary text. A name with no city in it ("UTC", "Etc/GMT+5")
// has no plain form, so it is shown as it is. Pure.

// "America/Argentina/Buenos_Aires" gives "Buenos Aires". Null when the name has no city part.
export function zoneCity(zone: string): string | null {
  const parts = zone.split('/');
  if (parts.length < 2 || parts[0] === 'Etc') return null;
  const city = parts[parts.length - 1].replaceAll('_', ' ').trim();
  return city === '' ? null : city;
}

// "London time", or the name itself when it has no city.
export const zoneWords = (zone: string): string => {
  const city = zoneCity(zone);
  return city ? `${city} time` : zone;
};

// The name a person knows the zone by, from the platform's own list: "Pacific Time", "Central European Time". Always English, because the
// sentence it goes in is. Null when the platform has no such name (it answers "GMT-05:00" for an offset zone) or does not know the zone.
export function plainZoneName(zone: string): string | null {
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longGeneric' })
      .formatToParts(new Date(Date.UTC(2026, 0, 15)))
      .find((p) => p.type === 'timeZoneName');
    const name = part?.value ?? '';
    return name === '' || /^GMT([+-]|$)/.test(name) ? null : name;
  } catch {
    return null;
  }
}

// The playback line for the zone the person chose (MOM-167 part 8), the same in the conversation and on the quick path:
// "You're on Pacific Time."; a zone with no plain name but a city, "You're on Buenos Aires time."; neither, the id as it is.
export function zoneLine(zone: string): string {
  const name = plainZoneName(zone);
  if (name) return `You're on ${name}.`;
  const city = zoneCity(zone);
  return city ? `You're on ${city} time.` : `You're in the ${zone} time zone.`;
}
