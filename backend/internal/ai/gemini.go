package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
)

const geminiEndpoint = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key="

// AskBartender sends a prompt to Gemini and returns the text response.
// maxTokens controls the response length limit (use ~300 for prose, ~600 for JSON).
// Returns a friendly fallback message if GOOGLE_AI_KEY is not set.
func AskBartender(ctx context.Context, prompt string, maxTokens int) (string, error) {
	key := os.Getenv("GOOGLE_AI_KEY")
	if key == "" {
		return "The bartender is off the clock right now. Check back later. 🍸", nil
	}

	payload, _ := json.Marshal(map[string]any{
		"contents": []map[string]any{
			{"parts": []map[string]any{{"text": prompt}}},
		},
		"generationConfig": map[string]any{
			"maxOutputTokens": maxTokens,
			"temperature":     0.85,
			// gemini-2.5-flash is a thinking model; disable thinking so the
			// full token budget goes to the actual response (not internal reasoning).
			"thinkingConfig": map[string]any{
				"thinkingBudget": 0,
			},
		},
	})

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, geminiEndpoint+key, bytes.NewReader(payload))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	// Surface the real Gemini error (status + body) so failures aren't opaque.
	if resp.StatusCode != http.StatusOK {
		log.Printf("gemini API error: status=%d body=%s", resp.StatusCode, string(raw))
		return "", fmt.Errorf("gemini status %d", resp.StatusCode)
	}

	var result struct {
		Candidates []struct {
			Content struct {
				Parts []struct {
					Text string `json:"text"`
				} `json:"parts"`
			} `json:"content"`
		} `json:"candidates"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		log.Printf("gemini decode error: %v body=%s", err, string(raw))
		return "", err
	}
	if len(result.Candidates) == 0 || len(result.Candidates[0].Content.Parts) == 0 {
		log.Printf("gemini empty response: body=%s", string(raw))
		return "", fmt.Errorf("empty AI response")
	}
	return result.Candidates[0].Content.Parts[0].Text, nil
}
