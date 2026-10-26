import { scryptSync, timingSafeEqual } from "node:crypto";

export function verifyPassword(password: string, storedHash: string) {
  const [algorithm, cost, blockSize, parallelization, salt, expectedHex] = storedHash.split("$");
  if (!algorithm || algorithm !== "scrypt" || !cost || !blockSize || !parallelization || !salt || !expectedHex) {
    return false;
  }

  try {
    const expected = Buffer.from(expectedHex, "hex");
    const actual = scryptSync(password, salt, expected.length, {
      N: Number(cost),
      r: Number(blockSize),
      p: Number(parallelization),
    });
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

