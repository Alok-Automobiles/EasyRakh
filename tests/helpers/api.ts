import { NextRequest } from 'next/server';

export function jsonRequest(url: string, body?: unknown, init?: RequestInit) {
  return new NextRequest(url, {
    method: body === undefined ? init?.method ?? 'GET' : init?.method ?? 'POST',
    body: body === undefined ? init?.body : JSON.stringify(body),
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
}

export function routeParams<T extends Record<string, string>>(params: T) {
  return { params: Promise.resolve(params) };
}

export const ids = {
  user: '507f1f77bcf86cd799439011',
  customer: '507f1f77bcf86cd799439012',
  supplier: '507f1f77bcf86cd799439013',
  customEntity: '507f1f77bcf86cd799439014',
  transaction: '507f1f77bcf86cd799439015',
  inventory: '507f1f77bcf86cd799439016',
  otherInventory: '507f1f77bcf86cd799439017',
};

export function objectIdLike(id: string) {
  return { toString: () => id };
}
