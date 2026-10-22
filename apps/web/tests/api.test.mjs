import test from 'node:test'
import assert from 'node:assert/strict'
import { createBusinessApi } from '../src/api/index.ts'
import { normalizeAccount } from '../src/api/normalize.ts'
function fixture(payloads = {}) {
  const calls = []
  const client = { postJson: async (path, body, options) => { calls.push({ path, body, ...options }); return payloads[path] ?? {} }, postForm: async (path, body, options) => { calls.push({ path, body, ...options }); return payloads[path] ?? {} } }
  return { api: createBusinessApi(client), calls }
}
test('social requests and responses match Go names and retain account profile', async () => {
  const account = { id: 2, username: '作者', avatar_url: '/static/avatar.png', bio: '介绍' }
  const { api, calls } = fixture({ '/social/getAllVloggers': { followings: [account], followings_count: 1 }, '/social/getAllFollowers': { followers: null, follower_count: 0 } })
  await api.social.follow(2); await api.social.unfollow(2)
  assert.deepEqual(calls.slice(0, 2).map(call => call.body), [{ following_id: 2 }, { following_id: 2 }])
  assert.deepEqual(await api.social.getAllVloggers(3), { followings: [account], followings_count: 1 })
  assert.deepEqual(calls.at(-1).body, { follower_id: 3 })
  assert.deepEqual(await api.social.getAllFollowers(2), { followers: [], follower_count: 0 })
  assert.deepEqual(calls.at(-1).body, { following_id: 2 })
  assert.ok(calls.every(call => call.auth === 'required'))
  assert.deepEqual(normalizeAccount(account), account)
})
test('null and missing lists become empty for every list domain', async () => {
  const { api } = fixture({ '/video/listByAUthorID': null, '/like/listMyLikedVideos': null, '/comment/listAll': null, '/message/list': { messages: null }, '/video/chunk/init': { uploaded_chunks: null } })
  assert.deepEqual(await api.video.listByAuthorID(1), [])
  assert.deepEqual(await api.like.listMyLikedVideos(), [])
  assert.deepEqual(await api.comment.listAll(1), [])
  assert.deepEqual((await api.message.list(1)).messages, [])
  assert.deepEqual((await api.feed.latest({ limit: 1, latest_time: 0 })).video_list, [])
  assert.deepEqual((await api.social.getAllVloggers()).followings, [])
  assert.deepEqual((await api.video.initChunkUpload({})).uploaded_chunks, [])
  assert.deepEqual((await api.video.chunkStatus('x')).uploaded_chunks, [])
})
test('feed cursors keep exact units and all fallback fields', async () => {
  const latest = { video_list: null, next_time: 1700000000123, has_more: true }
  const following = { video_list: null, next_time: 1700000000, has_more: true }
  const popular = { video_list: [], as_of: 8, next_offset: 20, has_more: true, next_latest_popularity: 0, next_latest_before: '2026-10-22T00:00:00Z', next_latest_id_before: 4 }
  const { api, calls } = fixture({ '/feed/listLatest': latest, '/feed/listByFollowing': following, '/feed/listByPopularity': popular })
  const signal = new AbortController().signal
  assert.equal((await api.feed.latest({ limit: 20, latest_time: latest.next_time }, signal)).next_time, latest.next_time)
  assert.equal((await api.feed.following({ limit: 20, latest_time: following.next_time }, signal)).next_time, following.next_time)
  const input = { limit: 20, as_of: 8, offset: 20, latest_popularity: 0, latest_before: popular.next_latest_before, latest_id_before: 4 }
  assert.deepEqual(await api.feed.popularity(input, signal), popular)
  assert.deepEqual(calls.at(-1).body, input); assert.ok(calls.every(call => call.signal === signal))
  assert.deepEqual(calls.map(call => call.auth), ['optional', 'required', 'optional'])
})
test('credential calls never refresh and public detail uses exact author-list route', async () => {
  const { api, calls } = fixture()
  await api.account.login('name', 'password'); await api.account.register('name', 'password'); await api.account.changePassword('name', 'old', 'new')
  assert.ok(calls.every(call => call.auth === 'none'))
  await api.video.listByAuthorID(7); assert.equal(calls.at(-1).path, '/video/listByAUthorID'); assert.deepEqual(calls.at(-1).body, { author_id: 7 })
  await api.video.getDetail(8); assert.equal(calls.at(-1).auth, 'none')
  await api.account.logout(); assert.equal(calls.at(-1).auth, 'required')
})
