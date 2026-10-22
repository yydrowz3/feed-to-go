export type MessageResponse = { message: string }
export type TokenResponse = { token: string; refresh_token?: string; account_id?: number; username?: string }
export type Account = { id: number; username: string; avatar_url?: string; bio?: string }
export type Video = {
  id: number; author_id: number; username: string; title: string; description?: string
  play_url: string; cover_url: string; create_time: string; likes_count: number; popularity?: number
}
export type Comment = { id: number; username: string; video_id: number; author_id: number; content: string; created_at: string }
export type DirectMessage = { id: number; from_id: number; to_id: number; content: string; is_read: boolean; created_at: string }
export type FeedAuthor = { id: number; username: string }
export type FeedVideoItem = {
  id: number; author: FeedAuthor; title: string; description?: string; play_url: string; cover_url: string
  /** Unix seconds; unlike latest-feed next_time (milliseconds). */
  create_time: number; likes_count: number; is_liked: boolean
}
export type ListLatestResponse = { video_list: FeedVideoItem[]; next_time: number; has_more: boolean }
export type ListByFollowingResponse = { video_list: FeedVideoItem[]; next_time: number; has_more: boolean }
export type ListLikesCountResponse = { video_list: FeedVideoItem[]; next_likes_count_before?: number; next_id_before?: number; has_more: boolean }
export type ListByPopularityResponse = {
  video_list: FeedVideoItem[]; as_of: number; next_offset: number; has_more: boolean
  next_latest_popularity?: number; next_latest_before?: string; next_latest_id_before?: number
}
export type LatestInput = { limit: number; latest_time: number }
export type LikesCountInput = { limit: number; likes_count_before?: number; id_before?: number }
export type PopularityInput = { limit: number; as_of: number; offset: number; latest_popularity?: number; latest_before?: string; latest_id_before?: number }
export type IsLikedResponse = { is_liked: boolean }
export type GetAllFollowersResponse = { followers: Account[]; follower_count: number }
export type GetAllFollowingsResponse = { followings: Account[]; followings_count: number }
export type SocialCounts = { follower_count: number; following_count: number }
export type ProfileResponse = { account: Account; video_count: number; total_likes: number; follower_count: number; following_count: number }
export type ListMessagesResponse = { messages: DirectMessage[] }
export type PublishInput = { title: string; description: string; play_url: string; cover_url: string }
export type UploadResponse = { url: string; play_url?: string; cover_url?: string }
export type InitChunkInput = { filename: string; file_size: number; chunk_size: number; total_chunks: number; file_hash: string }
export type InitChunkResponse = { upload_id: string; uploaded_chunks: number[] }
export type ChunkStatusResponse = InitChunkResponse & { total_chunks: number }
