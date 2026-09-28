package main

import (
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

// limiter slows down password guessing. It counts failed logins in a sliding window and,
// once too many pile up, locks out *all* login attempts for a growing back-off period.
//
// The lockout is global rather than per-IP on purpose: this gate protects a single-user
// family instance sitting behind Apache -> Caddy, so the client IP only reaches the gate
// through proxy headers, which a determined attacker can forge. A global limit can't be
// dodged by rotating IPs or spoofing X-Forwarded-For, and the only cost is that the real
// owner has to wait a moment after an unusual number of wrong passwords.
type limiter struct {
	mu          sync.Mutex
	maxFails    int
	window      time.Duration
	baseLock    time.Duration
	maxLock     time.Duration
	now         func() time.Time // injectable so tests control time
	fails       []time.Time
	lockedUntil time.Time
	lockLevel   int
}

func newLimiter(maxFails int, window, baseLock, maxLock time.Duration) *limiter {
	return &limiter{
		maxFails: maxFails,
		window:   window,
		baseLock: baseLock,
		maxLock:  maxLock,
		now:      time.Now,
	}
}

// retryAfter reports how long callers must wait before another attempt is allowed.
// Zero means not currently locked.
func (l *limiter) retryAfter() time.Duration {
	l.mu.Lock()
	defer l.mu.Unlock()
	if d := l.lockedUntil.Sub(l.now()); d > 0 {
		return d
	}
	return 0
}

// fail records one wrong password and returns true if that tripped a fresh lockout.
func (l *limiter) fail() bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()
	// drop failures older than the window
	cut := now.Add(-l.window)
	kept := l.fails[:0]
	for _, t := range l.fails {
		if t.After(cut) {
			kept = append(kept, t)
		}
	}
	l.fails = kept
	l.fails = append(l.fails, now)

	if len(l.fails) >= l.maxFails {
		l.lockLevel++
		d := l.baseLock << (l.lockLevel - 1)
		if d > l.maxLock || d <= 0 { // <=0 guards against shift overflow
			d = l.maxLock
		}
		l.lockedUntil = now.Add(d)
		l.fails = l.fails[:0] // require a fresh run of failures after the lock
		return true
	}
	return false
}

// success clears all state after a correct password.
func (l *limiter) success() {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.fails = nil
	l.lockedUntil = time.Time{}
	l.lockLevel = 0
}

// clientIP is a best-effort real client address for logging only (never for the limit,
// since these headers are set by the proxy chain and can be forged by clients).
func clientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		parts := strings.Split(xff, ",")
		return strings.TrimSpace(parts[len(parts)-1]) // the hop our proxy appended
	}
	if xr := r.Header.Get("X-Real-Ip"); xr != "" {
		return strings.TrimSpace(xr)
	}
	if host, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
		return host
	}
	return r.RemoteAddr
}

func retryAfterHeader(w http.ResponseWriter, d time.Duration) {
	secs := int(d.Seconds())
	if secs < 1 {
		secs = 1
	}
	w.Header().Set("Retry-After", strconv.Itoa(secs))
}
