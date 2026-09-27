// A tiny, dependency-free authentication gate for the TeddyCloud web UI.
//
// It sits behind Caddy's `forward_auth`: Caddy asks /verify before serving the
// admin UI; the gate answers 200 when the visitor holds a valid signed cookie and
// otherwise sends them to a branded /login page. A correct password mints an
// HMAC-signed cookie (no server-side session store, no database). This guards only
// the web UI — the Toniebox itself talks to TeddyCloud on port 443, which never
// passes through here.
package main

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"html/template"
	"log"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

const cookieName = "ctc_gate"

var (
	password = os.Getenv("GATE_PASSWORD")
	secret   = []byte(os.Getenv("GATE_SECRET"))
	brand    = envOr("GATE_BRAND", "Colada Builds")
	tagline  = envOr("GATE_TAGLINE", "Crew's Tonie Cloud")
	secure   = os.Getenv("GATE_INSECURE") == "" // cookies are Secure unless told otherwise (local testing)
	ttl      = 7 * 24 * time.Hour
)

func envOr(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}

// token is "<expiry unix seconds>.<hex HMAC-SHA256 of that number>"
func mint(exp int64) string {
	msg := strconv.FormatInt(exp, 10)
	m := hmac.New(sha256.New, secret)
	m.Write([]byte(msg))
	return msg + "." + hex.EncodeToString(m.Sum(nil))
}

func valid(token string) bool {
	dot := strings.IndexByte(token, '.')
	if dot < 1 {
		return false
	}
	exp, err := strconv.ParseInt(token[:dot], 10, 64)
	if err != nil || time.Now().Unix() > exp {
		return false
	}
	// constant-time compare against a freshly minted token for the same expiry
	return subtle.ConstantTimeCompare([]byte(token), []byte(mint(exp))) == 1
}

func authed(r *http.Request) bool {
	c, err := r.Cookie(cookieName)
	return err == nil && valid(c.Value)
}

// safeNext keeps redirects on this site only (no open redirect to other hosts)
func safeNext(raw string) string {
	if raw == "" {
		return "/"
	}
	u, err := url.Parse(raw)
	if err != nil || u.IsAbs() || u.Host != "" || !strings.HasPrefix(u.Path, "/") || strings.HasPrefix(u.Path, "/__gate/") {
		return "/"
	}
	return u.Path
}

func main() {
	if password == "" {
		log.Fatal("GATE_PASSWORD must be set")
	}
	if len(secret) == 0 {
		buf := make([]byte, 32)
		if _, err := rand.Read(buf); err != nil {
			log.Fatalf("cannot generate a session secret: %v", err)
		}
		secret = buf
		log.Print("GATE_SECRET is not set; using a random one. Logins will not survive a restart — set GATE_SECRET to keep them.")
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/__gate/health", func(w http.ResponseWriter, r *http.Request) { w.Write([]byte("ok")) })
	mux.HandleFunc("/__gate/verify", handleVerify)
	mux.HandleFunc("/__gate/login", handleLogin)
	mux.HandleFunc("/__gate/logout", handleLogout)

	addr := envOr("GATE_ADDR", ":8080")
	log.Printf("%s gate listening on %s", brand, addr)
	log.Fatal(http.ListenAndServe(addr, mux))
}

// handleVerify is what Caddy's forward_auth calls before every admin request.
func handleVerify(w http.ResponseWriter, r *http.Request) {
	if authed(r) {
		w.WriteHeader(http.StatusOK)
		return
	}
	// Not logged in: send the browser to the branded login page, remembering where
	// they were headed (Caddy passes the original path in X-Forwarded-Uri).
	next := r.Header.Get("X-Forwarded-Uri")
	loc := "/__gate/login"
	if n := safeNext(next); n != "/" {
		loc += "?next=" + url.QueryEscape(n)
	}
	http.Redirect(w, r, loc, http.StatusFound)
}

func handleLogin(w http.ResponseWriter, r *http.Request) {
	next := safeNext(r.URL.Query().Get("next"))
	if r.Method == http.MethodPost {
		next = safeNext(r.FormValue("next"))
		if subtle.ConstantTimeCompare([]byte(r.FormValue("password")), []byte(password)) == 1 {
			exp := time.Now().Add(ttl)
			http.SetCookie(w, &http.Cookie{
				Name: cookieName, Value: mint(exp.Unix()), Path: "/",
				Expires: exp, HttpOnly: true, Secure: secure, SameSite: http.SameSiteLaxMode,
			})
			http.Redirect(w, r, next, http.StatusFound)
			return
		}
		w.WriteHeader(http.StatusUnauthorized)
		render(w, next, true)
		return
	}
	if authed(r) {
		http.Redirect(w, r, next, http.StatusFound)
		return
	}
	render(w, next, false)
}

func handleLogout(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{Name: cookieName, Value: "", Path: "/", MaxAge: -1, HttpOnly: true, Secure: secure, SameSite: http.SameSiteLaxMode})
	http.Redirect(w, r, "/__gate/login", http.StatusFound)
}

func render(w http.ResponseWriter, next string, failed bool) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	page.Execute(w, map[string]any{"Brand": brand, "Tagline": tagline, "Next": next, "Failed": failed})
}

var page = template.Must(template.New("login").Parse(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{.Brand}} — sign in</title>
<style>
  :root { --pink:#ff8fab; --purple:#8b6df2; --gold:#ffd166; --ink:#3a2f5b; }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; display:grid; place-items:center; padding:24px;
    font-family: ui-rounded, "Nunito", "Segoe UI", system-ui, sans-serif; color:var(--ink);
    background: radial-gradient(1200px 600px at 20% -10%, #ffe0ec 0%, transparent 60%),
                radial-gradient(1000px 700px at 110% 20%, #e3dcff 0%, transparent 55%),
                linear-gradient(160deg, #fff6fb 0%, #eef0ff 100%); }
  .card { width:100%; max-width:380px; background:#fff; border-radius:28px; padding:34px 30px 30px;
    box-shadow: 0 24px 60px rgba(139,109,242,.22), 0 4px 12px rgba(0,0,0,.05); text-align:center; }
  .badge { width:84px; height:84px; margin:0 auto 14px; border-radius:24px; display:grid; place-items:center;
    background: linear-gradient(145deg, var(--pink), var(--purple)); box-shadow: 0 10px 24px rgba(139,109,242,.35); }
  h1 { font-size:1.5rem; margin:.2rem 0 0; letter-spacing:.2px; }
  .tag { color:#8a83a6; font-size:.95rem; margin:.15rem 0 1.4rem; }
  label { display:block; text-align:left; font-weight:700; font-size:.85rem; margin:0 0 6px 4px; color:#6b6390; }
  input[type=password] { width:100%; padding:14px 16px; font-size:1rem; border:2px solid #ece9fb; border-radius:16px;
    outline:none; transition:border-color .15s, box-shadow .15s; background:#fbfaff; }
  input[type=password]:focus { border-color:var(--purple); box-shadow:0 0 0 4px rgba(139,109,242,.15); }
  button { width:100%; margin-top:16px; padding:14px 16px; font-size:1.02rem; font-weight:800; color:#fff; cursor:pointer;
    border:0; border-radius:16px; background:linear-gradient(145deg, var(--pink), var(--purple));
    box-shadow:0 10px 22px rgba(139,109,242,.35); transition:transform .06s ease, filter .15s; }
  button:hover { filter:brightness(1.05); } button:active { transform:translateY(1px); }
  .err { background:#ffe9ee; color:#c0324b; border-radius:14px; padding:10px 12px; font-size:.9rem; margin:0 0 14px; }
  .foot { margin-top:18px; font-size:.78rem; color:#a9a3c2; }
</style>
</head>
<body>
  <form class="card" method="post" action="/__gate/login">
    <div class="badge" aria-hidden="true">
      <svg width="46" height="46" viewBox="0 0 100 100" fill="none">
        <circle cx="28" cy="24" r="12" fill="#fff"/><circle cx="72" cy="24" r="12" fill="#fff"/>
        <rect x="22" y="34" width="56" height="46" rx="22" fill="#fff"/>
        <circle cx="39" cy="54" r="4.5" fill="#3a2f5b"/><circle cx="61" cy="54" r="4.5" fill="#3a2f5b"/>
        <path d="M42 66 q8 7 16 0" stroke="#3a2f5b" stroke-width="4" stroke-linecap="round"/>
      </svg>
    </div>
    <h1>{{.Brand}}</h1>
    <div class="tag">{{.Tagline}}</div>
    {{if .Failed}}<div class="err">That password didn’t match. Try again.</div>{{end}}
    <label for="password">Password</label>
    <input id="password" name="password" type="password" autocomplete="current-password" autofocus required>
    <input type="hidden" name="next" value="{{.Next}}">
    <button type="submit">Let me in</button>
    <div class="foot">🔒 Private family library</div>
  </form>
</body>
</html>`))
