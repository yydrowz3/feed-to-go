import type { Account } from "../../api/types.ts";

export function mergeContacts(
  viewerId: number,
  followings: Account[] = [],
  followers: Account[] = [],
) {
  const contacts = new Map<number, Account>();
  for (const account of [...followings, ...followers]) {
    if (account.id !== viewerId && !contacts.has(account.id)) contacts.set(account.id, account);
  }
  return [...contacts.values()];
}
