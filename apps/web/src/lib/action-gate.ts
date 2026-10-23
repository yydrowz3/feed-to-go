export function createActionGate() {
  const pending = new Set<string>()
  return {
    async run(key: string, action: () => Promise<boolean>) {
      if (pending.has(key)) return false
      pending.add(key)
      try { return await action() } finally { pending.delete(key) }
    },
  }
}
