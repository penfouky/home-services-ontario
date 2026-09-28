package main

import (
	"net/http"
	"testing"
	"time"
)

// a controllable clock for deterministic tests
type fakeClock struct{ t time.Time }

func (c *fakeClock) now() time.Time  { return c.t }
func (c *fakeClock) add(d time.Duration) { c.t = c.t.Add(d) }

func newTestLimiter(clk *fakeClock, maxFails int, window, base, max time.Duration) *limiter {
	l := newLimiter(maxFails, window, base, max)
	l.now = clk.now
	return l
}

func TestLockoutAfterMaxFails(t *testing.T) {
	clk := &fakeClock{t: time.Unix(1_000_000, 0)}
	l := newTestLimiter(clk, 3, 15*time.Minute, 30*time.Second, 15*time.Minute)

	if d := l.retryAfter(); d != 0 {
		t.Fatalf("fresh limiter should not be locked, got %v", d)
	}
	// first two failures do not lock
	if l.fail() || l.retryAfter() != 0 {
		t.Fatal("locked too early after 1 failure")
	}
	if l.fail() || l.retryAfter() != 0 {
		t.Fatal("locked too early after 2 failures")
	}
	// third failure trips the lock
	if !l.fail() {
		t.Fatal("expected lockout on the 3rd failure")
	}
	if d := l.retryAfter(); d <= 0 || d > 30*time.Second {
		t.Fatalf("expected ~30s lockout, got %v", d)
	}
}

func TestLockoutExpiresThenAllows(t *testing.T) {
	clk := &fakeClock{t: time.Unix(1_000_000, 0)}
	l := newTestLimiter(clk, 2, 15*time.Minute, 30*time.Second, 15*time.Minute)
	l.fail()
	l.fail() // locked for 30s
	if l.retryAfter() <= 0 {
		t.Fatal("should be locked")
	}
	clk.add(31 * time.Second)
	if d := l.retryAfter(); d != 0 {
		t.Fatalf("lock should have expired, got %v", d)
	}
}

func TestExponentialBackoff(t *testing.T) {
	clk := &fakeClock{t: time.Unix(1_000_000, 0)}
	l := newTestLimiter(clk, 1, 15*time.Minute, 1*time.Second, 8*time.Second)
	// each failure locks (maxFails=1); lock doubles each level: 1,2,4,8,8(capped)
	want := []time.Duration{1, 2, 4, 8, 8}
	for i, w := range want {
		l.fail()
		got := l.retryAfter().Round(time.Second)
		if got != w*time.Second {
			t.Fatalf("level %d: want %v, got %v", i+1, w*time.Second, got)
		}
		clk.add(w*time.Second + time.Second) // let it expire before the next
	}
}

func TestSuccessResets(t *testing.T) {
	clk := &fakeClock{t: time.Unix(1_000_000, 0)}
	l := newTestLimiter(clk, 2, 15*time.Minute, 30*time.Second, 15*time.Minute)
	l.fail()
	l.fail() // locked, level 1
	clk.add(31 * time.Second)
	l.success() // clears level
	// after reset, it should take the full maxFails again and lock at base (level 1)
	l.fail()
	if !l.fail() {
		t.Fatal("expected lockout after 2 fresh failures")
	}
	if d := l.retryAfter().Round(time.Second); d != 30*time.Second {
		t.Fatalf("after reset lock should be base 30s again, got %v", d)
	}
}

func TestWindowPrunesOldFailures(t *testing.T) {
	clk := &fakeClock{t: time.Unix(1_000_000, 0)}
	l := newTestLimiter(clk, 3, 1*time.Minute, 30*time.Second, 15*time.Minute)
	l.fail() // t=0
	clk.add(30 * time.Second)
	l.fail() // t=30s
	clk.add(40 * time.Second) // t=70s: the first failure (t=0) is now outside the 60s window
	// only 1 failure remains in-window; this makes 2, still under maxFails=3 -> no lock
	if l.fail() {
		t.Fatal("old failure should have been pruned; should not lock yet")
	}
	if l.retryAfter() != 0 {
		t.Fatal("should not be locked after pruning")
	}
}

func TestClientIP(t *testing.T) {
	cases := []struct {
		xff, xreal, remote, want string
	}{
		{"1.1.1.1, 2.2.2.2", "", "10.0.0.1:5", "2.2.2.2"}, // last hop our proxy appended
		{"", "3.3.3.3", "10.0.0.1:5", "3.3.3.3"},
		{"", "", "10.0.0.9:1234", "10.0.0.9"},
	}
	for _, c := range cases {
		r := &http.Request{Header: http.Header{}, RemoteAddr: c.remote}
		if c.xff != "" {
			r.Header.Set("X-Forwarded-For", c.xff)
		}
		if c.xreal != "" {
			r.Header.Set("X-Real-Ip", c.xreal)
		}
		if got := clientIP(r); got != c.want {
			t.Errorf("clientIP(%q/%q/%q)=%q want %q", c.xff, c.xreal, c.remote, got, c.want)
		}
	}
}
