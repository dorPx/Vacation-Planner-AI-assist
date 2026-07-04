export interface SearchParams {
  destination: string;
  checkin: string;
  checkout: string;
  /** Occupancy — passed through to providers with occupancy-aware pricing (Booking.com, Hotels.com). */
  adults?: number;
  children?: number;
  rooms?: number;
  budget_min?: number;
  budget_max?: number;
  rating_min?: number;
  amenities?: string[];
  trip_type?: string;
  radius_km?: number;
  lat?: number;
  lng?: number;
  /** Flying-from city/airport — flights are only searched when this is present. */
  origin?: string;
}

export interface HotelResult {
  id: string;
  name: string;
  price_per_night: number;
  rating: number;
  review_count: number;
  amenities: string[];
  lat: number;
  lng: number;
  /** Straight-line distance from the searched destination's center, km. Absent when coords are unknown. */
  distance_km?: number;
  image_url: string;
  source: string;
  booking_url: string;
}

export interface ActivityResult {
  id: string;
  name: string;
  category: string;
  price: number;
  rating: number;
  duration_hours: number;
  lat: number;
  lng: number;
  description: string;
  source: string;
}

export interface FlightResult {
  id: string;
  airline: string;
  price: number;
  departure: string;
  arrival: string;
  duration_minutes: number;
  stops: number;
  source: string;
}

export interface RestaurantResult {
  id: string;
  name: string;
  cuisine: string;
  price_level: number;
  rating: number;
  lat: number;
  lng: number;
  source: string;
}

export interface ItineraryDay {
  day: number;
  date: string;
  hotel?: HotelResult;
  activities: ActivityResult[];
  meals: RestaurantResult[];
  estimated_cost: number;
}

export interface TripItinerary {
  id: string;
  name: string;
  destination: string;
  days: ItineraryDay[];
  total_cost: number;
  trip_type: string;
}

export interface TripSummary {
  id: string;
  name: string;
  destination: string;
  start_date: string;
  end_date: string;
  trip_type: string;
  created_at: string;
}
