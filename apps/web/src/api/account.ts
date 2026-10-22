import type { ApiClient } from './client.ts'
import type { Account, MessageResponse, ProfileResponse, TokenResponse } from './types.ts'
import { normalizeAccount } from './normalize.ts'
export function createAccountApi(client: ApiClient) {
  return {
    login: (username: string, password: string, signal?: AbortSignal) => client.postJson<TokenResponse>('/account/login', { username, password }, { auth: 'none', signal }),
    register: (username: string, password: string, signal?: AbortSignal) => client.postJson<MessageResponse>('/account/register', { username, password }, { auth: 'none', signal }),
    changePassword: (username: string, oldPassword: string, newPassword: string, signal?: AbortSignal) => client.postJson<MessageResponse>('/account/changePassword', { username, old_password: oldPassword, new_password: newPassword }, { auth: 'none', signal }),
    logout: (signal?: AbortSignal) => client.postJson<MessageResponse>('/account/logout', {}, { auth: 'required', signal }),
    rename: (newUsername: string, signal?: AbortSignal) => client.postJson<TokenResponse>('/account/rename', { new_username: newUsername }, { auth: 'required', signal }),
    async findByID(id: number, signal?: AbortSignal) { return normalizeAccount(await client.postJson<Account>('/account/findByID', { id }, { auth: 'none', signal })) },
    async getProfile(accountId: number, signal?: AbortSignal) {
      const result = await client.postJson<ProfileResponse>('/account/getProfile', { account_id: accountId }, { auth: 'none', signal })
      return { ...result, account: normalizeAccount(result.account) }
    },
  }
}
