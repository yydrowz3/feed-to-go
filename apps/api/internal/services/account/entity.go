package account

type Account struct {
	ID           uint   `gorm:"primaryKey" json:"id"`
	Username     string `gorm:"unique" json:"username"`
	Password     string `json:"-"`
	Token        string `json:"-"`
	RefreshToken string `json:"-"`
	AvatarURL    string `gorm:"type:varchar(512)" json:"avatar_url,omitempty"`
	Bio          string `gorm:"type:varchar(255)" json:"bio,omitempty"`
}

type CreateAccountRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

type RenameRequest struct {
	NewUsername string `json:"new_username" binding:"required"`
}

type FindByIDRequest struct {
	ID uint `json:"id" binding:"required"`
}

type FindByIDResponse struct {
	ID        uint   `json:"id"`
	Username  string `json:"username"`
	AvatarURL string `json:"avatar_url,omitempty"`
	Bio       string `json:"bio,omitempty"`
}

type FindByUsernameRequest struct {
	Username string `json:"username"`
}

type FindByUsernameResponse struct {
	ID       uint   `json:"id"`
	Username string `json:"username"`
}

type ChangePasswordRequest struct {
	Username    string `json:"username" binding:"required"`
	OldPassword string `json:"old_password" binding:"required"`
	NewPassword string `json:"new_password" binding:"required"`
}

type LoginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

type LoginResponse struct {
	Token        string `json:"token"`
	RefreshToken string `json:"refresh_token"`
	AccountID    uint   `json:"account_id"`
	Username     string `json:"username"`
}

type UpdateProfileRequest struct {
	AvatarURL string `json:"avatar_url"`
	Bio       string `json:"bio"`
}

type RefreshRequest struct {
	RefreshToken string `json:"refresh_token" binding:"required"`
}

type GetProfileRequest struct {
	AccountID uint `json:"account_id" binding:"required"`
}

type GetProfileResponse struct {
	Account        FindByIDResponse `json:"account"`
	VideoCount     int64            `json:"video_count"`
	TotalLikes     int64            `json:"total_likes"`
	FollowerCount  int64            `json:"follower_count"`
	FollowingCount int64            `json:"following_count"`
}
