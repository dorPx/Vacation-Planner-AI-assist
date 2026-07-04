import type { AxiosRequestConfig } from 'axios';

/** Builds the X-RapidAPI-* header pair every RapidAPI product needs, keyed to one host. */
export function rapidApiHeaders(host: string): AxiosRequestConfig['headers'] {
  return {
    'X-RapidAPI-Key': process.env.RAPIDAPI_KEY ?? '',
    'X-RapidAPI-Host': host,
  };
}
