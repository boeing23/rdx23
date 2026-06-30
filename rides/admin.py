from django.contrib import admin
from .models import Ride, RideRequest, Notification, PendingRideRequest

@admin.register(Ride)
class RideAdmin(admin.ModelAdmin):
    list_display = ('driver', 'start_location', 'end_location', 'departure_time', 'available_seats', 'status')
    list_filter = ('status', 'departure_time', 'available_seats')
    search_fields = ('start_location', 'end_location', 'driver__username')
    readonly_fields = ('created_at', 'updated_at')

@admin.register(RideRequest)
class RideRequestAdmin(admin.ModelAdmin):
    list_display = ('rider', 'ride', 'pickup_location', 'dropoff_location', 'seats_needed', 'status', 'created_at')
    list_filter = ('status', 'created_at', 'seats_needed')
    search_fields = ('pickup_location', 'dropoff_location', 'rider__username', 'ride__driver__username')
    readonly_fields = ('created_at', 'updated_at')

@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ('id', 'recipient', 'sender', 'notification_type', 'is_read', 'created_at')
    list_filter = ('notification_type', 'is_read')
    search_fields = ('recipient__username', 'sender__username', 'message')

@admin.register(PendingRideRequest)
class PendingRideRequestAdmin(admin.ModelAdmin):
    list_display = ('id', 'rider', 'pickup_location', 'dropoff_location', 'departure_time', 'seats_needed', 'status', 'created_at')
    list_filter = ('status',)
    search_fields = ('pickup_location', 'dropoff_location', 'rider__username')
