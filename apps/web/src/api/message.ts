import type { ApiClient } from './client.ts'
import type { DirectMessage, ListMessagesResponse } from './types.ts'
import { listOrEmpty } from './normalize.ts'
export function createMessageApi(client: ApiClient) {
  return {
    send: (toId: number, content: string, signal?: AbortSignal) => client.postJson<DirectMessage>('/message/send', { to_id: toId, content }, { auth: 'required', signal }),
    async list(peerId: number, signal?: AbortSignal) {
      const result = await client.postJson<ListMessagesResponse>('/message/list', { peer_id: peerId }, { auth: 'required', signal })
      return { ...result, messages: listOrEmpty(result.messages) }
    },
  }
}
