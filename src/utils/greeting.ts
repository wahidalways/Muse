/** Home's hello for the time of day, split around where the name goes ("Up late, Wahid?"). */
export function greetingParts(hour: number): { before: string; after: string } {
  if (hour < 5) return { before: 'Up late', after: '?' };
  return { before: hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening', after: '' };
}

/** The whole greeting as one string, with the listening name when there is one. */
export function greeting(hour: number, name: string): string {
  const { before, after } = greetingParts(hour);
  return name ? `${before}, ${name}${after}` : `${before}${after}`;
}
