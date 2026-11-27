package apperror

type Error struct {
	Status  int
	Code    string
	Message string
}

func (e *Error) Error() string { return e.Message }

func New(status int, code, message string) *Error {
	return &Error{Status: status, Code: code, Message: message}
}

var (
	Invalid         = New(400, "INVALID_REQUEST", "The request is invalid.")
	Unauthenticated = New(401, "UNAUTHENTICATED", "Sign in to continue.")
	Forbidden       = New(403, "FORBIDDEN", "You do not have access.")
	NotFound        = New(404, "NOT_FOUND", "The requested resource was not found.")
	Unavailable     = New(503, "SERVICE_UNAVAILABLE", "The service is temporarily unavailable.")
)
