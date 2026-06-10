package metrics

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	HTTPRequests = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "amber_http_requests_total",
		Help: "HTTP requests processed",
	}, []string{"method", "path", "status"})

	WSConnected = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "amber_ws_connected_clients",
		Help: "Current number of connected WebSocket clients",
	})

	WSMessages = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "amber_ws_messages_total",
		Help: "WebSocket messages processed by type",
	}, []string{"type"})
)
