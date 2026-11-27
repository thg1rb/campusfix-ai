package domain

import "time"

type Entry struct {
	ID           string
	EntityType   string
	EntityID     string
	Action       string
	ActorType    string
	ActorUserID  *string
	ActorRoles   []string
	DepartmentID *string
	Details      map[string]any
	CreatedAt    time.Time
}

func ValidEntityType(value string) bool {
	switch value {
	case "REPORT", "TICKET", "AI_RUN", "USER", "CATEGORY", "DEPARTMENT", "LOCATION", "RETENTION":
		return true
	}
	return false
}
