export function parseNumberInput(value: string) {
  const trimmedValue = value.trim();
  if (trimmedValue === '') return undefined;

  const parsedValue = Number(trimmedValue);
  return Number.isFinite(parsedValue) ? parsedValue : undefined;
}

export function parseNumberInputOrZero(value: string) {
  return parseNumberInput(value) ?? 0;
}
