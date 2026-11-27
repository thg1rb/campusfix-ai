package docs

import _ "embed"

// OpenAPIV1YAML is the OpenAPI contract for the registered HTTP API.
//
//go:embed openapi-v1.yaml
var OpenAPIV1YAML []byte
