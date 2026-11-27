package domain

import "time"

type Entry struct {
	ID           string         `json:"id"`
	EntityType   string         `json:"entityType"`
	EntityID     string         `json:"entityId"`
	Action       string         `json:"action"`
	ActorType    string         `json:"actorType"`
	ActorUserID  *string        `json:"actorUserId"`
	ActorRoles   []string       `json:"actorRoles"`
	DepartmentID *string        `json:"departmentId"`
	Details      map[string]any `json:"details"`
	CreatedAt    time.Time      `json:"createdAt"`
}

func ValidEntityType(value string) bool {
	switch value {
	case "REPORT", "TICKET", "AI_RUN", "USER", "CATEGORY", "DEPARTMENT", "LOCATION", "RETENTION":
		return true
	}
	return false
}
