const MASK_64 = (1n << 64n) - 1n

export function splitmix64(seed: bigint): () => bigint {
  let state = seed & MASK_64
  return () => {
    state = (state + 0x9e3779b97f4a7c15n) & MASK_64
    let z = state
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK_64
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK_64
    return z ^ (z >> 31n)
  }
}
