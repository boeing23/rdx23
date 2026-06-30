"""
Robustness suite for ride matching: does the system pair riders with the right
drivers across realistic scenarios, and correctly refuse bad pairings?

Drives the real rider-request flow (RideRequestViewSet.create) over the API.
Only the ORS network call is mocked (deterministic straight-line routes).

Result legend per scenario:
  201 + match_details  -> rider matched to a driver
  202                  -> no match, stored as PendingRideRequest
"""
from unittest.mock import patch

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from geopy.distance import great_circle
from rest_framework.test import APIClient

from .models import Ride, PendingRideRequest
from users.models import User
from .tests import fake_route


@patch("rides.views.get_route_details", side_effect=fake_route)
@patch("rides.models.get_route_details", side_effect=fake_route)
class RobustnessTest(TestCase):
    # East-west corridor (lat constant, lon varies).
    START = (-80.50, 37.23)   # (lon, lat)
    END = (-80.00, 37.23)

    def setUp(self):
        self.driver = User.objects.create_user(
            username="d", password="pw", user_type="DRIVER", phone_number="1",
            first_name="Dee", last_name="Driver",
        )
        self.rider = User.objects.create_user(
            username="r", password="pw", user_type="RIDER", phone_number="2",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.rider)

    # helpers -----------------------------------------------------------------
    def _ride(self, driver=None, start=None, end=None, seats=3, hours=1):
        return Ride.objects.create(
            driver=driver or self.driver,
            start_location="A", end_location="B",
            start_longitude=(start or self.START)[0], start_latitude=(start or self.START)[1],
            end_longitude=(end or self.END)[0], end_latitude=(end or self.END)[1],
            departure_time=timezone.now() + timezone.timedelta(hours=hours),
            available_seats=seats, status="SCHEDULED",
        )

    def _request(self, pickup, dropoff, seats=1, hours=1):
        payload = {
            "pickup_location": "P", "dropoff_location": "D",
            "pickup_longitude": pickup[0], "pickup_latitude": pickup[1],
            "dropoff_longitude": dropoff[0], "dropoff_latitude": dropoff[1],
            "seats_needed": seats,
            "departure_time": (timezone.now() + timezone.timedelta(hours=hours)).isoformat(),
        }
        return self.client.post(reverse("ride-request-list"), payload, format="json")

    # scenarios: SHOULD match -------------------------------------------------
    def test_identical_route_matches(self, *_):
        self._ride()
        r = self._request(pickup=(-80.49, 37.23), dropoff=(-80.01, 37.23))
        self.assertEqual(r.status_code, 201, f"identical route should match: {r.data}")

    def test_midroute_matches(self, *_):
        self._ride()
        r = self._request(pickup=(-80.40, 37.231), dropoff=(-80.10, 37.231))
        self.assertEqual(r.status_code, 201, f"mid-route should match: {r.data}")

    def test_short_subsegment_matches(self, *_):
        self._ride()
        r = self._request(pickup=(-80.30, 37.231), dropoff=(-80.25, 37.231))
        self.assertEqual(r.status_code, 201, f"short on-route segment should match: {r.data}")

    def test_best_of_multiple_drivers_selected(self, *_):
        # Good: exactly on corridor. Meh: shifted ~450m north (worse score).
        good = self._ride()
        meh = self._ride(start=(-80.50, 37.234), end=(-80.00, 37.234))
        r = self._request(pickup=(-80.40, 37.23), dropoff=(-80.10, 37.23))
        self.assertEqual(r.status_code, 201, f"should match: {r.data}")
        self.assertEqual(r.data["match_details"]["ride_id"], good.id,
                         "should pick the closer (higher-score) driver")

    # scenarios: SHOULD NOT match --------------------------------------------
    def test_opposite_direction_no_match(self, *_):
        self._ride()
        # rider travels east->west (reverse of driver west->east)
        r = self._request(pickup=(-80.10, 37.231), dropoff=(-80.40, 37.231))
        self.assertEqual(r.status_code, 202, f"opposite direction should NOT match: {r.data}")

    def test_far_off_route_no_match(self, *_):
        self._ride()
        r = self._request(pickup=(-80.40, 40.00), dropoff=(-80.10, 40.00))
        self.assertEqual(r.status_code, 202, f"far off route should NOT match: {r.data}")

    def test_perpendicular_no_match(self, *_):
        self._ride()
        # north-south rider crossing the east-west corridor
        r = self._request(pickup=(-80.25, 37.10), dropoff=(-80.25, 37.40))
        self.assertEqual(r.status_code, 202, f"perpendicular should NOT match: {r.data}")

    def test_insufficient_seats_no_match(self, *_):
        self._ride(seats=1)
        r = self._request(pickup=(-80.40, 37.231), dropoff=(-80.10, 37.231), seats=4)
        self.assertEqual(r.status_code, 202, f"too many seats should NOT match: {r.data}")

    def test_self_match_excluded(self, *_):
        # The only ride belongs to the rider themselves.
        self._ride(driver=self.rider)
        r = self._request(pickup=(-80.40, 37.231), dropoff=(-80.10, 37.231))
        self.assertEqual(r.status_code, 202, f"rider should not match their own ride: {r.data}")

    # scenario: time window ---------------------------------------------------
    def test_far_apart_in_time_no_match(self, *_):
        # Same route, but driver leaves in 10h while rider wants to leave in 1h.
        self._ride(hours=10)
        r = self._request(pickup=(-80.40, 37.231), dropoff=(-80.10, 37.231), hours=1)
        self.assertEqual(r.status_code, 202,
                         f"rides ~9h apart should NOT match on time: {r.data}")
