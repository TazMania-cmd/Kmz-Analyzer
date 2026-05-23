const EARTH_RADIUS_METERS = 6371008.8;

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

export function haversineMeters(from: [number, number], to: [number, number]): number {
  const [lon1, lat1] = from;
  const [lon2, lat2] = to;
  const deltaLat = toRadians(lat2 - lat1);
  const deltaLon = toRadians(lon2 - lon1);
  const radiansLat1 = toRadians(lat1);
  const radiansLat2 = toRadians(lat2);

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(radiansLat1) * Math.cos(radiansLat2) * Math.sin(deltaLon / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function lineLengthMeters(coordinates: Array<[number, number]>): number {
  return coordinates.reduce((total, coordinate, index) => {
    if (index === 0) return total;
    return total + haversineMeters(coordinates[index - 1], coordinate);
  }, 0);
}

export function polygonAreaSquareMeters(coordinates: Array<[number, number]>): number {
  if (coordinates.length < 3) return 0;

  const closedCoordinates = coordinatesEqual(coordinates[0], coordinates[coordinates.length - 1])
    ? coordinates
    : [...coordinates, coordinates[0]];

  const area = closedCoordinates.slice(0, -1).reduce((total, coordinate, index) => {
    const next = closedCoordinates[index + 1];
    const lon1 = toRadians(coordinate[0]);
    const lon2 = toRadians(next[0]);
    const lat1 = toRadians(coordinate[1]);
    const lat2 = toRadians(next[1]);

    return total + (lon2 - lon1) * (2 + Math.sin(lat1) + Math.sin(lat2));
  }, 0);

  return Math.abs((area * EARTH_RADIUS_METERS * EARTH_RADIUS_METERS) / 2);
}

function coordinatesEqual(a: [number, number], b: [number, number]): boolean {
  return a[0] === b[0] && a[1] === b[1];
}
