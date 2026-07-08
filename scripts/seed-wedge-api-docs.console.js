(async () => {
  const content = {
  "title": "Big Wedge Golf API",
  "schemaPath": "/api/v1/schema/",
  "environment": "PRODUCTION",
  "specVersion": "OAS 3.0.3",
  "description": "REST API for the Big Wedge Golf application (v1). JWT bearer auth on all app endpoints; the /api/v1/external/* namespace is public (read-only reference data). Generated from the live OpenAPI schema.",
  "websiteLabel": "Big Wedge Golf",
  "websiteUrl": "https://bigwedgegolf.com",
  "servers": [
    {
      "url": "https://apiv1.bigwedgegolf.com",
      "label": "PRODUCTION"
    }
  ],
  "endpoints": [
    {
      "tag": "analytics",
      "method": "GET",
      "path": "/api/v1/analytics/overall-report/",
      "operationId": "analytics_overall_report_retrieve",
      "auth": true,
      "summary": "API View to return overall and monthly/filtered analytics reports."
    },
    {
      "tag": "auth",
      "method": "POST",
      "path": "/api/v1/auth/login/",
      "operationId": "auth_login_create",
      "auth": false,
      "summary": "Check the credentials and return the REST Token"
    },
    {
      "tag": "auth",
      "method": "POST",
      "path": "/api/v1/auth/logout/",
      "operationId": "auth_logout_create",
      "auth": true,
      "summary": "Calls Django logout method and delete the Token object"
    },
    {
      "tag": "auth",
      "method": "POST",
      "path": "/api/v1/auth/password/reset/",
      "operationId": "auth_password_reset_create",
      "auth": false,
      "summary": "Send password reset verification code"
    },
    {
      "tag": "auth",
      "method": "POST",
      "path": "/api/v1/auth/password/reset/complete/",
      "operationId": "auth_password_reset_complete_create",
      "auth": false,
      "summary": "Complete password reset with verified code"
    },
    {
      "tag": "auth",
      "method": "POST",
      "path": "/api/v1/auth/password/reset/confirm/",
      "operationId": "auth_password_reset_confirm_create",
      "auth": false,
      "summary": "Verify password reset code"
    },
    {
      "tag": "auth",
      "method": "POST",
      "path": "/api/v1/auth/password/reset/resend/",
      "operationId": "auth_password_reset_resend_create",
      "auth": false,
      "summary": "Resend password reset verification code"
    },
    {
      "tag": "auth",
      "method": "POST",
      "path": "/api/v1/auth/token/refresh/",
      "operationId": "auth_token_refresh_create",
      "auth": false,
      "summary": "Takes a refresh type JSON web token and returns an access type JSON web"
    },
    {
      "tag": "auth",
      "method": "POST",
      "path": "/api/v1/auth/token/verify/",
      "operationId": "auth_token_verify_create",
      "auth": false,
      "summary": "Takes a token and indicates if it is valid.  This view provides no"
    },
    {
      "tag": "auth",
      "method": "GET",
      "path": "/api/v1/auth/user/",
      "operationId": "auth_user_retrieve",
      "auth": true,
      "summary": "Reads and updates UserModel fields"
    },
    {
      "tag": "auth",
      "method": "PATCH",
      "path": "/api/v1/auth/user/",
      "operationId": "auth_user_partial_update",
      "auth": true,
      "summary": "Reads and updates UserModel fields"
    },
    {
      "tag": "auth",
      "method": "PUT",
      "path": "/api/v1/auth/user/",
      "operationId": "auth_user_update",
      "auth": true,
      "summary": "Reads and updates UserModel fields"
    },
    {
      "tag": "auth",
      "method": "DELETE",
      "path": "/api/v1/auth/user/delete/",
      "operationId": "auth_user_delete_destroy",
      "auth": true,
      "summary": ""
    },
    {
      "tag": "auth",
      "method": "GET",
      "path": "/api/v1/auth/user/details/",
      "operationId": "get_user_details",
      "auth": true,
      "summary": "Get user details"
    },
    {
      "tag": "auth",
      "method": "PATCH",
      "path": "/api/v1/auth/user/details/",
      "operationId": "partial_update_user",
      "auth": true,
      "summary": "Partially update user profile"
    },
    {
      "tag": "auth",
      "method": "PUT",
      "path": "/api/v1/auth/user/details/",
      "operationId": "full_update_user",
      "auth": true,
      "summary": "Fully update user profile"
    },
    {
      "tag": "bags",
      "method": "GET",
      "path": "/api/v1/bags/club-types/",
      "operationId": "bags_club_types_list",
      "auth": true,
      "summary": "List instances with standardized response"
    },
    {
      "tag": "bags",
      "method": "POST",
      "path": "/api/v1/bags/club-types/",
      "operationId": "bags_club_types_create",
      "auth": true,
      "summary": "Override create to provide standardized response"
    },
    {
      "tag": "bags",
      "method": "GET",
      "path": "/api/v1/bags/club-types/{id}/",
      "operationId": "bags_club_types_retrieve",
      "auth": true,
      "summary": "Retrieve an instance with standardized response"
    },
    {
      "tag": "bags",
      "method": "PUT",
      "path": "/api/v1/bags/club-types/{id}/",
      "operationId": "bags_club_types_update",
      "auth": true,
      "summary": "Override update to provide standardized response"
    },
    {
      "tag": "bags",
      "method": "DELETE",
      "path": "/api/v1/bags/club-types/{id}/",
      "operationId": "bags_club_types_destroy",
      "auth": true,
      "summary": "Override destroy to provide standardized response"
    },
    {
      "tag": "bags",
      "method": "GET",
      "path": "/api/v1/bags/clubs/",
      "operationId": "bags_clubs_list",
      "auth": true,
      "summary": "Override list to provide standardized response"
    },
    {
      "tag": "bags",
      "method": "POST",
      "path": "/api/v1/bags/clubs/",
      "operationId": "bags_clubs_create",
      "auth": true,
      "summary": "Add a new golf club to bag"
    },
    {
      "tag": "bags",
      "method": "GET",
      "path": "/api/v1/bags/clubs/{id}/",
      "operationId": "bags_clubs_retrieve",
      "auth": true,
      "summary": "Override retrieve to provide standardized response"
    },
    {
      "tag": "bags",
      "method": "PATCH",
      "path": "/api/v1/bags/clubs/{id}/",
      "operationId": "bags_clubs_partial_update",
      "auth": true,
      "summary": "ViewSet for managing a user's golf club sticks (BagClubs)."
    },
    {
      "tag": "bags",
      "method": "PUT",
      "path": "/api/v1/bags/clubs/{id}/",
      "operationId": "bags_clubs_update",
      "auth": true,
      "summary": "Update an instance with standardized response"
    },
    {
      "tag": "bags",
      "method": "DELETE",
      "path": "/api/v1/bags/clubs/{id}/",
      "operationId": "bags_clubs_destroy",
      "auth": true,
      "summary": "Delete an instance with standardized response"
    },
    {
      "tag": "broadcasts",
      "method": "GET",
      "path": "/api/v1/broadcasts/",
      "operationId": "broadcasts_list",
      "auth": true,
      "summary": "Override list to provide standardized response"
    },
    {
      "tag": "broadcasts",
      "method": "POST",
      "path": "/api/v1/broadcasts/",
      "operationId": "broadcasts_create",
      "auth": true,
      "summary": "Create and potentially schedule a broadcast notification"
    },
    {
      "tag": "broadcasts",
      "method": "GET",
      "path": "/api/v1/broadcasts/{id}/",
      "operationId": "broadcasts_retrieve",
      "auth": true,
      "summary": "Override retrieve to provide standardized response"
    },
    {
      "tag": "broadcasts",
      "method": "PATCH",
      "path": "/api/v1/broadcasts/{id}/",
      "operationId": "broadcasts_partial_update",
      "auth": true,
      "summary": "Admin ViewSet for managing broadcast notifications"
    },
    {
      "tag": "broadcasts",
      "method": "PUT",
      "path": "/api/v1/broadcasts/{id}/",
      "operationId": "broadcasts_update",
      "auth": true,
      "summary": "Update an instance with standardized response"
    },
    {
      "tag": "broadcasts",
      "method": "DELETE",
      "path": "/api/v1/broadcasts/{id}/",
      "operationId": "broadcasts_destroy",
      "auth": true,
      "summary": "Delete an instance with standardized response"
    },
    {
      "tag": "broadcasts",
      "method": "POST",
      "path": "/api/v1/broadcasts/{id}/cancel/",
      "operationId": "broadcasts_cancel_create",
      "auth": true,
      "summary": "Cancel a scheduled broadcast"
    },
    {
      "tag": "broadcasts",
      "method": "GET",
      "path": "/api/v1/broadcasts/estimate/",
      "operationId": "broadcasts_estimate_retrieve",
      "auth": true,
      "summary": "Estimate the number of users matching the filters"
    },
    {
      "tag": "clubhouse",
      "method": "GET",
      "path": "/api/v1/clubhouse/current-room/",
      "operationId": "clubhouse_current_room_retrieve",
      "auth": true,
      "summary": "Get current active room details"
    },
    {
      "tag": "clubhouse",
      "method": "GET",
      "path": "/api/v1/clubhouse/home-course/",
      "operationId": "clubhouse_home_course_retrieve",
      "auth": true,
      "summary": "Get home course + associated club details for the authenticated user"
    },
    {
      "tag": "clubhouse",
      "method": "POST",
      "path": "/api/v1/clubhouse/home-course/",
      "operationId": "clubhouse_home_course_create",
      "auth": true,
      "summary": "Set/Update home course for the authenticated user"
    },
    {
      "tag": "clubhouse",
      "method": "GET",
      "path": "/api/v1/clubhouse/nearest-club/",
      "operationId": "clubhouse_nearest_club_retrieve",
      "auth": true,
      "summary": "Get nearest golf club based on location"
    },
    {
      "tag": "clubhouse",
      "method": "GET",
      "path": "/api/v1/clubhouse/stats/",
      "operationId": "clubhouse_stats_retrieve",
      "auth": true,
      "summary": "Get comprehensive user statistics"
    },
    {
      "tag": "clubs",
      "method": "GET",
      "path": "/api/v1/clubs/",
      "operationId": "clubs_list",
      "auth": true,
      "summary": "Cached list view for clubs"
    },
    {
      "tag": "clubs",
      "method": "POST",
      "path": "/api/v1/clubs/",
      "operationId": "clubs_create",
      "auth": true,
      "summary": "Override create to provide standardized response"
    },
    {
      "tag": "clubs",
      "method": "GET",
      "path": "/api/v1/clubs/{id}/",
      "operationId": "clubs_retrieve",
      "auth": true,
      "summary": "Cached retrieve view for club details"
    },
    {
      "tag": "clubs",
      "method": "PUT",
      "path": "/api/v1/clubs/{id}/",
      "operationId": "clubs_update",
      "auth": true,
      "summary": "Override update to provide standardized response"
    },
    {
      "tag": "clubs",
      "method": "DELETE",
      "path": "/api/v1/clubs/{id}/",
      "operationId": "clubs_destroy",
      "auth": true,
      "summary": "Override destroy to provide standardized response"
    },
    {
      "tag": "countries",
      "method": "GET",
      "path": "/api/v1/countries/",
      "operationId": "countries_list",
      "auth": true,
      "summary": "List all countries"
    },
    {
      "tag": "countries",
      "method": "GET",
      "path": "/api/v1/countries/{id}/",
      "operationId": "countries_retrieve",
      "auth": true,
      "summary": "Get country details"
    },
    {
      "tag": "course-requests",
      "method": "GET",
      "path": "/api/v1/course-requests/",
      "operationId": "course_requests_list",
      "auth": true,
      "summary": "List course requests"
    },
    {
      "tag": "course-requests",
      "method": "POST",
      "path": "/api/v1/course-requests/",
      "operationId": "course_requests_create",
      "auth": true,
      "summary": "Create course request"
    },
    {
      "tag": "course-requests",
      "method": "GET",
      "path": "/api/v1/course-requests/{id}/",
      "operationId": "course_requests_retrieve",
      "auth": true,
      "summary": "Get course request details"
    },
    {
      "tag": "courses",
      "method": "GET",
      "path": "/api/v1/courses/",
      "operationId": "courses_list",
      "auth": true,
      "summary": "List courses with GPS data"
    },
    {
      "tag": "courses",
      "method": "POST",
      "path": "/api/v1/courses/",
      "operationId": "courses_create",
      "auth": true,
      "summary": "Override create to provide standardized response"
    },
    {
      "tag": "courses",
      "method": "GET",
      "path": "/api/v1/courses/{id}/",
      "operationId": "courses_retrieve",
      "auth": true,
      "summary": "Cached retrieve view for course details"
    },
    {
      "tag": "courses",
      "method": "PUT",
      "path": "/api/v1/courses/{id}/",
      "operationId": "courses_update",
      "auth": true,
      "summary": "Override update to provide standardized response"
    },
    {
      "tag": "courses",
      "method": "DELETE",
      "path": "/api/v1/courses/{id}/",
      "operationId": "courses_destroy",
      "auth": true,
      "summary": "Override destroy to provide standardized response"
    },
    {
      "tag": "courses",
      "method": "GET",
      "path": "/api/v1/courses/{id}/coordinates/",
      "operationId": "courses_coordinates_retrieve",
      "auth": true,
      "summary": "Get course coordinates in array format for mobile app usage"
    },
    {
      "tag": "courses",
      "method": "GET",
      "path": "/api/v1/courses/{id}/holes/{hole_id}/",
      "operationId": "courses_holes_retrieve",
      "auth": true,
      "summary": "Get detailed information for a specific hole within a course."
    },
    {
      "tag": "external",
      "method": "GET",
      "path": "/api/v1/external/clubs/",
      "operationId": "external_clubs_list",
      "auth": false,
      "summary": "Returns a list of clubs with filtering and pagination."
    },
    {
      "tag": "external",
      "method": "GET",
      "path": "/api/v1/external/countries/",
      "operationId": "external_countries_retrieve",
      "auth": false,
      "summary": "Returns a distinct list of countries from the Club model."
    },
    {
      "tag": "external",
      "method": "GET",
      "path": "/api/v1/external/course-points/",
      "operationId": "external_course_points_list",
      "auth": false,
      "summary": "Returns a paginated list of GPS course points for a given course."
    },
    {
      "tag": "external",
      "method": "GET",
      "path": "/api/v1/external/courses/",
      "operationId": "external_courses_list",
      "auth": false,
      "summary": "Returns a paginated list of courses with filtering."
    },
    {
      "tag": "external",
      "method": "GET",
      "path": "/api/v1/external/courses/{id}/",
      "operationId": "external_courses_retrieve",
      "auth": false,
      "summary": "Returns a single course with nested holes, tees, and tee lengths."
    },
    {
      "tag": "external",
      "method": "GET",
      "path": "/api/v1/external/holes/",
      "operationId": "external_holes_list",
      "auth": false,
      "summary": "Returns a paginated list of holes for a given course."
    },
    {
      "tag": "external",
      "method": "GET",
      "path": "/api/v1/external/states/",
      "operationId": "external_states_retrieve",
      "auth": false,
      "summary": "Returns a distinct list of states/provinces for a given country."
    },
    {
      "tag": "external",
      "method": "GET",
      "path": "/api/v1/external/tees/",
      "operationId": "external_tees_list",
      "auth": false,
      "summary": "Returns a paginated list of tees for a given course."
    },
    {
      "tag": "feature-flags",
      "method": "GET",
      "path": "/api/v1/feature-flags/",
      "operationId": "get_feature_flags",
      "auth": true,
      "summary": "Get feature flags"
    },
    {
      "tag": "feature-flags",
      "method": "GET",
      "path": "/api/v1/feature-flags/admin/",
      "operationId": "admin_list_feature_flags",
      "auth": true,
      "summary": "List all feature flags (Admin)"
    },
    {
      "tag": "feature-flags",
      "method": "POST",
      "path": "/api/v1/feature-flags/admin/",
      "operationId": "admin_create_feature_flag",
      "auth": true,
      "summary": "Create a new feature flag (Admin)"
    },
    {
      "tag": "feature-flags",
      "method": "GET",
      "path": "/api/v1/feature-flags/admin/{name}/",
      "operationId": "admin_get_feature_flag",
      "auth": true,
      "summary": "Get a feature flag (Admin)"
    },
    {
      "tag": "feature-flags",
      "method": "PATCH",
      "path": "/api/v1/feature-flags/admin/{name}/",
      "operationId": "admin_update_feature_flag",
      "auth": true,
      "summary": "Update a feature flag (Admin)"
    },
    {
      "tag": "feature-flags",
      "method": "DELETE",
      "path": "/api/v1/feature-flags/admin/{name}/",
      "operationId": "admin_delete_feature_flag",
      "auth": true,
      "summary": "Delete a feature flag (Admin)"
    },
    {
      "tag": "feature-flags",
      "method": "POST",
      "path": "/api/v1/feature-flags/admin/{name}/toggle/",
      "operationId": "admin_toggle_feature_flag",
      "auth": true,
      "summary": "Toggle a feature flag (Admin)"
    },
    {
      "tag": "feedback",
      "method": "GET",
      "path": "/api/v1/feedback/",
      "operationId": "feedback_list",
      "auth": true,
      "summary": "List all feedback"
    },
    {
      "tag": "feedback",
      "method": "POST",
      "path": "/api/v1/feedback/",
      "operationId": "feedback_create",
      "auth": true,
      "summary": "Submit feedback with multiple images"
    },
    {
      "tag": "feedback",
      "method": "GET",
      "path": "/api/v1/feedback/{id}/",
      "operationId": "feedback_retrieve",
      "auth": true,
      "summary": "Get feedback details"
    },
    {
      "tag": "feedback",
      "method": "PATCH",
      "path": "/api/v1/feedback/{id}/",
      "operationId": "feedback_partial_update",
      "auth": true,
      "summary": "Partially update feedback"
    },
    {
      "tag": "feedback",
      "method": "PUT",
      "path": "/api/v1/feedback/{id}/",
      "operationId": "feedback_update",
      "auth": true,
      "summary": "Update feedback"
    },
    {
      "tag": "feedback",
      "method": "DELETE",
      "path": "/api/v1/feedback/{id}/",
      "operationId": "feedback_destroy",
      "auth": true,
      "summary": "Delete feedback"
    },
    {
      "tag": "feedback",
      "method": "GET",
      "path": "/api/v1/feedback/stats/",
      "operationId": "feedback_stats_retrieve",
      "auth": true,
      "summary": "Get feedback statistics"
    },
    {
      "tag": "Friends",
      "method": "GET",
      "path": "/api/v1/friends/",
      "operationId": "friends_list",
      "auth": true,
      "summary": "List all friends"
    },
    {
      "tag": "Friends",
      "method": "POST",
      "path": "/api/v1/friends/",
      "operationId": "friends_create",
      "auth": true,
      "summary": "Override create to provide standardized response"
    },
    {
      "tag": "Friends",
      "method": "GET",
      "path": "/api/v1/friends/{id}/",
      "operationId": "friends_retrieve",
      "auth": true,
      "summary": "Override retrieve to provide standardized response"
    },
    {
      "tag": "Friends",
      "method": "PATCH",
      "path": "/api/v1/friends/{id}/",
      "operationId": "friends_partial_update",
      "auth": true,
      "summary": "ViewSet for managing friend lists"
    },
    {
      "tag": "Friends",
      "method": "PUT",
      "path": "/api/v1/friends/{id}/",
      "operationId": "friends_update",
      "auth": true,
      "summary": "Override update to provide standardized response"
    },
    {
      "tag": "Friends",
      "method": "DELETE",
      "path": "/api/v1/friends/{id}/",
      "operationId": "friends_destroy",
      "auth": true,
      "summary": "Remove friend"
    },
    {
      "tag": "Friends",
      "method": "POST",
      "path": "/api/v1/friends/{id}/accept-request/",
      "operationId": "friends_accept_request_create",
      "auth": true,
      "summary": "Accept friend request"
    },
    {
      "tag": "Friends",
      "method": "POST",
      "path": "/api/v1/friends/{id}/decline-request/",
      "operationId": "friends_decline_request_create",
      "auth": true,
      "summary": "Decline friend request"
    },
    {
      "tag": "Friends",
      "method": "POST",
      "path": "/api/v1/friends/add-direct/",
      "operationId": "friends_add_direct_create",
      "auth": true,
      "summary": "Add friend directly"
    },
    {
      "tag": "Friends",
      "method": "GET",
      "path": "/api/v1/friends/requests/",
      "operationId": "friends_requests_list",
      "auth": true,
      "summary": "List received friend requests"
    },
    {
      "tag": "Friends",
      "method": "POST",
      "path": "/api/v1/friends/send-request/",
      "operationId": "friends_send_request_create",
      "auth": true,
      "summary": "Send friend request"
    },
    {
      "tag": "Friends",
      "method": "GET",
      "path": "/api/v1/friends/sent-requests/",
      "operationId": "friends_sent_requests_list",
      "auth": true,
      "summary": "List sent friend requests"
    },
    {
      "tag": "guests",
      "method": "GET",
      "path": "/api/v1/guests/",
      "operationId": "guests_list",
      "auth": true,
      "summary": "ViewSet for managing guest players"
    },
    {
      "tag": "guests",
      "method": "POST",
      "path": "/api/v1/guests/",
      "operationId": "guests_create",
      "auth": true,
      "summary": "ViewSet for managing guest players"
    },
    {
      "tag": "guests",
      "method": "GET",
      "path": "/api/v1/guests/{id}/",
      "operationId": "guests_retrieve",
      "auth": true,
      "summary": "ViewSet for managing guest players"
    },
    {
      "tag": "guests",
      "method": "PATCH",
      "path": "/api/v1/guests/{id}/",
      "operationId": "guests_partial_update",
      "auth": true,
      "summary": "ViewSet for managing guest players"
    },
    {
      "tag": "guests",
      "method": "PUT",
      "path": "/api/v1/guests/{id}/",
      "operationId": "guests_update",
      "auth": true,
      "summary": "ViewSet for managing guest players"
    },
    {
      "tag": "guests",
      "method": "DELETE",
      "path": "/api/v1/guests/{id}/",
      "operationId": "guests_destroy",
      "auth": true,
      "summary": "ViewSet for managing guest players"
    },
    {
      "tag": "handicap",
      "method": "POST",
      "path": "/api/v1/handicap/calculate/",
      "operationId": "handicap_calculate_create",
      "auth": true,
      "summary": "Recalculate the authenticated player's Handicap Index"
    },
    {
      "tag": "handicap",
      "method": "GET",
      "path": "/api/v1/handicap/leaderboard/",
      "operationId": "handicap_leaderboard_retrieve",
      "auth": true,
      "summary": "API view for the handicap leaderboard."
    },
    {
      "tag": "handicap",
      "method": "GET",
      "path": "/api/v1/handicap/leaderboard/club/{club_id}/",
      "operationId": "handicap_leaderboard_club_retrieve",
      "auth": true,
      "summary": "API view for the club-specific handicap leaderboard."
    },
    {
      "tag": "notification-preferences",
      "method": "GET",
      "path": "/api/v1/notification-preferences/",
      "operationId": "notification_preferences_list",
      "auth": true,
      "summary": "Get user's notification preferences"
    },
    {
      "tag": "notification-preferences",
      "method": "GET",
      "path": "/api/v1/notification-preferences/{id}/",
      "operationId": "notification_preferences_retrieve",
      "auth": true,
      "summary": "Override retrieve to provide standardized response"
    },
    {
      "tag": "notification-preferences",
      "method": "PATCH",
      "path": "/api/v1/notification-preferences/{id}/",
      "operationId": "notification_preferences_partial_update",
      "auth": true,
      "summary": "ViewSet for notification preferences"
    },
    {
      "tag": "notification-preferences",
      "method": "PUT",
      "path": "/api/v1/notification-preferences/{id}/",
      "operationId": "notification_preferences_update",
      "auth": true,
      "summary": "Update notification preferences"
    },
    {
      "tag": "notifications",
      "method": "GET",
      "path": "/api/v1/notifications/",
      "operationId": "notifications_list",
      "auth": true,
      "summary": "List user's notifications"
    },
    {
      "tag": "notifications",
      "method": "POST",
      "path": "/api/v1/notifications/",
      "operationId": "notifications_create",
      "auth": true,
      "summary": "Override create to provide standardized response"
    },
    {
      "tag": "notifications",
      "method": "GET",
      "path": "/api/v1/notifications/{id}/",
      "operationId": "notifications_retrieve",
      "auth": true,
      "summary": "Override retrieve to provide standardized response"
    },
    {
      "tag": "notifications",
      "method": "PUT",
      "path": "/api/v1/notifications/{id}/",
      "operationId": "notifications_update",
      "auth": true,
      "summary": "Override update to provide standardized response"
    },
    {
      "tag": "notifications",
      "method": "DELETE",
      "path": "/api/v1/notifications/{id}/",
      "operationId": "notifications_destroy",
      "auth": true,
      "summary": "Override destroy to provide standardized response"
    },
    {
      "tag": "notifications",
      "method": "POST",
      "path": "/api/v1/notifications/{id}/mark-read/",
      "operationId": "notifications_mark_read_create",
      "auth": true,
      "summary": "Mark notification as read"
    },
    {
      "tag": "notifications",
      "method": "POST",
      "path": "/api/v1/notifications/mark-all-read/",
      "operationId": "notifications_mark_all_read_create",
      "auth": true,
      "summary": "Mark all notifications as read"
    },
    {
      "tag": "notifications",
      "method": "GET",
      "path": "/api/v1/notifications/unread-count/",
      "operationId": "notifications_unread_count_retrieve",
      "auth": true,
      "summary": "Get count of unread notifications"
    },
    {
      "tag": "players",
      "method": "GET",
      "path": "/api/v1/players/{player_id}/handicap-status/",
      "operationId": "players_handicap_status_retrieve",
      "auth": true,
      "summary": "Get handicap status for a specific RoundPlayer ID"
    },
    {
      "tag": "push-token",
      "method": "POST",
      "path": "/api/v1/push-token/",
      "operationId": "push_token_create",
      "auth": true,
      "summary": "Register or update user's push token"
    },
    {
      "tag": "push-token",
      "method": "DELETE",
      "path": "/api/v1/push-token/",
      "operationId": "push_token_destroy",
      "auth": true,
      "summary": "Remove user's push token"
    },
    {
      "tag": "registration",
      "method": "POST",
      "path": "/api/v1/registration/",
      "operationId": "registration_create",
      "auth": false,
      "summary": "Handle user registration"
    },
    {
      "tag": "registration",
      "method": "POST",
      "path": "/api/v1/registration/resend/",
      "operationId": "registration_resend_create",
      "auth": false,
      "summary": "Resend verification code"
    },
    {
      "tag": "registration",
      "method": "POST",
      "path": "/api/v1/registration/verify/",
      "operationId": "registration_verify_create",
      "auth": false,
      "summary": "Verify email with code"
    },
    {
      "tag": "Room Invites",
      "method": "GET",
      "path": "/api/v1/room-invites/",
      "operationId": "room_invites_list",
      "auth": true,
      "summary": "List pending invites"
    },
    {
      "tag": "Room Invites",
      "method": "POST",
      "path": "/api/v1/room-invites/",
      "operationId": "room_invites_create",
      "auth": true,
      "summary": "Override create to provide standardized response"
    },
    {
      "tag": "Room Invites",
      "method": "GET",
      "path": "/api/v1/room-invites/{id}/",
      "operationId": "room_invites_retrieve",
      "auth": true,
      "summary": "Override retrieve to provide standardized response"
    },
    {
      "tag": "Room Invites",
      "method": "PUT",
      "path": "/api/v1/room-invites/{id}/",
      "operationId": "room_invites_update",
      "auth": true,
      "summary": "Override update to provide standardized response"
    },
    {
      "tag": "Room Invites",
      "method": "DELETE",
      "path": "/api/v1/room-invites/{id}/",
      "operationId": "room_invites_destroy",
      "auth": true,
      "summary": "Override destroy to provide standardized response"
    },
    {
      "tag": "Rooms",
      "method": "GET",
      "path": "/api/v1/rooms/",
      "operationId": "rooms_list",
      "auth": true,
      "summary": "List user's rooms"
    },
    {
      "tag": "Rooms",
      "method": "POST",
      "path": "/api/v1/rooms/",
      "operationId": "rooms_create",
      "auth": true,
      "summary": "Create a new room"
    },
    {
      "tag": "Rooms",
      "method": "GET",
      "path": "/api/v1/rooms/{id}/",
      "operationId": "rooms_retrieve",
      "auth": true,
      "summary": "Get room details"
    },
    {
      "tag": "Rooms",
      "method": "PATCH",
      "path": "/api/v1/rooms/{id}/",
      "operationId": "rooms_partial_update",
      "auth": true,
      "summary": "ViewSet for managing rooms (lobbies) for multiplayer rounds"
    },
    {
      "tag": "Rooms",
      "method": "PUT",
      "path": "/api/v1/rooms/{id}/",
      "operationId": "rooms_update",
      "auth": true,
      "summary": "Override update to provide standardized response"
    },
    {
      "tag": "Rooms",
      "method": "DELETE",
      "path": "/api/v1/rooms/{id}/",
      "operationId": "rooms_destroy",
      "auth": true,
      "summary": "Cancel room"
    },
    {
      "tag": "Rooms",
      "method": "POST",
      "path": "/api/v1/rooms/{id}/accept-invite/",
      "operationId": "rooms_accept_invite_create",
      "auth": true,
      "summary": "Accept an invite to join a room"
    },
    {
      "tag": "Rooms",
      "method": "POST",
      "path": "/api/v1/rooms/{id}/add-guest/",
      "operationId": "rooms_add_guest_create",
      "auth": true,
      "summary": "Add an existing guest player to the room"
    },
    {
      "tag": "Rooms",
      "method": "POST",
      "path": "/api/v1/rooms/{id}/assign-teams/",
      "operationId": "rooms_assign_teams_create",
      "auth": true,
      "summary": "POST: Add new team assignments"
    },
    {
      "tag": "Rooms",
      "method": "PATCH",
      "path": "/api/v1/rooms/{id}/assign-teams/",
      "operationId": "rooms_assign_teams_partial_update",
      "auth": true,
      "summary": "POST: Add new team assignments"
    },
    {
      "tag": "Rooms",
      "method": "POST",
      "path": "/api/v1/rooms/{id}/decline-invite/",
      "operationId": "rooms_decline_invite_create",
      "auth": true,
      "summary": "Decline an invite to join a room"
    },
    {
      "tag": "Rooms",
      "method": "POST",
      "path": "/api/v1/rooms/{id}/invite/",
      "operationId": "rooms_invite_create",
      "auth": true,
      "summary": "Send invites to users to join the room"
    },
    {
      "tag": "Rooms",
      "method": "POST",
      "path": "/api/v1/rooms/{id}/leave/",
      "operationId": "rooms_leave_create",
      "auth": true,
      "summary": "Leave a room"
    },
    {
      "tag": "Rooms",
      "method": "DELETE",
      "path": "/api/v1/rooms/{id}/remove-guest/{guest_id}/",
      "operationId": "rooms_remove_guest_destroy",
      "auth": true,
      "summary": "Remove a guest from the room (host only)"
    },
    {
      "tag": "Rooms",
      "method": "POST",
      "path": "/api/v1/rooms/{id}/start-round/",
      "operationId": "rooms_start_round_create",
      "auth": true,
      "summary": "Transform room into an active round"
    },
    {
      "tag": "Rooms",
      "method": "GET",
      "path": "/api/v1/rooms/friends-for-invite/",
      "operationId": "rooms_friends_for_invite_retrieve",
      "auth": true,
      "summary": "Get list of friends for inviting to rooms"
    },
    {
      "tag": "Rooms",
      "method": "POST",
      "path": "/api/v1/rooms/join/{code}/",
      "operationId": "rooms_join_create",
      "auth": true,
      "summary": "Join a room using a room code"
    },
    {
      "tag": "rounds",
      "method": "GET",
      "path": "/api/v1/rounds/",
      "operationId": "rounds_list",
      "auth": true,
      "summary": "Override list to provide standardized response"
    },
    {
      "tag": "rounds",
      "method": "POST",
      "path": "/api/v1/rounds/",
      "operationId": "rounds_create",
      "auth": true,
      "summary": "Create a round with standardized response"
    },
    {
      "tag": "rounds",
      "method": "GET",
      "path": "/api/v1/rounds/{id}/",
      "operationId": "rounds_retrieve",
      "auth": true,
      "summary": "Get round details with user-specific caching"
    },
    {
      "tag": "rounds",
      "method": "PATCH",
      "path": "/api/v1/rounds/{id}/",
      "operationId": "rounds_partial_update",
      "auth": true,
      "summary": "ViewSet for managing golf rounds"
    },
    {
      "tag": "rounds",
      "method": "PUT",
      "path": "/api/v1/rounds/{id}/",
      "operationId": "rounds_update",
      "auth": true,
      "summary": "Override update to provide standardized response"
    },
    {
      "tag": "rounds",
      "method": "DELETE",
      "path": "/api/v1/rounds/{id}/",
      "operationId": "rounds_destroy",
      "auth": true,
      "summary": "Soft delete: Hide round from user's view instead of actual deletion"
    },
    {
      "tag": "rounds",
      "method": "PATCH",
      "path": "/api/v1/rounds/{id}/approve/",
      "operationId": "rounds_approve_partial_update",
      "auth": true,
      "summary": "Approve (verify) a round."
    },
    {
      "tag": "rounds",
      "method": "POST",
      "path": "/api/v1/rounds/{id}/check-in/",
      "operationId": "rounds_check_in_create",
      "auth": true,
      "summary": "Manually trigger check-in post creation for the round creator."
    },
    {
      "tag": "rounds",
      "method": "PATCH",
      "path": "/api/v1/rounds/{id}/end_round/",
      "operationId": "rounds_end_round_partial_update",
      "auth": true,
      "summary": "End a round by setting end_time (typically for round creator/host)"
    },
    {
      "tag": "rounds",
      "method": "PATCH",
      "path": "/api/v1/rounds/{id}/finish-player/",
      "operationId": "rounds_finish_player_partial_update",
      "auth": true,
      "summary": "Mark the current player as finished in this round"
    },
    {
      "tag": "rounds",
      "method": "POST",
      "path": "/api/v1/rounds/{id}/unhide/",
      "operationId": "rounds_unhide_create",
      "auth": true,
      "summary": "Restore a hidden round back to the user's view"
    },
    {
      "tag": "rounds",
      "method": "GET",
      "path": "/api/v1/rounds/{round_pk}/players/",
      "operationId": "rounds_players_list",
      "auth": true,
      "summary": "ViewSet for managing round players"
    },
    {
      "tag": "rounds",
      "method": "POST",
      "path": "/api/v1/rounds/{round_pk}/players/",
      "operationId": "rounds_players_create",
      "auth": true,
      "summary": "Add a player to the round"
    },
    {
      "tag": "rounds",
      "method": "GET",
      "path": "/api/v1/rounds/{round_pk}/players/{id}/",
      "operationId": "rounds_players_retrieve",
      "auth": true,
      "summary": "ViewSet for managing round players"
    },
    {
      "tag": "rounds",
      "method": "PATCH",
      "path": "/api/v1/rounds/{round_pk}/players/{id}/",
      "operationId": "rounds_players_partial_update",
      "auth": true,
      "summary": "ViewSet for managing round players"
    },
    {
      "tag": "rounds",
      "method": "PUT",
      "path": "/api/v1/rounds/{round_pk}/players/{id}/",
      "operationId": "rounds_players_update",
      "auth": true,
      "summary": "ViewSet for managing round players"
    },
    {
      "tag": "rounds",
      "method": "DELETE",
      "path": "/api/v1/rounds/{round_pk}/players/{id}/",
      "operationId": "rounds_players_destroy",
      "auth": true,
      "summary": "ViewSet for managing round players"
    },
    {
      "tag": "rounds",
      "method": "GET",
      "path": "/api/v1/rounds/{round_pk}/scores/",
      "operationId": "rounds_scores_list",
      "auth": true,
      "summary": "Support a `page_size` query parameter while keeping global pagination enabled."
    },
    {
      "tag": "rounds",
      "method": "POST",
      "path": "/api/v1/rounds/{round_pk}/scores/",
      "operationId": "rounds_scores_create",
      "auth": true,
      "summary": "Create a single score with authorization check"
    },
    {
      "tag": "rounds",
      "method": "GET",
      "path": "/api/v1/rounds/{round_pk}/scores/{id}/",
      "operationId": "rounds_scores_retrieve",
      "auth": true,
      "summary": "ViewSet for managing scores"
    },
    {
      "tag": "rounds",
      "method": "PATCH",
      "path": "/api/v1/rounds/{round_pk}/scores/{id}/",
      "operationId": "rounds_scores_partial_update",
      "auth": true,
      "summary": "Update a single score (partial update)"
    },
    {
      "tag": "rounds",
      "method": "PUT",
      "path": "/api/v1/rounds/{round_pk}/scores/{id}/",
      "operationId": "rounds_scores_update",
      "auth": true,
      "summary": "Update a single score with authorization check"
    },
    {
      "tag": "rounds",
      "method": "DELETE",
      "path": "/api/v1/rounds/{round_pk}/scores/{id}/",
      "operationId": "rounds_scores_destroy",
      "auth": true,
      "summary": "ViewSet for managing scores"
    },
    {
      "tag": "rounds",
      "method": "POST",
      "path": "/api/v1/rounds/{round_pk}/scores/batch_create/",
      "operationId": "rounds_scores_batch_create_create",
      "auth": true,
      "summary": "Create multiple scores in batch"
    },
    {
      "tag": "rounds",
      "method": "PATCH",
      "path": "/api/v1/rounds/{round_pk}/scores/batch_update/",
      "operationId": "rounds_scores_batch_update_partial_update",
      "auth": true,
      "summary": "Update multiple scores in batch"
    },
    {
      "tag": "rounds",
      "method": "GET",
      "path": "/api/v1/rounds/{round_pk}/scores/leaderboard/",
      "operationId": "rounds_scores_leaderboard_retrieve",
      "auth": true,
      "summary": "Get leaderboard for the round with current user highlighting"
    },
    {
      "tag": "rounds",
      "method": "GET",
      "path": "/api/v1/rounds/{round_pk}/summary/",
      "operationId": "rounds_summary_retrieve",
      "auth": true,
      "summary": "Get comprehensive round summary for all players"
    },
    {
      "tag": "scoring-systems",
      "method": "GET",
      "path": "/api/v1/scoring-systems/",
      "operationId": "scoring_systems_list",
      "auth": true,
      "summary": "Cached list view for scoring systems"
    },
    {
      "tag": "scoring-systems",
      "method": "GET",
      "path": "/api/v1/scoring-systems/{id}/",
      "operationId": "scoring_systems_retrieve",
      "auth": true,
      "summary": "Cached retrieve view for scoring system details"
    },
    {
      "tag": "social",
      "method": "GET",
      "path": "/api/v1/social/comment-reports/",
      "operationId": "social_comment_reports_list",
      "auth": true,
      "summary": "Override list to provide standardized response"
    },
    {
      "tag": "social",
      "method": "POST",
      "path": "/api/v1/social/comment-reports/",
      "operationId": "social_comment_reports_create",
      "auth": true,
      "summary": "Override create to provide standardized response"
    },
    {
      "tag": "social",
      "method": "GET",
      "path": "/api/v1/social/comment-reports/{id}/",
      "operationId": "social_comment_reports_retrieve",
      "auth": true,
      "summary": "Override retrieve to provide standardized response"
    },
    {
      "tag": "social",
      "method": "PUT",
      "path": "/api/v1/social/comment-reports/{id}/",
      "operationId": "social_comment_reports_update",
      "auth": true,
      "summary": "Override update to provide standardized response"
    },
    {
      "tag": "social",
      "method": "DELETE",
      "path": "/api/v1/social/comment-reports/{id}/",
      "operationId": "social_comment_reports_destroy",
      "auth": true,
      "summary": "Override destroy to provide standardized response"
    },
    {
      "tag": "social",
      "method": "POST",
      "path": "/api/v1/social/comment-reports/{id}/remove_content/",
      "operationId": "social_comment_reports_remove_content_create",
      "auth": true,
      "summary": "Mark a comment report as REMOVED. The comment remains permanently hidden."
    },
    {
      "tag": "social",
      "method": "POST",
      "path": "/api/v1/social/comment-reports/{id}/restore/",
      "operationId": "social_comment_reports_restore_create",
      "auth": true,
      "summary": "Mark a comment report as resolved and make the comment visible again."
    },
    {
      "tag": "social",
      "method": "GET",
      "path": "/api/v1/social/comments/",
      "operationId": "social_comments_list",
      "auth": true,
      "summary": "Override list to provide standardized response"
    },
    {
      "tag": "social",
      "method": "POST",
      "path": "/api/v1/social/comments/",
      "operationId": "social_comments_create",
      "auth": true,
      "summary": "Override create to provide standardized response"
    },
    {
      "tag": "social",
      "method": "GET",
      "path": "/api/v1/social/comments/{id}/",
      "operationId": "social_comments_retrieve",
      "auth": true,
      "summary": "Override retrieve to provide standardized response"
    },
    {
      "tag": "social",
      "method": "PUT",
      "path": "/api/v1/social/comments/{id}/",
      "operationId": "social_comments_update",
      "auth": true,
      "summary": "Override update to provide standardized response"
    },
    {
      "tag": "social",
      "method": "DELETE",
      "path": "/api/v1/social/comments/{id}/",
      "operationId": "social_comments_destroy",
      "auth": true,
      "summary": "Override destroy to provide standardized response"
    },
    {
      "tag": "social",
      "method": "POST",
      "path": "/api/v1/social/comments/{id}/report/",
      "operationId": "social_comments_report_create",
      "auth": true,
      "summary": "Report a comment."
    },
    {
      "tag": "social",
      "method": "GET",
      "path": "/api/v1/social/feed/",
      "operationId": "social_feed_list",
      "auth": true,
      "summary": "Override list to inject user statistics into the meta response."
    },
    {
      "tag": "social",
      "method": "POST",
      "path": "/api/v1/social/feed/",
      "operationId": "social_feed_create",
      "auth": true,
      "summary": "Override create to provide standardized response"
    },
    {
      "tag": "social",
      "method": "GET",
      "path": "/api/v1/social/feed/{id}/",
      "operationId": "social_feed_retrieve",
      "auth": true,
      "summary": "Override retrieve to provide standardized response"
    },
    {
      "tag": "social",
      "method": "PUT",
      "path": "/api/v1/social/feed/{id}/",
      "operationId": "social_feed_update",
      "auth": true,
      "summary": "Override update to provide standardized response"
    },
    {
      "tag": "social",
      "method": "DELETE",
      "path": "/api/v1/social/feed/{id}/",
      "operationId": "social_feed_destroy",
      "auth": true,
      "summary": "Override destroy to provide standardized response"
    },
    {
      "tag": "social",
      "method": "POST",
      "path": "/api/v1/social/feed/{id}/clap/",
      "operationId": "social_feed_clap_create",
      "auth": true,
      "summary": "Toggle a clap on a feed item."
    },
    {
      "tag": "social",
      "method": "GET",
      "path": "/api/v1/social/feed/{id}/comments/",
      "operationId": "social_feed_comments_retrieve",
      "auth": true,
      "summary": "Get or post comments for a feed item."
    },
    {
      "tag": "social",
      "method": "POST",
      "path": "/api/v1/social/feed/{id}/comments/",
      "operationId": "social_feed_comments_create",
      "auth": true,
      "summary": "Get or post comments for a feed item."
    },
    {
      "tag": "social",
      "method": "POST",
      "path": "/api/v1/social/feed/{id}/report/",
      "operationId": "social_feed_report_create",
      "auth": true,
      "summary": "Report a feed item."
    },
    {
      "tag": "social",
      "method": "GET",
      "path": "/api/v1/social/follow/",
      "operationId": "social_follow_list",
      "auth": true,
      "summary": "Override list to provide standardized response"
    },
    {
      "tag": "social",
      "method": "POST",
      "path": "/api/v1/social/follow/",
      "operationId": "social_follow_create",
      "auth": true,
      "summary": "Follow a user."
    },
    {
      "tag": "social",
      "method": "GET",
      "path": "/api/v1/social/follow/{id}/",
      "operationId": "social_follow_retrieve",
      "auth": true,
      "summary": "Override retrieve to provide standardized response"
    },
    {
      "tag": "social",
      "method": "PATCH",
      "path": "/api/v1/social/follow/{id}/",
      "operationId": "social_follow_partial_update",
      "auth": true,
      "summary": "ViewSet for tracking followers."
    },
    {
      "tag": "social",
      "method": "PUT",
      "path": "/api/v1/social/follow/{id}/",
      "operationId": "social_follow_update",
      "auth": true,
      "summary": "Override update to provide standardized response"
    },
    {
      "tag": "social",
      "method": "DELETE",
      "path": "/api/v1/social/follow/{id}/",
      "operationId": "social_follow_destroy",
      "auth": true,
      "summary": "Override destroy to provide standardized response"
    },
    {
      "tag": "social",
      "method": "GET",
      "path": "/api/v1/social/follow/followers/",
      "operationId": "social_follow_followers_retrieve",
      "auth": true,
      "summary": "List users who follow the current user."
    },
    {
      "tag": "social",
      "method": "POST",
      "path": "/api/v1/social/login/",
      "operationId": "social_login_create",
      "auth": true,
      "summary": "Social login using Firebase ID token (Google/Apple)."
    },
    {
      "tag": "social",
      "method": "POST",
      "path": "/api/v1/social/populate-celebrity-follows/",
      "operationId": "social_populate_celebrity_follows_create",
      "auth": true,
      "summary": "Admin-only endpoint to run the 'populate_celebrity_follows' management command asynchronously."
    },
    {
      "tag": "social",
      "method": "GET",
      "path": "/api/v1/social/posts/",
      "operationId": "social_posts_list",
      "auth": true,
      "summary": "Override list to provide standardized response"
    },
    {
      "tag": "social",
      "method": "POST",
      "path": "/api/v1/social/posts/",
      "operationId": "social_posts_create",
      "auth": true,
      "summary": "Override create to provide standardized response"
    },
    {
      "tag": "social",
      "method": "GET",
      "path": "/api/v1/social/posts/{id}/",
      "operationId": "social_posts_retrieve",
      "auth": true,
      "summary": "Override retrieve to provide standardized response"
    },
    {
      "tag": "social",
      "method": "PATCH",
      "path": "/api/v1/social/posts/{id}/",
      "operationId": "social_posts_partial_update",
      "auth": true,
      "summary": "ViewSet for creating manual posts."
    },
    {
      "tag": "social",
      "method": "PUT",
      "path": "/api/v1/social/posts/{id}/",
      "operationId": "social_posts_update",
      "auth": true,
      "summary": "Override update to provide standardized response"
    },
    {
      "tag": "social",
      "method": "DELETE",
      "path": "/api/v1/social/posts/{id}/",
      "operationId": "social_posts_destroy",
      "auth": true,
      "summary": "Override destroy to provide standardized response"
    },
    {
      "tag": "social",
      "method": "GET",
      "path": "/api/v1/social/reports/",
      "operationId": "social_reports_list",
      "auth": true,
      "summary": "Override list to provide standardized response"
    },
    {
      "tag": "social",
      "method": "POST",
      "path": "/api/v1/social/reports/",
      "operationId": "social_reports_create",
      "auth": true,
      "summary": "Override create to provide standardized response"
    },
    {
      "tag": "social",
      "method": "GET",
      "path": "/api/v1/social/reports/{id}/",
      "operationId": "social_reports_retrieve",
      "auth": true,
      "summary": "Override retrieve to provide standardized response"
    },
    {
      "tag": "social",
      "method": "PUT",
      "path": "/api/v1/social/reports/{id}/",
      "operationId": "social_reports_update",
      "auth": true,
      "summary": "Override update to provide standardized response"
    },
    {
      "tag": "social",
      "method": "DELETE",
      "path": "/api/v1/social/reports/{id}/",
      "operationId": "social_reports_destroy",
      "auth": true,
      "summary": "Override destroy to provide standardized response"
    },
    {
      "tag": "social",
      "method": "POST",
      "path": "/api/v1/social/reports/{id}/remove_content/",
      "operationId": "social_reports_remove_content_create",
      "auth": true,
      "summary": "Mark a report as REMOVED. The content remains permanently hidden."
    },
    {
      "tag": "social",
      "method": "POST",
      "path": "/api/v1/social/reports/{id}/restore/",
      "operationId": "social_reports_restore_create",
      "auth": true,
      "summary": "Mark a report as resolved and make the content live again."
    },
    {
      "tag": "Subscriptions",
      "method": "POST",
      "path": "/api/v1/subscriptions/cancel-feedback/",
      "operationId": "subscriptions_cancel_feedback_create",
      "auth": true,
      "summary": "Collect optional cancellation feedback from the user."
    },
    {
      "tag": "Subscriptions",
      "method": "GET",
      "path": "/api/v1/subscriptions/plans/",
      "operationId": "subscriptions_plans_list",
      "auth": true,
      "summary": "Return all active subscription plans with their enabled features."
    },
    {
      "tag": "Subscriptions",
      "method": "POST",
      "path": "/api/v1/subscriptions/redeem/",
      "operationId": "subscriptions_redeem_create",
      "auth": true,
      "summary": "Redeem a promo code to activate a subscription."
    },
    {
      "tag": "Subscriptions",
      "method": "GET",
      "path": "/api/v1/subscriptions/status/",
      "operationId": "subscriptions_status_retrieve",
      "auth": true,
      "summary": "Return the authenticated user's current subscription status."
    },
    {
      "tag": "Subscriptions",
      "method": "POST",
      "path": "/api/v1/subscriptions/verify/",
      "operationId": "subscriptions_verify_create",
      "auth": true,
      "summary": "Verify an in-app purchase receipt and activate the subscription."
    },
    {
      "tag": "users",
      "method": "GET",
      "path": "/api/v1/users/celebrities/",
      "operationId": "list_celebrities",
      "auth": true,
      "summary": "List celebrities"
    },
    {
      "tag": "users",
      "method": "POST",
      "path": "/api/v1/users/celebrities/action/",
      "operationId": "update_celebrity_status",
      "auth": true,
      "summary": "Update user celebrity status"
    },
    {
      "tag": "users",
      "method": "POST",
      "path": "/api/v1/users/search-visibility/toggle/",
      "operationId": "toggle_user_search_visibility",
      "auth": true,
      "summary": "Toggle search visibility"
    },
    {
      "tag": "users",
      "method": "GET",
      "path": "/api/v1/users/search/",
      "operationId": "search_users",
      "auth": true,
      "summary": "List or search users"
    },
    {
      "tag": "weather",
      "method": "GET",
      "path": "/api/v1/weather/current/",
      "operationId": "weather_current_retrieve",
      "auth": true,
      "summary": "Get Current Weather"
    }
  ]
};
  const res = await fetch("/api/clients/wedge/wiki/pages", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "API_DOCS", title: content.title, content }),
  });
  const text = await res.text();
  if (!res.ok) { console.error("FAILED " + res.status + ": " + text); return; }
  console.log("OK " + res.status + " — seeded " + content.endpoints.length + " endpoints. Refresh the wiki API Docs page.");
})();
