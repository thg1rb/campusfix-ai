package ai

import (
	"context"
	"fmt"
	"net/http"
	"time"
)

type Client struct {
	http     *http.Client
	endpoint string
}

func NewClient(endpoint string) *Client {
	return &Client{
		http: &http.Client{
			Timeout:       2 * time.Second,
			CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
		},
		endpoint: endpoint,
	}
}

func (c *Client) Check(ctx context.Context) error {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, c.endpoint, nil)
	if err != nil {
		return err
	}
	response, err := c.http.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("unexpected AI health status %d", response.StatusCode)
	}
	return nil
}
