declare module 'tar-fs' {
  import { ReadStream } from 'fs';

  export function pack(source: string, opts?: any): ReadStream;
  export function extract(target: string, opts?: any): NodeJS.WritableStream;
}
