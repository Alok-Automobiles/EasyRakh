export interface StableDatedRequest {
  fingerprint: string;
  key: string;
  date: string;
}

/** Keep the server-assigned business date stable while retrying the same action. */
export function stableDatedRequest(
  current: StableDatedRequest | null,
  fingerprint: string,
  date: string,
  createKey: () => string,
): StableDatedRequest {
  return current?.fingerprint === fingerprint
    ? current
    : { fingerprint, date, key: createKey() };
}
