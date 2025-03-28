# ChalBe

A carpooling application that helps users find and share rides easily.

## Features

- User Authentication (Drivers and Riders)
- Profile Management
- Ride Management
- Route Matching using geopy
- Rating System
- Interactive Maps
- Real-time Notifications

## Tech Stack

- Backend: Django + Django REST Framework
- Database: PostgreSQL
- Geolocation: geopy
- Authentication: JWT tokens

## Prerequisites

- Python 3.8+
- PostgreSQL
- Virtual Environment

## Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd carpool-system
```

2. Create and activate virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Create a `.env` file in the project root with the following variables:
```
DEBUG=True
SECRET_KEY=your-secret-key-here
DATABASE_URL=postgres://user:password@localhost:5432/carpool_db
ALLOWED_HOSTS=localhost,127.0.0.1
GEOCODING_API_KEY=your-geocoding-api-key
MAPBOX_ACCESS_TOKEN=your-mapbox-token
```

5. Create the database:
```bash
createdb carpool_db
```

6. Apply migrations:
```bash
python manage.py migrate
```

7. Create a superuser:
```bash
python manage.py createsuperuser
```

## Running the Development Server

```bash
python manage.py runserver
```

The API will be available at `http://localhost:8002/api/`

## API Endpoints

### Authentication
- `POST /api/auth/token/`: Obtain JWT token
- `POST /api/auth/token/refresh/`: Refresh JWT token

### Users
- `GET /api/users/`: List users
- `POST /api/users/`: Register new user
- `GET /api/users/me/`: Get current user profile
- `PUT /api/users/update_profile/`: Update user profile
- `POST /api/users/{id}/rate_user/`: Rate a user
- `GET /api/users/{id}/ratings/`: Get user ratings

### Rides
- `GET /api/rides/`: List rides
- `POST /api/rides/`: Create new ride
- `GET /api/rides/search/`: Search rides
- `POST /api/rides/{id}/update_status/`: Update ride status
- `GET /api/rides/{id}/`: Get ride details

### Ride Requests
- `GET /api/ride-requests/`: List ride requests
- `POST /api/ride-requests/`: Create ride request
- `POST /api/ride-requests/{id}/update_status/`: Update request status

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is licensed under the MIT License. 