export function rollDice(count: number, random: () => number = Math.random): number[] {
  return Array.from({ length: count }, () => Math.floor(random() * 6) + 1);
}
