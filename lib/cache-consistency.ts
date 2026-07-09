export const CACHE_WRITE_BARRIER_COOKIE = 'easyrakh_cache_write';
export const CACHE_WRITE_BARRIER_SECONDS = 15;

type CookieReader = {
  cookies: {
    get(name: string): { value: string } | undefined;
  };
};

export function hasRecentWriteBarrier(request: CookieReader): boolean {
  return request.cookies.get(CACHE_WRITE_BARRIER_COOKIE)?.value === '1';
}
