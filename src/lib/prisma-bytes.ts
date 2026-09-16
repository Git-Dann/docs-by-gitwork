/**
 * Prisma's byte fields require an ArrayBuffer-backed Uint8Array. Some binary
 * libraries expose Buffer<ArrayBufferLike>, which may also describe shared
 * memory. Copying at the persistence boundary makes the ownership and type
 * explicit without changing the bytes that are stored.
 */
export function bytesForPrisma(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}
