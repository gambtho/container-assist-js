declare module 'tar-fs' {
  import { ReadStream } from 'fs';

  interface TarOptions {
    entries?: string[];
    map?: (header: { name: string; [key: string]: unknown }) => {
      name: string;
      [key: string]: unknown;
    };
    ignore?: (name: string, header?: unknown) => boolean;
    [key: string]: unknown;
  }

  export function pack(source: string, opts?: TarOptions): ReadStream;
  export function extract(target: string, opts?: TarOptions): NodeJS.WritableStream;
}
