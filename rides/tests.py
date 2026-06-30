"""
Integration tests for the ride-matching flow.

These exercise the real models, serializers, and RideRequestViewSet.create()
logic end to end. Only the OpenRouteService network call (get_route_details) is
mocked, with a deterministic straight-line route, so the tests are offline and
reproducible.
"""
from unittest.mock import patch

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from geopy.distance import great_circle
from rest_framework.test import APIClient

from .models import Ride, RideRequest, PendingRideRequest
from users.models import User


def fake_route(start_coords, end_coords, *args, **kwargs):
    """Stub for get_route_details. Coords are (lon, lat). Returns a 50-point
    straight-line geometry plus duration/distance, matching the real shape."""
    (s_lon, s_lat), (e_lon, e_lat) = start_coords, end_coords
    n = 50
    geometry = [
        [s_lon + (e_lon - s_lon) * i / n, s_lat + (e_lat - s_lat) * i / n]
        for i in range(n + 1)
    ]
    distance = great_circle((s_lat, s_lon), (e_lat, e_lon)).meters
    return {"geometry": geometry, "duration": int(distance / 13), "distance": distance}


# Patch get_route_details wherever it is imported and used.
@patch("rides.views.get_route_details", side_effect=fake_route)
@patch("rides.models.get_route_details", side_effect=fake_route)
class MatchingFlowTest(TestCase):
    # A roughly E-W driver route around Blacksburg, VA (lat constant, lon varies).
    DRIVER_START = (-80.50, 37.23)   # (lon, lat)
    DRIVER_END = (-80.00, 37.23)

    def setUp(self):
        self.driver = User.objects.create_user(
            username="driver1", password="pw", user_type="DRIVER", phone_number="1",
            first_name="Dee", last_name="River",
        )
        self.rider = User.objects.create_user(
            username="rider1", password="pw", user_type="RIDER", phone_number="2",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.rider)

    def _make_ride(self, **overrides):
        data = dict(
            driver=self.driver,
            start_location="A", end_location="B",
            start_longitude=self.DRIVER_START[0], start_latitude=self.DRIVER_START[1],
            end_longitude=self.DRIVER_END[0], end_latitude=self.DRIVER_END[1],
            departure_time=timezone.now() + timezone.timedelta(hours=1),
            available_seats=3, status="SCHEDULED",
        )
        data.update(overrides)
        return Ride.objects.create(**data)

    def _request_payload(self, pickup, dropoff):
        """pickup/dropoff are (lon, lat)."""
        return {
            "pickup_location": "P", "dropoff_location": "D",
            "pickup_longitude": pickup[0], "pickup_latitude": pickup[1],
            "dropoff_longitude": dropoff[0], "dropoff_latitude": dropoff[1],
            "seats_needed": 1,
            "departure_time": (timezone.now() + timezone.timedelta(hours=1)).isoformat(),
        }

    # --- model-level ---------------------------------------------------------

    def test_ride_save_populates_geometry(self, *_):
        ride = self._make_ride()
        self.assertTrue(ride.route_geometry, "Ride.save() should populate route_geometry")
        self.assertGreater(len(ride.route_geometry), 1)
        self.assertIsNotNone(ride.route_distance)

    def test_ensure_route_geometry_backfills_when_null(self, *_):
        ride = self._make_ride()
        # Simulate a ride created during an ORS outage: wipe geometry in the DB.
        Ride.objects.filter(pk=ride.pk).update(
            route_geometry=None, route_distance=None, route_duration=None
        )
        ride.refresh_from_db()
        self.assertIsNone(ride.route_geometry)

        geom = ride.ensure_route_geometry()
        self.assertTrue(geom, "ensure_route_geometry should backfill geometry")
        ride.refresh_from_db()
        self.assertTrue(ride.route_geometry, "backfilled geometry should be persisted")

    # --- request flow --------------------------------------------------------

    def test_midroute_request_matches(self, *_):
        """The previously-broken case: pickup/dropoff in the MIDDLE of the
        driver's route along the same direction should match."""
        self._make_ride()
        payload = self._request_payload(
            pickup=(-80.40, 37.231),   # on route, ~1/5 along
            dropoff=(-80.10, 37.231),  # on route, ~4/5 along
        )
        url = reverse("ride-request-list")
        resp = self.client.post(url, payload, format="json")

        self.assertEqual(resp.status_code, 201, f"expected match (201), got {resp.status_code}: {resp.data}")
        self.assertIn("match_details", resp.data)
        self.assertGreaterEqual(resp.data["match_details"]["compatibility_score"], 60)
        self.assertEqual(RideRequest.objects.count(), 1)

    def test_unmatchable_request_becomes_pending(self, *_):
        """A request far from any route should produce a PendingRideRequest (202)."""
        self._make_ride()
        payload = self._request_payload(
            pickup=(-80.40, 40.00),    # far north, off route
            dropoff=(-80.10, 40.00),
        )
        url = reverse("ride-request-list")
        resp = self.client.post(url, payload, format="json")

        self.assertEqual(resp.status_code, 202, f"expected pending (202), got {resp.status_code}: {resp.data}")
        self.assertEqual(RideRequest.objects.count(), 0)
        self.assertEqual(PendingRideRequest.objects.count(), 1)

    def test_match_backfills_missing_geometry(self, *_):
        """A ride whose geometry got wiped (ORS outage at creation) should still
        match after lazy backfill, instead of being permanently skipped."""
        ride = self._make_ride()
        Ride.objects.filter(pk=ride.pk).update(route_geometry=None)

        payload = self._request_payload(pickup=(-80.40, 37.231), dropoff=(-80.10, 37.231))
        url = reverse("ride-request-list")
        resp = self.client.post(url, payload, format="json")

        self.assertEqual(resp.status_code, 201, f"expected match after backfill, got {resp.status_code}: {resp.data}")
        ride.refresh_from_db()
        self.assertTrue(ride.route_geometry, "geometry should have been backfilled during matching")
