from django.contrib import admin
from .models import Ride, RideRequest

@admin.register(Ride)
class RideAdmin(admin.ModelAdmin):
    list_display = ('driver', 'start_location', 'end_location', 'departure_time', 'available_seats', 'price_per_seat', 'status')
    list_filter = ('status', 'departure_time', 'available_seats')
    search_fields = ('start_location', 'end_location', 'driver__username')
    readonly_fields = ('created_at', 'updated_at')

@admin.register(RideRequest)
class RideRequestAdmin(admin.ModelAdmin):
    list_display = ('rider', 'ride', 'pickup_location', 'dropoff_location', 'seats_needed', 'status', 'created_at')
    list_filter = ('status', 'created_at', 'seats_needed')
    search_fields = ('pickup_location', 'dropoff_location', 'rider__username', 'ride__driver__username')
    readonly_fields = ('created_at', 'updated_at')
