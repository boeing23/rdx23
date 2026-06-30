# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

ChalBeyy — a carpooling app. Django + DRF backend (apps `users`, `rides`) serving a JSON API, with a separate Create React App frontend in `frontend/`. Riders post ride requests, drivers post rides, and a geospatial matching engine pairs them along compatible routes.

## Commands

### Backend (run from repo root, venv activated)
```bash
source venv/bin/activate
python manage.py migrate
python manage.py runserver            # serves API; README references :8002, frontend local config expects :8000
python manage.py createsuperuser
python manage.py test                 # all tests
python manage.py test rides           # one app
python manage.py test rides.test_matching   # one module
```

Seed / maintenance management commands:
```bash
python manage.py create_sample_data            # users app — demo users
python manage.py process_ride_statuses         # marks expired pending requests + completes past rides (run on a cron, see README)
python manage.py populate_optimal_points       # backfill optimal pickup/dropoff points on RideRequests
python manage.py update_optimal_pickup_points
```

### Frontend (from `frontend/`)
```bash
npm install
npm start        # CRA dev server on :3000
npm run build
npm test
```

## Environment

Settings read via `python-decouple` + `django-environ` from `.env`. Required/notable keys:
- `DATABASE_URL` — parsed by `dj_database_url`; falls back to `sqlite:///db.sqlite3` when unset (local dev uses SQLite, production Railway uses Postgres).
- `OPENROUTE_API_KEY` — **required, no default** (`settings.py` will raise if missing). All road routing/geocoding depends on it.
- `SECRET_KEY`, `DEBUG`, `ALLOWED_HOSTS`, `GEOCODING_API_KEY`, `MAPBOX_ACCESS_TOKEN`, email (`EMAIL_HOST_USER`/`EMAIL_HOST_PASSWORD`).

## Architecture

### Auth
- Custom user model `users.User` (`AUTH_USER_MODEL = 'users.User'`) extends `AbstractUser` with `user_type` (DRIVER/RIDER), vehicle fields, `rating`, `preferred_pickup_locations`.
- JWT via `djangorestframework-simplejwt` with rotation + blacklist. DRF default auth = JWT + SessionAuthentication; default permission = `IsAuthenticated`.
- `django-allauth` is installed for social login (Google/Facebook/GitHub) — endpoints under `users.urls` (`social/...`) and `/accounts/`. `SITE_ID = 1`.
- Plain `register_user` / `login_user` function views in `users/views.py` are the primary email/password path (recent commits removed CSRF from these flows).

### URL layout
- `carpool_project/urls.py` → `/api/users/` (`users.urls`), `/api/rides/` (`rides.urls`), plus `/admin/`, `/railway-status/`, allauth.
- `rides/urls.py` uses a DRF `DefaultRouter`: `rides`, `requests`, `notifications` viewsets, plus the OpenRouteService proxy at `/api/rides/directions/`.

### Core domain models (`rides/models.py`)
- `Ride` — driver's offered trip. `Ride.save()` is heavy: geocodes start/end via Nominatim if coords missing, then calls `get_route_details()` (OpenRouteService) to populate `route_geometry`/`route_duration`/`route_distance`. `route_geometry` is a JSONField — do **not** `json.dumps()` into it.
- `RideRequest` — rider's request, tied to a `Ride`. Stores `optimal_pickup_point` / `nearest_dropoff_point` (JSON) computed by the matching engine. `save()` tracks status transitions (e.g. → ACCEPTED) via the `@track_model_changes` post_init signal that snapshots `_loaded_values`.
- `Notification` (also in `rides`) — drives in-app + email notifications.

### Matching engine — the heart of the app
Route-overlap matching is split across three files; understand all three before touching matching:
- `rides/utils.py` — geometry primitives: `get_route_details`, `is_route_compatible`, `interpolate_points`, `find_best_point`, `calculate_optimal_pickup_dropoff`, `calculate_route_overlap`.
- `rides/services.py` — higher-level matching + side effects: `find_suitable_rides`, `calculate_overlap`, `calculate_optimal_pickup_point`, `find_closest_point_on_route`, `create_match_notifications`, and the email senders.
- `rides/views.py` — additional in-view routing/overlap helpers (`generate_route`, `generate_fallback_route`, `find_optimal_point`, `calculate_segment_overlap`, `_calculate_route_overlap_legacy`) plus all viewset endpoints. This file is ~2000 lines and the densest part of the codebase.

Routing calls OpenRouteService; `generate_fallback_route` provides straight-line interpolation when the API is unavailable, so matching degrades rather than fails without ORS.

### CORS — non-standard, read before editing
CORS is handled by a **custom** `carpool_project.global_cors_middleware.GlobalCorsMiddleware` (first in MIDDLEWARE). The stock `corsheaders.CorsMiddleware` was intentionally removed to avoid duplicate headers — do not re-add it. `django-cors-headers` settings (`CORS_ALLOWED_ORIGINS`, etc.) still exist in `settings.py`. There are several other CORS shims (`api_cors_middleware.py`, `cors_middleware.py`, `cors_views.py`) — the global one is authoritative.

### Frontend
- CRA + MUI + react-leaflet (maps) + axios. Components in `frontend/src/components/` (Login, Register, OfferRide, RequestRide, AcceptedRides, RideList, NotificationList, etc.).
- `frontend/src/config.js` holds `API_BASE_URL` (currently hardcoded to the Railway production backend; a commented localhost line is provided for local dev) plus `callApi`/`getCsrfToken` helpers that attach the Bearer token from `localStorage` and CSRF cookie.

### Deployment
Railway (see `RAILWAY_DEPLOYMENT.md`, `Procfile`, `railway.json`, `gunicorn_config.py`, `startup.sh`). Production DB is Postgres via `DATABASE_URL`; static via `STATIC_ROOT`/staticfiles.

## Repo hazards
- Many stale scratch artifacts at repo root and in `rides/`: `views.py.bak*`, `views.py.broken`, `serializers.py.bak`, plus dozens of one-off `fix_*.py` / `test_*.py` / `check_*.py` scripts. The live code is `rides/views.py`, `rides/serializers.py`, etc. — ignore the `.bak`/`.broken` siblings.
- `venv/` and `db.sqlite3` are committed and show up in `git status`; don't include their churn in commits.
