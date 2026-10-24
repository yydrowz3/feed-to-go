package mq

// Topic is shared by publisher initialization and consumer initialization.
type Topic struct{ Exchange, Queue, Binding string }

var (
	SocialTopic        = Topic{socialExchange, socialQueue, socialBindingKey}
	LikeTopic          = Topic{likeExchange, likeQueue, likeBindingKey}
	CommentTopic       = Topic{commentExchange, commentQueue, commentBindingKey}
	PopularityTopic    = Topic{popularityExchange, popularityQueue, popularityBindingKey}
	TimelineTopic      = Topic{timelineExchange, timelineQueue, timelineBindingKey}
	NotificationTopics = []Topic{
		{likeExchange, "notification.like", likeLikeRK},
		{commentExchange, "notification.comment", commentPublishRK},
		{socialExchange, "notification.social", socialFollowRK},
	}
)
