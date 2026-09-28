package main

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"
)

func init() {
	password = "s3cret"
	secret = []byte("test-signing-key")
	secure = false
}

func TestTokenRoundTrip(t *testing.T) {
	good := mint(time.Now().Add(time.Hour).Unix())
	if !valid(good) {
		t.Fatal("a freshly minted, unexpired token should be valid")
	}
	if valid(mint(time.Now().Add(-time.Hour).Unix())) {
		t.Fatal("an expired token must be rejected")
	}
	if valid(good + "x") {
		t.Fatal("a tampered token must be rejected")
	}
	if valid("garbage") || valid("123.deadbeef") || valid("") {
		t.Fatal("malformed tokens must be rejected")
	}
	// a token signed with a different key must not validate
	realKey := secret
	secret = []byte("attacker-key")
	forged := mint(time.Now().Add(time.Hour).Unix())
	secret = realKey
	if valid(forged) {
		t.Fatal("a token signed with another key must be rejected")
	}
}

func TestSafeNext(t *testing.T) {
	cases := map[string]string{
		"":                     "/",
		"/tonies":              "/tonies",
		"/a?b=c":               "/a",
		"//evil.com":           "/", // protocol-relative
		"https://evil.com":     "/",
		"http://x/y":           "/",
		"/__gate/login":        "/", // never bounce back into the gate
		"javascript:alert(1)":  "/",
	}
	for in, want := range cases {
		if got := safeNext(in); got != want {
			t.Errorf("safeNext(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestVerifyDeniesWithoutCookie(t *testing.T) {
	r := httptest.NewRequest("GET", "/__gate/verify", nil)
	r.Header.Set("X-Forwarded-Uri", "/tonies")
	w := httptest.NewRecorder()
	handleVerify(w, r)
	if w.Code != http.StatusFound {
		t.Fatalf("no cookie should redirect, got %d", w.Code)
	}
	loc := w.Header().Get("Location")
	if !strings.HasPrefix(loc, "/__gate/login") || !strings.Contains(loc, "next=") {
		t.Fatalf("should redirect to login carrying next, got %q", loc)
	}
}

func TestVerifyAllowsWithCookie(t *testing.T) {
	r := httptest.NewRequest("GET", "/__gate/verify", nil)
	r.AddCookie(&http.Cookie{Name: cookieName, Value: mint(time.Now().Add(time.Hour).Unix())})
	w := httptest.NewRecorder()
	handleVerify(w, r)
	if w.Code != http.StatusOK {
		t.Fatalf("valid cookie should be allowed, got %d", w.Code)
	}
}

func TestLoginCorrectPasswordSetsCookie(t *testing.T) {
	form := url.Values{"password": {"s3cret"}, "next": {"/tonies"}}
	r := httptest.NewRequest("POST", "/__gate/login", strings.NewReader(form.Encode()))
	r.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	w := httptest.NewRecorder()
	handleLogin(w, r)
	if w.Code != http.StatusFound || w.Header().Get("Location") != "/tonies" {
		t.Fatalf("correct password should redirect to next, got %d loc=%q", w.Code, w.Header().Get("Location"))
	}
	var tok string
	for _, c := range w.Result().Cookies() {
		if c.Name == cookieName {
			tok = c.Value
		}
	}
	if tok == "" || !valid(tok) {
		t.Fatalf("a valid session cookie should be set, got %q", tok)
	}
}

func TestLoginWrongPasswordIsRejected(t *testing.T) {
	form := url.Values{"password": {"nope"}}
	r := httptest.NewRequest("POST", "/__gate/login", strings.NewReader(form.Encode()))
	r.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	w := httptest.NewRecorder()
	handleLogin(w, r)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("wrong password should be 401, got %d", w.Code)
	}
	for _, c := range w.Result().Cookies() {
		if c.Name == cookieName && c.Value != "" {
			t.Fatal("no session cookie should be set on a failed login")
		}
	}
}

func TestLoginOpenRedirectBlocked(t *testing.T) {
	form := url.Values{"password": {"s3cret"}, "next": {"https://evil.com"}}
	r := httptest.NewRequest("POST", "/__gate/login", strings.NewReader(form.Encode()))
	r.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	w := httptest.NewRecorder()
	handleLogin(w, r)
	if loc := w.Header().Get("Location"); loc != "/" {
		t.Fatalf("off-site redirect must be blocked, got %q", loc)
	}
}
