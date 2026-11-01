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
